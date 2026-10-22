import { onCall, HttpsError } from "firebase-functions/v2/https";
import { createHash, timingSafeEqual } from "crypto";
import type { Timestamp } from "firebase-admin/firestore";

// Lazy-loaded at call time: firebase-admin's Firestore/Auth SDKs are heavy,
// and loading them at module scope risks the 10s deployment-analysis timeout.
const adminFirestore = () => require("firebase-admin/firestore") as typeof import("firebase-admin/firestore");
const adminAuth = () => require("firebase-admin/auth") as typeof import("firebase-admin/auth");
const otpMailer = () => require("./mailer") as typeof import("./mailer");
const mobileUtil = () => require("./mobileOtp") as typeof import("./mobileOtp");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

// Best-effort in-memory throttle (per instance only). Signup runs before an
// account exists, so auth-based limits are not available yet.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;
const recent = new Map<string, number[]>();

function isThrottled(key: string): boolean {
  const now = Date.now();
  const hits = (recent.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) return true;
  hits.push(now);
  recent.set(key, hits);
  return false;
}

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

const otpDoc = (email: string) => adminFirestore().getFirestore().collection("signupOtps").doc(email);

/**
 * Step 1 of signup: validates the address, rejects emails that already have
 * an account, stores a hashed 6-digit code (10-minute TTL, 5 attempts) and
 * emails it. The Firebase auth account is NOT created here - the client
 * calls verifySignupOtp first and only then completes registration.
 */
export const sendSignupOtp = onCall(async (request) => {
  const email = String((request.data as { email?: unknown })?.email || "").trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    throw new HttpsError("invalid-argument", "Invalid email address");
  }

  const rawMobile = String((request.data as { mobile?: unknown })?.mobile || "").trim();
  const mobile = mobileUtil().normalizeMobile(rawMobile);
  if (!mobile) {
    throw new HttpsError("invalid-argument", "Please enter a valid 10-digit mobile number.");
  }

  const callerKey = request.rawRequest?.ip || "anonymous";
  if (isThrottled(callerKey)) {
    throw new HttpsError("resource-exhausted", "Too many requests. Please wait a minute and try again.");
  }

  try {
    await adminAuth().getAuth().getUserByEmail(email);
    throw new HttpsError("failed-precondition", "An account with this email already exists. Please sign in instead.");
  } catch (err: unknown) {
    if (err instanceof HttpsError) throw err;
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") {
      // Lookup failed for another reason: do not block signup, just log it.
      console.error("sendSignupOtp getUserByEmail error", err);
    }
  }

  // Block signup when the mobile number is already on another account.
  // Matches the raw input as well as the normalized 10-digit form so older
  // profile docs stored with "+91"/"0" prefixes are caught too.
  const candidates = Array.from(new Set([rawMobile, mobile].filter(Boolean)));
  try {
    const dupeSnap = await adminFirestore()
      .getFirestore()
      .collection("users")
      .where("mobile", "in", candidates)
      .limit(1)
      .get();
    if (!dupeSnap.empty) {
      throw new HttpsError(
        "failed-precondition",
        "This mobile number is already registered with another account. Please use a different number or sign in instead."
      );
    }
  } catch (err: unknown) {
    if (err instanceof HttpsError) throw err;
    console.error("sendSignupOtp mobile lookup error", err);
  }

  const ref = otpDoc(email);
  const existing = await ref.get();
  if (existing.exists) {
    const createdAtMs = (existing.data() as { createdAt?: Timestamp })?.createdAt?.toMillis?.() ?? 0;
    if (Date.now() - createdAtMs < OTP_RESEND_COOLDOWN_MS) {
      throw new HttpsError("resource-exhausted", "A code was just sent. Please wait a minute before requesting a new one.");
    }
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await ref.set({
    email,
    mobile,
    codeHash: hash(code),
    attempts: 0,
    createdAt: adminFirestore().Timestamp.now(),
    expiresAt: adminFirestore().Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
  });

  const html = `
      <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
        <h2 style="color:#ff6600;">Verify Your Email</h2>
        <p>Hi there,</p>
        <p>Use the code below to verify <strong>${email}</strong> and finish creating your Indian Infra Jobs account:</p>
        <p style="text-align:center;margin:28px 0;">
          <span style="display:inline-block;background:#f8fafc;border:1px dashed #94a3b8;border-radius:8px;padding:14px 28px;font-size:30px;font-weight:bold;letter-spacing:12px;color:#0f172a;font-family:Consolas,Menlo,monospace;">${code}</span>
        </p>
        <p style="color:#64748b;font-size:14px;">This code expires in 10 minutes and can be used 5 times. If you did not request this, you can safely ignore this email &mdash; no account will be created.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
        <p style="color:#94a3b8;font-size:12px;">Best regards,<br/>Indian Infra Jobs Team</p>
      </div>
    `;

  try {
    await otpMailer().sendMail({ to: email, subject: "Your verification code – Indian Infra Jobs", html });
  } catch (err) {
    console.error("sendSignupOtp sendMail error", err);
    await ref.delete().catch(() => undefined);
    throw new HttpsError("internal", "Failed to send the verification email. Please try again.");
  }

  return { success: true };
});

