import { onCall, HttpsError } from "firebase-functions/v2/https";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Best-effort in-memory throttle (per instance only). Signup calls this before
// an account exists, so auth-based limits are not available yet.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 15;
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
 * Checks whether a mailbox actually exists (not just that the address is
 * well-formed) via AbstractAPI's email validation endpoint, which performs an
 * SMTP-level probe on the recipient's mail server.
 *
 * Returns:
 *   exists: true  - the mailbox was verified to exist
 *   exists: false - the mail server rejected the mailbox (does not exist)
 *   exists: null  - unknown (no API key configured, API error, timeout);
 *                   callers should allow signup rather than block a real user.
 */
export const verifyEmailExists = onCall(async (request) => {
  const email = String((request.data as { email?: unknown })?.email || "").trim();
  if (!EMAIL_REGEX.test(email)) {
    throw new HttpsError("invalid-argument", "Invalid email address");
  }

  const callerKey = request.auth?.uid || request.rawRequest?.ip || "anonymous";
  if (isThrottled(callerKey)) {
    throw new HttpsError("resource-exhausted", "Too many verification requests. Please wait a minute and try again.");
  }

  const apiKey = process.env.ABSTRACT_EMAIL_API_KEY;
  if (!apiKey) {
    return { exists: null as boolean | null };
  }

  try {
    const url =
      `https://emailvalidation.abstractapi.com/v1/?api_key=${encodeURIComponent(apiKey)}` +
      `&email=${encodeURIComponent(email)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.error("verifyEmailExists: API responded", res.status);
      return { exists: null as boolean | null };
    }

    const data = (await res.json()) as {
      is_smtp_valid?: { result?: boolean | null };
      error?: unknown;
    };
    if (data?.error) {
      return { exists: null as boolean | null };
    }

    const smtpValid = data?.is_smtp_valid?.result;
    return { exists: typeof smtpValid === "boolean" ? smtpValid : null as boolean | null };
  } catch (err) {
    console.error("verifyEmailExists error", err);
    return { exists: null as boolean | null };
  }
});
