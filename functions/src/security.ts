import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { createHash } from "crypto";

// Lazy-loaded: firebase-admin is heavy and module-scope loading risks the
// 10s deployment-analysis timeout (see index.ts).
const adminFirestore = () => require("firebase-admin/firestore") as typeof import("firebase-admin/firestore");
const adminAuth = () => require("firebase-admin/auth") as typeof import("firebase-admin/auth");

export const firestore = () => adminFirestore().getFirestore();
export const auth = () => adminAuth().getAuth();
export const Timestamp = () => adminFirestore().Timestamp;

export type Role = "user" | "recruiter" | "manager" | "admin";
const STAFF: Role[] = ["recruiter", "manager", "admin"];

export interface Caller {
  uid: string;
  role: Role | null;
  email: string;
}

/** Signed-in callers only. */
export function requireAuth(request: CallableRequest): string {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Please sign in to continue.");
  }
  return request.auth.uid;
}

async function loadCaller(request: CallableRequest): Promise<Caller> {
  const uid = requireAuth(request);
  const snap = await firestore().collection("users").doc(uid).get();
  const data = snap.data() as { role?: Role; email?: string } | undefined;
  return {
    uid,
    role: data?.role ?? null,
    email: String(data?.email || request.auth?.token.email || "").toLowerCase(),
  };
}

/** Recruiters, managers and admins. The role comes from Firestore, never from the client. */
export async function requireStaff(request: CallableRequest): Promise<Caller> {
  const caller = await loadCaller(request);
  if (!caller.role || !STAFF.includes(caller.role)) {
    throw new HttpsError("permission-denied", "This action is only available to recruiters.");
  }
  return caller;
}

export async function requireAdmin(request: CallableRequest): Promise<Caller> {
  const caller = await loadCaller(request);
  if (caller.role !== "admin") {
    throw new HttpsError("permission-denied", "This action is only available to admins.");
  }
  return caller;
}

export function clientIp(request: CallableRequest): string {
  return request.rawRequest?.ip || "unknown";
}

/**
 * Fixed-window rate limit kept in Firestore (`rate_limits`, closed to clients by
 * the rules), so it holds across function instances unlike an in-memory map.
 */
export async function enforceLimit(key: string, max: number, windowMs: number, message?: string): Promise<void> {
  const ref = firestore()
    .collection("rate_limits")
    .doc(createHash("sha256").update(key).digest("hex"));
  const now = Date.now();

  const allowed = await firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.data() as { count: number; windowStart: number } | undefined;
    if (!d || now - d.windowStart >= windowMs) {
      tx.set(ref, { count: 1, windowStart: now, key: key.split(":")[0] });
      return true;
    }
    if (d.count >= max) return false;
    tx.update(ref, { count: d.count + 1 });
    return true;
  });

  if (!allowed) {
    throw new HttpsError("resource-exhausted", message || "Too many requests. Please try again later.");
  }
}

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Escapes text before it is placed inside an HTML email. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EMAIL_REGEX = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']{2,}$/;
export const isEmail = (v: unknown): v is string => typeof v === "string" && v.length <= 254 && EMAIL_REGEX.test(v);

// Hosting sites of this project. Add custom domains with ALLOWED_ORIGINS
// (comma separated) in functions/.env; APP_BASE_URL picks the fallback.
const DEFAULT_ORIGINS = [
  "https://jobs-indianinfra.web.app",
  "https://jobs-indianinfra.firebaseapp.com",
  "https://recruitment-portal-7b629.web.app",
  "https://recruitment-portal-7b629.firebaseapp.com",
];

function allowedOrigins(): string[] {
  const extra = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  const primary = (process.env.APP_BASE_URL || "").trim().replace(/\/+$/, "");
  return [...(primary ? [primary] : []), ...extra, ...DEFAULT_ORIGINS];
}

/**
 * Links in emails must point at this app. The client sends its own origin, but a
 * caller could send anything, which would turn our mailer into a phishing relay.
 * Unknown origins are replaced with the primary one.
 */
export function safeBaseUrl(raw?: unknown): string {
  const allowed = allowedOrigins();
  try {
    const u = new URL(String(raw || ""));
    const isLocal = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (isLocal || allowed.includes(u.origin)) return u.origin;
  } catch {
    /* fall through */
  }
  return allowed[0];
}

/** A Firestore document id that came from outside: no slashes, dots or odd characters. */
export function cleanId(value: unknown, field = "id"): string {
  const id = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9_-]{4,128}$/.test(id)) {
    throw new HttpsError("invalid-argument", `Invalid ${field}.`);
  }
  return id;
}

/** Plain string with a length cap; anything else becomes "". */
export function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
