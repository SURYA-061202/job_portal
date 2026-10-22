import { onCall, HttpsError } from "firebase-functions/v2/https";

// Lazy-loaded at call time: firebase-admin's Firestore/Auth SDKs are heavy,
// and loading them at module scope risks the 10s deployment-analysis timeout.
const adminFirestore = () => require("firebase-admin/firestore") as typeof import("firebase-admin/firestore");
const adminAuth = () => require("firebase-admin/auth") as typeof import("firebase-admin/auth");

const MOBILE_RE = /^[6-9]\d{9}$/;

// Specific user-facing warnings (kept identical on client and server).
const INVALID_MOBILE_MSG =
  "That is not a valid Indian mobile number. Enter a 10-digit number starting with 6-9 (e.g., 9876543210).";
const MOBILE_TAKEN_MSG =
  "This mobile number is already registered to another account. Please use a different number or sign in to that account.";

// Best-effort in-memory throttle (per instance only).
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

/**
 * Normalizes an Indian mobile number to its 10-digit form (strips spaces,
 * "+91", "91" and leading "0" prefixes) so uniqueness checks compare like
 * with like. Returns "" when the result is not a valid 10-digit number.
 */
export function normalizeMobile(raw: unknown): string {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return MOBILE_RE.test(digits) ? digits : "";
}

/**
 * Duplicate-number guard for profile edits: called before a changed mobile
 * is saved so the user finds out immediately instead of at verify time.
 * Checks raw and common prefixed forms so legacy profile entries match too.
 * The verify path re-checks anyway, which closes any race.
 */
export const checkMobileAvailable = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in to update your mobile number.");
  }
  const uid = request.auth.uid;

  if (isThrottled(uid)) {
    throw new HttpsError("resource-exhausted", "Too many requests. Please wait a minute and try again.");
  }

  const raw = String((request.data as { mobile?: unknown })?.mobile || "").trim();
  if (!raw) {
    // Empty input — nothing to check; the profile allows clearing a number.
    return { available: true };
  }
  const mobile = normalizeMobile(raw);
  if (!mobile) {
    throw new HttpsError("invalid-argument", INVALID_MOBILE_MSG);
  }

  const candidates = Array.from(
    new Set([raw, mobile, `0${mobile}`, `+91${mobile}`, `91${mobile}`].filter(Boolean))
  );
  const fs = adminFirestore().getFirestore();
  const dupe = await fs.collection("users").where("mobile", "in", candidates).limit(2).get();
  if (dupe.docs.some((d) => d.id !== uid)) {
    throw new HttpsError("failed-precondition", MOBILE_TAKEN_MSG);
  }
  return { available: true };
});

/**
 * Called after the client has completed Firebase Phone Auth (reCAPTCHA +
 * SMS) and linked the phone credential to its own account. SMS codes are
 * sent and checked by Google, so this function never sees a code — instead
 * it re-reads the linked number from the Auth backend, where a client
 * cannot place it without a real SMS round-trip, confirms it matches both
 * the caller's profile and the number they claim, enforces one account per
 * number, and then sets users/{uid}.mobileVerified as the sole writer.
 */
export const confirmMobileVerified = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Please sign in to verify your mobile number.");
  }
  const uid = request.auth.uid;

  if (isThrottled(uid)) {
    throw new HttpsError("resource-exhausted", "Too many requests. Please wait a minute and try again.");
  }

  const mobile = normalizeMobile((request.data as { mobile?: unknown })?.mobile);
  if (!mobile) {
    throw new HttpsError("invalid-argument", INVALID_MOBILE_MSG);
  }

  // The phone provider only shows up here after a verified SMS round-trip.
  let phoneProvider: { phoneNumber?: string | null; uid?: string } | undefined;
  try {
    const record = await adminAuth().getAuth().getUser(uid);
    phoneProvider = record.providerData.find((p) => p.providerId === "phone");
  } catch (err) {
    console.error("confirmMobileVerified getUser error", err);
    throw new HttpsError("internal", "Could not confirm your verification. Please try again.");
  }

  const linked = normalizeMobile(phoneProvider?.phoneNumber || phoneProvider?.uid);
  if (!linked) {
    throw new HttpsError("failed-precondition", "Phone verification not completed. Please request a new code.");
  }
  if (linked !== mobile) {
    throw new HttpsError("failed-precondition", "The verified number does not match your profile number. Please verify again.");
  }

  const fs = adminFirestore().getFirestore();
  const userSnap = await fs.collection("users").doc(uid).get();
  if (!userSnap.exists) {
    throw new HttpsError("failed-precondition", "No profile found for your account.");
  }
  const profileMobile = normalizeMobile(userSnap.data()?.mobile);
  if (!profileMobile) {
    throw new HttpsError("failed-precondition", "Add a valid mobile number to your profile first, then try again.");
  }
  if (profileMobile !== mobile) {
    throw new HttpsError("failed-precondition", "Your mobile number changed. Please verify the new number.");
  }

  // A number already claimed by another account cannot be verified here.
  const dupe = await fs.collection("users").where("mobile", "==", mobile).limit(2).get();
  if (dupe.docs.some((d) => d.id !== uid)) {
    throw new HttpsError("failed-precondition", MOBILE_TAKEN_MSG);
  }

  await fs.collection("users").doc(uid).update({
    mobileVerified: true,
    mobileVerifiedAt: adminFirestore().Timestamp.now(),
  });
  return { success: true };
});
