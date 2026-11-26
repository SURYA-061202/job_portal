import { onCall, HttpsError } from "firebase-functions/v2/https";
import { createHash, randomInt, timingSafeEqual, verify, X509Certificate, type KeyObject } from "crypto";
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { gunzipSync } from "zlib";
import type { Timestamp as FirestoreTimestamp } from "firebase-admin/firestore";
import { DAY, enforceLimit, firestore, requireStaff, str, Timestamp } from "./security";
import { normalizeMobile } from "./mobileOtp";
import { sendOtpSms } from "./sms";

/**
 * Aadhaar check for recruiters, without a paid KYC provider:
 *   1. the browser reads the Secure QR from the recruiter's own e-Aadhaar,
 *   2. UIDAI's digital signature on it is verified here,
 *   3. its name and mobile must match the recruiter's profile,
 *   4. an SMS code goes to that mobile.
 * This is NOT UIDAI's Aadhaar OTP authentication (licensed agencies only).
 * The full Aadhaar number is not in the QR; photo, address and date of birth
 * are never stored. Only these functions write users/{uid}.aadhaarKyc.
 */

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
/** Each request costs an SMS, so keep the daily allowance small. */
const REQUESTS_PER_DAY = 5;
/** RSA-2048 signature at the end of the QR payload. */
const SIGNATURE_BYTES = 256;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const otpRef = (uid: string) => firestore().collection("kyc_otps").doc(uid);
const identityRef = (hash: string) => firestore().collection("kyc_identities").doc(hash);

