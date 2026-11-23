import { onSchedule } from "firebase-functions/v2/scheduler";
import { escapeHtml as esc, firestore, isEmail, safeBaseUrl, Timestamp } from "./security";
import { claim, dayKey, daysBetween, formatExpiry, TIME_ZONE, toDate } from "./expiryReminders";
import { notifyClosingSoon } from "./postCandidateNotify";

/**
 * Daily 9:30 AM IST sweep of job posts (recruits/{id}).
 *
 *  - A post still `active` past its `expiresAt` is marked `expired` and its
 *    owner gets an in-app notification. (The app also treats such a post as
 *    expired the moment the date passes, so candidates never see it in the
 *    gap; this run makes the stored status catch up and tells the recruiter.)
 *  - An active post 3 days and 1 day from expiry gets an in-app reminder, and
 *    one email per expiry (3 days out; 2 or 1 if that run was missed).
 *  - Within its last three days, job seekers who saved the post or opened it
 *    without applying are told it is closing (postCandidateNotify.ts). Telling
 *    applicants and savers once a post has ended is that file's `postEnded`
 *    trigger, which fires when this sweep flips the status to `expired`.
 *
 * Posts with no `status` (created before lifecycles) and paused/closed posts
 * are never touched: only `status == "active"` is queried, which needs no
 * composite index. Every send is claimed in `expiry_reminders` first (the key
 * carries the post and its expiry date), so a retry can never double-send and a
 * reposted post (new expiry date) gets fresh reminders.
 */

/** Days before expiry that get an in-app reminder. */
const REMIND_DAYS = [3, 1];
/** The email goes out once, on or after this many days before expiry. */
const EMAIL_BEFORE_DAYS = 3;

/** Lazy-loaded at call time (see index.ts: the 10s deployment-analysis budget). */
const mailer = () => require("./mailer") as typeof import("./mailer");

type PostData = FirebaseFirestore.DocumentData;

/** The owner's address: stored on the post, else read from their profile. */
export async function ownerEmail(post: PostData): Promise<string> {
    const stored = String(post.recruiterEmail || "").trim().toLowerCase();
    if (isEmail(stored)) return stored;
    if (!post.recruiterId) return "";
    const user = await firestore().collection("users").doc(String(post.recruiterId)).get();
    const fromProfile = String(user.data()?.email || "").trim().toLowerCase();
    return isEmail(fromProfile) ? fromProfile : "";
}

function expiringEmail(opts: { name: string; title: string; expiresOn: string; daysLeft: number; url: string }): string {
    const { name, title, expiresOn, daysLeft, url } = opts;
    return `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
        <h2 style="color:#f97316;">Your job post expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}</h2>
        <p>Hi ${esc(name)},</p>
        <p>Your post <strong>${esc(title)}</strong> stops accepting applications on <strong>${esc(expiresOn)}</strong>. After that, candidates can no longer see it or apply.</p>
        <p>To keep it running, extend the expiry from the Posts tab. If it does expire you can repost it at any time and keep all its applicants.</p>
        <p style="margin-top:24px;">
          <a href="${esc(url)}" style="background:#f97316;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">
            Manage my posts
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">Best regards,<br/>Indian Infra Recruitment Team</p>
      </div>
    `;
}

export const postLifecycleSweep = onSchedule(
    { schedule: "30 9 * * *", timeZone: TIME_ZONE },
    async () => {
        const db = firestore();
        const now = new Date();
        const today = dayKey(now);
        const appUrl = safeBaseUrl();

        const active = await db.collection("recruits").where("status", "==", "active").get();

        let expired = 0;
        let reminded = 0;
        let emailed = 0;
        let candidatesNotified = 0;

        for (const doc of active.docs) {
            try {
                const post = doc.data() as PostData;
                const expiresAt = toDate(post.expiresAt);
                if (!expiresAt) continue; // no expiry: runs until the recruiter closes it

                const title = String(post.jobTitle || "your job post");
                const expiryKey = dayKey(expiresAt);

                if (expiresAt.getTime() <= now.getTime()) {
                    // Flip inside a transaction: a recruiter may have extended or
                    // reposted since the query ran, and that must win.
                    const flipped = await db.runTransaction(async (tx) => {
                        const fresh = (await tx.get(doc.ref)).data() as PostData | undefined;
                        const freshExpiry = toDate(fresh?.expiresAt);
                        if (!fresh || fresh.status !== "active" || !freshExpiry || freshExpiry.getTime() > Date.now()) return false;
                        tx.update(doc.ref, { status: "expired", expiredAt: Timestamp().now() });
                        return true;
                    });
                    if (!flipped) continue;
                    expired += 1;

                    const to = await ownerEmail(post);
                    if (to && (await claim(`post_${doc.id}_${expiryKey}_expired`))) {
                        await db.collection("notifications").doc().set({
                            userId: to,
                            type: "post_expired",
                            title: "Your job post has expired",
                            message: `"${title}" is no longer visible to candidates. Repost it from the Posts tab to run it again - its applicants are kept.`,
                            metadata: { postId: doc.id, jobTitle: title },
                            read: false,
                            viewed: false,
                            createdAt: Timestamp().now(),
                        });
                    }
                    continue;
                }

                const remaining = daysBetween(today, expiryKey);
                if (remaining < 1 || remaining > EMAIL_BEFORE_DAYS) continue;

                // Job seekers who saved or opened it (and haven't applied) hear it is closing.
                try {
                    candidatesNotified += await notifyClosingSoon(doc.id, post, expiryKey, remaining);
                } catch (err) {
                    console.error("postLifecycleSweep: closing-soon notices failed for", doc.id, err);
                }

                const to = await ownerEmail(post);
                if (!to) continue;
                const expiresOn = formatExpiry(expiresAt);

                if (REMIND_DAYS.includes(remaining) && (await claim(`post_${doc.id}_${expiryKey}_d${remaining}`))) {
                    await db.collection("notifications").doc().set({
                        userId: to,
                        type: "post_expiring",
                        title: remaining === 1 ? "A job post expires tomorrow" : `A job post expires in ${remaining} days`,
                        message: `"${title}" expires on ${expiresOn}. Extend it from the Posts tab to keep it open to candidates.`,
                        metadata: { postId: doc.id, jobTitle: title, daysLeft: remaining, expiresOn },
                        read: false,
                        viewed: false,
                        createdAt: Timestamp().now(),
                    });
                    reminded += 1;
                }

                if (await claim(`post_${doc.id}_${expiryKey}_email`)) {
                    const name = String(post.recruiterName || "").trim() || to;
                    await mailer().sendMail({
                        to,
                        subject: remaining === 1 ? `"${title}" expires tomorrow` : `"${title}" expires in ${remaining} days`,
                        html: expiringEmail({ name, title, expiresOn, daysLeft: remaining, url: `${appUrl}/dashboard` }),
                    });
                    emailed += 1;
                }
            } catch (err) {
                // One broken post must not abort the rest of the sweep.
                console.error("postLifecycleSweep: skipped post", doc.id, err);
            }
        }

        console.log(
            `postLifecycleSweep ${today}: ${active.size} active post(s) checked, ` +
            `${expired} expired, ${reminded} reminder(s), ${emailed} email(s), ${candidatesNotified} job-seeker notice(s)`
        );
    }
);