/**
 * Step 2 of signup: checks the code the user typed against the stored hash.
 * On success the code is consumed (deleted) so it cannot be reused - the
 * client then creates the Firebase auth account and profile document.
 */
export const verifySignupOtp = onCall(async (request) => {
  const data = request.data as { email?: unknown; code?: unknown };
  const email = String(data?.email || "").trim().toLowerCase();
  const code = String(data?.code || "").trim();
  if (!EMAIL_REGEX.test(email)) {
    throw new HttpsError("invalid-argument", "Invalid email address");
  }
  if (!/^\d{6}$/.test(code)) {
    throw new HttpsError("invalid-argument", "Enter the 6-digit verification code.");
  }

  const ref = otpDoc(email);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "No verification code found. Please request a new one.");
  }

  const doc = snap.data() as { codeHash?: string; attempts?: number; expiresAt?: Timestamp; mobile?: string };
  if (!doc?.expiresAt || doc.expiresAt.toMillis() < Date.now()) {
    await ref.delete().catch(() => undefined);
    throw new HttpsError("not-found", "This code has expired. Please request a new one.");
  }

  // Re-check the mobile number right before the account is created, so a
  // number that became taken while the user was typing the email code still
  // blocks registration.
  const mobile = mobileUtil().normalizeMobile(doc.mobile);
  if (mobile) {
    const dupeSnap = await adminFirestore()
      .getFirestore()
      .collection("users")
      .where("mobile", "==", mobile)
      .limit(1)
      .get();
    if (!dupeSnap.empty) {
      await ref.delete().catch(() => undefined);
      throw new HttpsError(
        "failed-precondition",
        "This mobile number is already registered with another account. Please use a different number or sign in instead."
      );
    }
  }

  const attempts = Number(doc.attempts || 0);
  if (attempts >= OTP_MAX_ATTEMPTS) {
    await ref.delete().catch(() => undefined);
    throw new HttpsError("failed-precondition", "Too many incorrect attempts. Please request a new code.");
  }

  const expected = Buffer.from(String(doc.codeHash || ""), "hex");
  const provided = Buffer.from(hash(code), "hex");
  const matches = expected.length === provided.length && timingSafeEqual(expected, provided);
  if (!matches) {
    const next = attempts + 1;
    if (next >= OTP_MAX_ATTEMPTS) {
      await ref.delete().catch(() => undefined);
      throw new HttpsError("failed-precondition", "Too many incorrect attempts. Please request a new code.");
    }
    await ref.update({ attempts: next });
    throw new HttpsError("invalid-argument", `Incorrect code. ${OTP_MAX_ATTEMPTS - next} attempt(s) remaining.`);
  }

  await ref.delete().catch(() => undefined);
  return { success: true };
});
