import { onSchedule } from "firebase-functions/v2/scheduler";
import { escapeHtml as esc, firestore, isEmail, safeBaseUrl, Timestamp } from "./security";

/**
 * Daily 9 AM IST sweep of staff subscriptions:
 *  - an in-app notification on each of the last five days before expiry (D-5..D-1);
 *  - one expiry email on D-2 (still sent on D-1 if the D-2 run was missed).
 *
 * Every send is claimed in `expiry_reminders` first (document id carries the
 * expiry date and the run date), so a retry or a renewed plan can never double
 * send. The collection is closed to clients by the catch-all firestore rule,
 * like `rate_limits`.
 */

/** Last N days before expiry that get the 9 AM notification. */
const NOTIFY_WINDOW_DAYS = 5;
/** Day before expiry the email targets; the window below keeps it resilient. */
const EMAIL_BEFORE_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = "Asia/Kolkata";

/** Lazy-loaded at call time (see index.ts: the 10s deployment-analysis budget). */
const mailer = () => require("./mailer") as typeof import("./mailer");

/** Calendar day in IST as YYYY-MM-DD, so "2 days left" matches what the user reads. */
function dayKey(date: Date): string {
    return date.toLocaleDateString("en-CA", { timeZone: TIME_ZONE });
}

function daysBetween(fromKey: string, toKey: string): number {
    return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);
}

/** Timestamp | {seconds} | ISO string | millis — the shapes expiresAt has held. */
function toDate(value: unknown): Date | null {
    if (!value) return null;
    const v = value as { toDate?: () => Date; seconds?: number };
    if (typeof v.toDate === "function") return v.toDate();
    if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
    const date = new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatExpiry(date: Date): string {
    return date.toLocaleDateString("en-GB", { timeZone: TIME_ZONE, day: "numeric", month: "short", year: "numeric" });
}

/** Claims a one-shot send. True only when this run created the log document. */
async function claim(key: string): Promise<boolean> {
    try {
        await firestore().collection("expiry_reminders").doc(key).create({ createdAt: Timestamp().now() });
        return true;
    } catch (err: any) {
        // 6 = ALREADY_EXISTS: another run (or another day for the same key) won.
        if (err?.code === 6 || err?.code === "already-exists") return false;
        // Fail closed: skipping is safer than mailing a recruiter twice; the
        // next day's run retries anything still inside its window.
        console.error("expiry_reminders claim failed", key, err);
        return false;
    }
}

function expiryEmail(opts: { name: string; planName: string; expiresOn: string; renewUrl: string }): string {
    const { name, planName, expiresOn, renewUrl } = opts;
    return `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
        <h2 style="color:#f97316;">Your subscription expires soon</h2>
        <p>Hi ${esc(name)},</p>
        <p>Your <strong>${esc(planName)}</strong> plan expires on <strong>${esc(expiresOn)}</strong>. Renew before then to keep your job posts, candidate access and credits without interruption.</p>
        <div style="background:#fff7ed;border:1px solid #fed7aa;padding:16px;border-radius:8px;margin:20px 0;">
          <p style="margin:0;font-weight:bold;color:#c2410c;">Expiry date</p>
          <p style="margin:8px 0 0;">${esc(expiresOn)}</p>
        </div>
        <p style="margin-top:24px;">
          <a href="${esc(renewUrl)}" style="background:#f97316;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
            Renew my plan
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">Best regards,<br/>Indian Infra Recruitment Team</p>
      </div>
    `;
}

export const subscriptionExpiryReminders = onSchedule(
    { schedule: `0 9 * * *`, timeZone: TIME_ZONE },
    async () => {
        const db = firestore();
        const today = dayKey(new Date());
        const appUrl = safeBaseUrl();

        // Subscription is a nested map on the user document, and no composite
        // index pairs role with expiresAt, so staff are loaded by role alone
        // (same pattern as AdminSubscriptionTab) and filtered in memory.
        const staff = await db
            .collection("users")
            .where("role", "in", ["recruiter", "manager", "admin"])
            .get();

        let notificationsSent = 0;
        let emailsSent = 0;

        for (const doc of staff.docs) {
            const data = doc.data() as Record<string, any>;
            try {
                const sub = data.subscription;
                if (!sub?.expiresAt) continue;

                const expiresAt = toDate(sub.expiresAt);
                if (!expiresAt) continue;

                const remaining = daysBetween(today, dayKey(expiresAt));
                // Already expired, or far enough away that neither rule fires.
                if (remaining < 1 || remaining > NOTIFY_WINDOW_DAYS) continue;

                const email = String(data.email || "").trim().toLowerCase();
                if (!isEmail(email)) continue;
                const name =
                    `${data.firstName || ""} ${data.lastName || ""}`.trim() || email;
                const planName = String(sub.planName || "subscription");
                const expiresOn = formatExpiry(expiresAt);

                // In-app notification on every day of the final five.
                const notifyClaimed = await claim(`${doc.id}_${dayKey(expiresAt)}_${today}_notify`);
                if (notifyClaimed) {
                    await db.collection("notifications").doc().set({
                        userId: email,
                        type: "subscription_expiring",
                        title:
                            remaining === 1
                                ? "Your plan expires tomorrow"
                                : `Your plan expires in ${remaining} days`,
                        message: `Your ${planName} plan expires on ${expiresOn}. Renew now to keep your posts, candidates and credits.`,
                        metadata: { planId: sub.planId || "", planName, expiresOn, daysLeft: remaining },
                        read: false,
                        viewed: false,
                        createdAt: Timestamp().now(),
                    });
                    notificationsSent += 1;
                }

                // One email per expiry, normally on D-2; D-1 catches a missed run.
                if (remaining <= EMAIL_BEFORE_DAYS) {
                    const emailClaimed = await claim(`${doc.id}_${dayKey(expiresAt)}_email`);
                    if (emailClaimed) {
                        await mailer().sendMail({
                            to: email,
                            subject:
                                remaining === 1
                                    ? `Your ${planName} plan expires tomorrow`
                                    : `Your ${planName} plan expires in ${remaining} days`,
                            html: expiryEmail({ name, planName, expiresOn, renewUrl: `${appUrl}/dashboard` }),
                        });
                        emailsSent += 1;
                    }
                }
            } catch (err) {
                // One broken account must not abort the rest of the sweep.
                console.error("subscriptionExpiryReminders: skipped user", doc.id, err);
            }
        }

        console.log(
            `subscriptionExpiryReminders ${today}: ${staff.size} staff checked, ` +
            `${notificationsSent} notification(s), ${emailsSent} email(s)`
        );
    }
);
