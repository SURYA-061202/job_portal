import { onCall, HttpsError } from "firebase-functions/v2/https";
import { createHash, timingSafeEqual } from "crypto";
import type { Timestamp } from "firebase-admin/firestore";
import { enforceLimit, escapeHtml as esc, firestore, HOUR, isEmail, requireStaff, Timestamp as TimestampOf } from "./security";

// Lazy-loaded like the other mail functions (see index.ts) to keep deployment analysis fast.
const mailer = () => require("./mailer") as typeof import("./mailer");

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

/** TEMPORARY: Gmail is accepted as the company email for now. Set to false to turn it off. */
const ALLOW_GMAIL = true;
const GMAIL = new Set(["gmail.com", "googlemail.com"]);

/** Personal mailboxes prove nothing about a company; mirrors src/lib/companyVerification.ts. */
const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "outlook.com", "hotmail.com",
  "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com", "rediffmail.com",
  "zoho.com", "gmx.com", "mail.com", "yandex.com",
]);

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
/** Closed to clients by the catch-all rule in firestore.rules; only these functions touch it. */
const codeDoc = (uid: string) => firestore().collection("company_email_codes").doc(uid);

/**
 * Step 1: emails a 6-digit code to the company address the recruiter typed, to
 * prove they can read mail at that domain. The code is stored hashed
 * (10-minute TTL, 5 attempts, one resend a minute).
 */
export const sendCompanyEmailCode = onCall(async (request) => {
  const caller = await requireStaff(request);
  const raw = (request.data as { email?: unknown })?.email;
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!isEmail(email)) throw new HttpsError("invalid-argument", "Enter a valid company email address.");
  const mailDomain = email.split("@")[1];
  if (!(ALLOW_GMAIL && GMAIL.has(mailDomain)) && FREE_MAIL.has(mailDomain)) {
    throw new HttpsError("invalid-argument", "Use your company email address, not a personal one like Yahoo or Outlook.");
  }

  await enforceLimit(`company-code:${caller.uid}`, 6, HOUR, "Too many codes requested. Please try again in an hour.");

  const ref = codeDoc(caller.uid);
  const existing = await ref.get();
  const createdAtMs = (existing.data() as { createdAt?: Timestamp } | undefined)?.createdAt?.toMillis?.() ?? 0;
  if (Date.now() - createdAtMs < RESEND_COOLDOWN_MS) {
    throw new HttpsError("resource-exhausted", "A code was just sent. Please wait a minute before requesting a new one.");
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const ts = TimestampOf();
  await ref.set({
    email,
    codeHash: hash(code),
    attempts: 0,
    createdAt: ts.now(),
    expiresAt: ts.fromMillis(Date.now() + CODE_TTL_MS),
  });

  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
        <h2 style="color:#ff6600;">Verify Your Company Email</h2>
        <p>Hi there,</p>
        <p>Use the code below to confirm that <strong>${esc(email)}</strong> is your company email on Indian Infra Jobs:</p>
        <p style="text-align:center;margin:28px 0;">
          <span style="display:inline-block;background:#f8fafc;border:1px dashed #94a3b8;border-radius:8px;padding:14px 28px;font-size:30px;font-weight:bold;letter-spacing:12px;color:#0f172a;font-family:Consolas,Menlo,monospace;">${code}</span>
        </p>
        <p style="color:#64748b;font-size:14px;">This code expires in 10 minutes. If you did not request it, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">Best regards,<br/>Indian Infra Jobs Team</p>
      </div>
    `;

  try {
    await mailer().sendMail({ to: email, subject: "Your company email code – Indian Infra Jobs", html });
  } catch (err) {
    console.error("sendCompanyEmailCode sendMail error", err);
    await ref.delete().catch(() => undefined);
    throw new HttpsError("internal", "Failed to send the verification email. Please try again.");
  }

  return { success: true };
});

/**
 * Step 2: checks the code. On success the address is recorded on the
 * recruiter's profile as `companyEmailVerified`. Only this function (Admin
 * SDK) can write that field - firestore.rules blocks clients from it and
 * refuses a verification request whose company email does not match it.
 */
export const verifyCompanyEmailCode = onCall(async (request) => {
  const caller = await requireStaff(request);
  const code = String((request.data as { code?: unknown })?.code ?? "").trim();
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "Enter the 6-digit code.");

  const ref = codeDoc(caller.uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "No code found. Please request a new one.");

  const doc = snap.data() as { email?: string; codeHash?: string; attempts?: number; expiresAt?: Timestamp };
  if (!doc.expiresAt || doc.expiresAt.toMillis() < Date.now()) {
    await ref.delete().catch(() => undefined);
    throw new HttpsError("not-found", "This code has expired. Please request a new one.");
  }

  const attempts = Number(doc.attempts || 0);
  if (attempts >= MAX_ATTEMPTS) {
    await ref.delete().catch(() => undefined);
    throw new HttpsError("failed-precondition", "Too many incorrect attempts. Please request a new code.");
  }

  const expected = Buffer.from(String(doc.codeHash || ""), "hex");
  const provided = Buffer.from(hash(code), "hex");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    const next = attempts + 1;
    if (next >= MAX_ATTEMPTS) {
      await ref.delete().catch(() => undefined);
      throw new HttpsError("failed-precondition", "Too many incorrect attempts. Please request a new code.");
    }
    await ref.update({ attempts: next });
    throw new HttpsError("invalid-argument", `Incorrect code. ${MAX_ATTEMPTS - next} attempt(s) remaining.`);
  }

  const email = String(doc.email || "");
  await firestore().collection("users").doc(caller.uid).update({ companyEmailVerified: email });
  await ref.delete().catch(() => undefined);
  return { success: true, email };
});