/** UIDAI public certificates placed in functions/certs (see the README there). */
function uidaiKeys(): KeyObject[] {
  const dir = join(__dirname, "..", "certs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(cer|crt|pem)$/i.test(f))
    .map((f) => new X509Certificate(readFileSync(join(dir, f))).publicKey);
}

export interface SecureQr {
  name: string;
  dob: string;
  gender: string;
  /** Last four digits of the Aadhaar number. */
  aadhaarLast4: string;
  /** Newer QR codes carry the mobile's last four digits... */
  mobileLast4: string;
  /** ...older ones carry a hash of the whole number. */
  mobileHashes: string[];
  /** Last Aadhaar digit: how many times the older mobile hash is applied. */
  hashRounds: number;
}

/** Decodes the QR's digit string and rejects anything UIDAI did not sign. */
export function readSecureQr(qr: string, keys: KeyObject[]): SecureQr {
  const invalid = () => new HttpsError("invalid-argument", "This is not a valid Aadhaar Secure QR code.");
  if (!/^\d{500,12000}$/.test(qr)) throw invalid();

  let data: Buffer;
  try {
    let hex = BigInt(qr).toString(16);
    if (hex.length % 2) hex = `0${hex}`;
    data = gunzipSync(Buffer.from(hex, "hex"), { maxOutputLength: 1_000_000 });
  } catch {
    throw invalid();
  }
  if (data.length <= SIGNATURE_BYTES) throw invalid();

  const signed = data.subarray(0, data.length - SIGNATURE_BYTES);
  const signature = data.subarray(data.length - SIGNATURE_BYTES);
  if (!keys.some((key) => verify("RSA-SHA256", signed, key, signature))) {
    throw new HttpsError("invalid-argument", "The UIDAI signature on this QR code could not be verified.");
  }

  // Text fields are separated by byte 255; the photo and hashes follow them.
  const fields: string[] = [];
  for (let start = 0; fields.length < 18 && start < signed.length; ) {
    const end = signed.indexOf(255, start);
    if (end === -1) break;
    fields.push(signed.toString("latin1", start, end));
    start = end + 1;
  }
  const versioned = /^V\d$/.test(fields[0] || "");
  const offset = versioned ? 1 : 0;
  const [indicator, referenceId, name, dob, gender] = fields.slice(offset, offset + 5);
  if (!name || !referenceId || !/^\d{4}/.test(referenceId)) throw invalid();

  const aadhaarLast4 = referenceId.slice(0, 4);
  const hasMobileHash = !versioned && (indicator === "2" || indicator === "3");
  const tail = (from: number) => signed.subarray(signed.length - from, signed.length - from + 32).toString("hex");

  return {
    name,
    dob: dob || "",
    gender: gender || "",
    aadhaarLast4,
    mobileLast4: versioned && /^\d{4}$/.test(fields[17] || "") ? fields[17] : "",
    mobileHashes: hasMobileHash ? [tail(32), tail(64)] : [],
    hashRounds: Number(aadhaarLast4[3]) || 1,
  };
}

/** Lower-case letters and single spaces; the client uses the same rule. */
export const normalizeName = (value: unknown): string =>
  String(value || "").toLowerCase().replace(/[^a-z]+/g, " ").trim();

/** Every part of the profile name must be on the Aadhaar (initials allowed). */
export function namesMatch(profileName: string, aadhaarName: string): boolean {
  const profile = normalizeName(profileName).split(" ").filter(Boolean);
  const left = normalizeName(aadhaarName).split(" ").filter(Boolean);
  const required = Math.min(2, left.length);
  if (profile.length < required || !profile.some((p) => p.length >= 3)) return false;

  // Whole words first, so an initial cannot take a word another part needs.
  return [...profile]
    .sort((a, b) => b.length - a.length)
    .every((part) => {
      const i = left.findIndex((w) => w === part || (part.length === 1 && w.startsWith(part)));
      if (i === -1) return false;
      left.splice(i, 1);
      return true;
    });
}

export function mobileMatches(qr: SecureQr, mobile: string): boolean {
  if (qr.mobileLast4) return mobile.endsWith(qr.mobileLast4);
  let hash = mobile;
  for (let i = 0; i < qr.hashRounds; i++) hash = sha256(hash);
  return qr.mobileHashes.includes(hash);
}

async function recruiterProfile(uid: string) {
  const data = (await firestore().collection("users").doc(uid).get()).data() || {};
  return {
    name: `${data.firstName || ""} ${data.lastName || ""}`.trim(),
    mobile: normalizeMobile(data.mobile),
  };
}

async function requireRecruiter(request: Parameters<typeof requireStaff>[0]) {
  const caller = await requireStaff(request);
  if (caller.role === "admin") {
    throw new HttpsError("permission-denied", "Aadhaar verification is for recruiter accounts.");
  }
  return caller;
}

/** Step 1: check the QR against the profile and text a code to the mobile. */
export const startAadhaarKyc = onCall(async (request) => {
  const { uid } = await requireRecruiter(request);
  const body = (request.data || {}) as { qr?: unknown; consent?: unknown };
  if (body.consent !== true) {
    throw new HttpsError("failed-precondition", "Your consent is needed to check your Aadhaar.");
  }

  const keys = uidaiKeys();
  if (keys.length === 0 || !process.env.SMS_API_KEY) {
    console.error(`Aadhaar KYC not configured: certificates=${keys.length}, sms=${Boolean(process.env.SMS_API_KEY)}`);
    throw new HttpsError("failed-precondition", "Aadhaar verification is not set up yet. Please contact the admin.");
  }

  const qr = readSecureQr(str(body.qr, 12001), keys);
  const profile = await recruiterProfile(uid);
  if (!profile.mobile) {
    throw new HttpsError("failed-precondition", "Add your Aadhaar-linked mobile number to your profile first.");
  }
  if (!namesMatch(profile.name, qr.name)) {
    throw new HttpsError("failed-precondition", "Your profile name does not match the name on this Aadhaar.");
  }
  if (!qr.mobileLast4 && qr.mobileHashes.length === 0) {
    throw new HttpsError("failed-precondition", "This QR has no mobile details. Download a new e-Aadhaar and try again.");
  }
  if (!mobileMatches(qr, profile.mobile)) {
    throw new HttpsError("failed-precondition", "Your profile mobile number is not the one linked to this Aadhaar.");
  }

  const identity = sha256([normalizeName(qr.name), qr.dob, qr.gender, qr.aadhaarLast4].join("|"));
  const owner = (await identityRef(identity).get()).data()?.uid;
  if (owner && owner !== uid) {
    throw new HttpsError("already-exists", "This Aadhaar has already verified another account.");
  }

  const last = (await otpRef(uid).get()).data() as { createdAt?: FirestoreTimestamp } | undefined;
  if (last?.createdAt && Date.now() - last.createdAt.toMillis() < RESEND_COOLDOWN_MS) {
    throw new HttpsError("resource-exhausted", "A code was just sent. Please wait a minute.");
  }
  await enforceLimit(`kyc-sms:${uid}`, REQUESTS_PER_DAY, DAY, "Too many codes today. Please try again tomorrow.");

  const code = String(randomInt(100000, 1000000));
  await otpRef(uid).set({
    codeHash: sha256(code),
    attempts: 0,
    createdAt: Timestamp().now(),
    expiresAt: Timestamp().fromMillis(Date.now() + OTP_TTL_MS),
    mobile: profile.mobile,
    name: normalizeName(profile.name),
    identity,
    aadhaarLast4: qr.aadhaarLast4,
  });

  try {
    // No email: this code must reach the phone and nowhere else.
    await sendOtpSms({ mobile: profile.mobile, code });
  } catch (err) {
    console.error("startAadhaarKyc SMS error", err);
    await otpRef(uid).delete();
    throw new HttpsError("internal", "Could not send the SMS. Please try again.");
  }
  return { mobileLast4: profile.mobile.slice(-4) };
});

/** Step 2: check the code and mark the recruiter verified. */
export const confirmAadhaarKyc = onCall(async (request) => {
  const { uid } = await requireRecruiter(request);
  const code = str((request.data as { code?: unknown })?.code, 6);
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "Enter the 6-digit code.");

  const profile = await recruiterProfile(uid);

  // Failures are returned, not thrown, so the attempt count is still saved.
  const problem = await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(otpRef(uid));
    const otp = snap.data() as
      | { codeHash: string; attempts: number; expiresAt: FirestoreTimestamp; mobile: string; name: string; identity: string; aadhaarLast4: string }
      | undefined;
    if (!otp || otp.expiresAt.toMillis() < Date.now()) return "This code has expired. Please start again.";
    if (otp.attempts >= MAX_ATTEMPTS) return "Too many incorrect attempts. Please start again.";
    if (!timingSafeEqual(Buffer.from(otp.codeHash, "hex"), Buffer.from(sha256(code), "hex"))) {
      tx.update(otpRef(uid), { attempts: otp.attempts + 1 });
      return "Incorrect code.";
    }
    if (otp.mobile !== profile.mobile || otp.name !== normalizeName(profile.name)) {
      return "Your name or mobile number changed. Please start again.";
    }
    const owner = (await tx.get(identityRef(otp.identity))).data()?.uid;
    if (owner && owner !== uid) return "This Aadhaar has already verified another account.";

    const now = Timestamp().now();
    tx.set(identityRef(otp.identity), { uid, createdAt: now });
    tx.update(firestore().collection("users").doc(uid), {
      aadhaarKyc: { status: "verified", verifiedAt: now, aadhaarLast4: otp.aadhaarLast4, mobile: otp.mobile, name: otp.name },
    });
    tx.delete(otpRef(uid));
    return null;
  });

  if (problem) throw new HttpsError("failed-precondition", problem);
  return { success: true };
});
