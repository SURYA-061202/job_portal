import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { createHmac, timingSafeEqual } from "crypto";
import type { Timestamp as FsTimestamp } from "firebase-admin/firestore";
import { cleanId, enforceLimit, firestore, HOUR, requireAuth, str, Timestamp } from "./security";

/**
 * Recruiter subscriptions paid through Razorpay.
 *
 *   1. createSubscriptionOrder   - the browser asks for an order. The price comes
 *                                  from the plan in Firestore, never from the client.
 *   2. Razorpay Checkout         - the recruiter pays (UPI, card, net banking, wallet).
 *   3. verifySubscriptionPayment - the browser hands back the signed payment; we check
 *                                  the signature, confirm with Razorpay and grant the plan.
 *   4. razorpayWebhook           - Razorpay tells us directly too, so a recruiter who
 *                                  closes the tab right after paying still gets the plan.
 *
 * Steps 3 and 4 both end in grantPaidPlan(), which runs in a transaction and only
 * ever grants once per order.
 *
 * Config (functions/.env): RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET.
 * `payments/{orderId}` is written only here; clients may read their own (firestore.rules).
 */

const RZP_API = "https://api.razorpay.com/v1";
const PAYMENTS = "payments";
const PLANS = "subscription_plans";
const DAY_MS = 86_400_000;

type PaymentStatus = "created" | "paid" | "failed";

/** The plan terms as they were when the order was created. This is what gets granted. */
interface PlanSnapshot {
  planId: string;
  planName: string;
  level: number;
  audience: "recruiter" | "user";
  price: number;
  durationDays: number;
  maxPosts: number;
  maxCandidates: number;
  privileges: Record<string, boolean>;
}

interface PaymentDoc {
  orderId: string;
  userId: string;
  userEmail: string;
  userName: string;
  plan: PlanSnapshot;
  /** In paise. */
  amount: number;
  currency: string;
  status: PaymentStatus;
  razorpayPaymentId?: string;
  method?: string;
  failureReason?: string;
  expiresAt?: FsTimestamp;
  grantedBy?: "checkout" | "webhook";
  createdAt: FsTimestamp;
  paidAt?: FsTimestamp;
}

/* ------------------------------------------------------------------ *
 * Razorpay REST helpers (no SDK needed: Node 22 has fetch)
 * ------------------------------------------------------------------ */

function keys() {
  const keyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) {
    console.error("Razorpay keys are not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in functions/.env)");
    throw new HttpsError("failed-precondition", "Online payments are not available right now. Please try again later.");
  }
  return { keyId, keySecret };
}

async function razorpay<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { keyId, keySecret } = keys();
  const res = await fetch(`${RZP_API}${path}`, {
    method: init.method || "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    console.error(`Razorpay ${init.method || "GET"} ${path} failed`, res.status, json?.error);
    throw new HttpsError("unavailable", "The payment service did not respond. Please try again.");
  }
  return json as T;
}

interface RzpOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

interface RzpPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method?: string;
  error_description?: string | null;
}

/** Constant-time compare of two hex HMACs. */
function sameHmac(expectedHex: string, givenHex: string): boolean {
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(String(givenHex || ""), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Razorpay's checkout signature: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function checkoutSignatureValid(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
  return sameHmac(expected, signature);
}

/** Razorpay's webhook signature: HMAC_SHA256(raw request body, webhook_secret). */
export function webhookSignatureValid(rawBody: Buffer | string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return sameHmac(expected, signature);
}

/* ------------------------------------------------------------------ *
 * Granting the plan
 * ------------------------------------------------------------------ */

const audienceOfRole = (role: unknown): "recruiter" | "user" =>
  role === "recruiter" || role === "manager" || role === "admin" ? "recruiter" : "user";

const displayName = (u: Record<string, any>) => `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "Recruiter";

const formatDate = (d: Date) =>
  d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;

interface GrantResult {
  planName: string;
  expiresAt: Date;
  /** False when the order had already been granted (a retry or the webhook arriving second). */
  newlyGranted: boolean;
}

/**
 * Marks the order paid and writes the plan onto users/{uid}.subscription, once.
 * Same plan still active: the new period is added to its current end date.
 * Different plan: it replaces the current one from today (mirrors the admin flow).
 */
async function grantPaidPlan(orderId: string, payment: RzpPayment, via: "checkout" | "webhook"): Promise<GrantResult> {
  const db = firestore();
  const ts = Timestamp();
  const payRef = db.collection(PAYMENTS).doc(orderId);

  const result = await db.runTransaction(async (tx) => {
    const paySnap = await tx.get(payRef);
    if (!paySnap.exists) throw new HttpsError("not-found", "Unknown order.");
    const pay = paySnap.data() as PaymentDoc;

    if (pay.status === "paid") {
      return {
        planName: pay.plan.planName,
        expiresAt: pay.expiresAt?.toDate() ?? new Date(),
        newlyGranted: false,
        pay,
      };
    }
    if (payment.order_id !== orderId || payment.amount !== pay.amount || payment.currency !== pay.currency) {
      console.error("Payment does not match order", { orderId, payment: payment.id, amount: payment.amount, expected: pay.amount });
      throw new HttpsError("failed-precondition", "The payment does not match this order.");
    }

    const userRef = db.collection("users").doc(pay.userId);
    const userSnap = await tx.get(userRef);
    const current = userSnap.data()?.subscription as { planId?: string; expiresAt?: FsTimestamp } | undefined;
    const currentEnd = current?.expiresAt?.toDate?.();
    const base =
      current?.planId === pay.plan.planId && currentEnd && currentEnd.getTime() > Date.now() ? currentEnd : new Date();
    const expiresAt = new Date(base.getTime() + pay.plan.durationDays * DAY_MS);

    tx.update(userRef, {
      subscription: {
        planId: pay.plan.planId,
        planName: pay.plan.planName,
        level: pay.plan.level,
        maxPosts: pay.plan.maxPosts,
        maxCandidates: pay.plan.maxCandidates,
        privileges: pay.plan.privileges ?? {},
        startedAt: ts.now(),
        expiresAt: ts.fromDate(expiresAt),
        paymentOrderId: orderId,
      },
    });
    tx.update(payRef, {
      status: "paid",
      razorpayPaymentId: payment.id,
      method: payment.method || null,
      paidAt: ts.now(),
      expiresAt: ts.fromDate(expiresAt),
      grantedBy: via,
      failureReason: null,
    });

    return { planName: pay.plan.planName, expiresAt, newlyGranted: true, pay };
  });

  if (result.newlyGranted) await notifyPaid(result.pay, result.expiresAt);
  return { planName: result.planName, expiresAt: result.expiresAt, newlyGranted: result.newlyGranted };
}

/** Recruiter: "your plan is active". Admins: "X bought Y". Best-effort, never throws. */
async function notifyPaid(pay: PaymentDoc, expiresAt: Date): Promise<void> {
  try {
    const db = firestore();
    const now = Timestamp().now();
    const batch = db.batch();
    const base = { read: false, viewed: false, createdAt: now };
    const until = formatDate(expiresAt);

    if (pay.userEmail) {
      batch.set(db.collection("notifications").doc(), {
        ...base,
        userId: pay.userEmail.toLowerCase(),
        type: "subscription_activated",
        title: "Subscription Activated",
        message: `Payment of ${rupees(pay.amount)} received. Your ${pay.plan.planName} subscription is active until ${until}.`,
        metadata: { orderId: pay.orderId, planId: pay.plan.planId },
      });
    }

    const admins = await db.collection("users").where("role", "==", "admin").get();
    admins.docs.forEach((a) => {
      const email = a.data()?.email;
      if (!email) return;
      batch.set(db.collection("notifications").doc(), {
        ...base,
        userId: String(email).trim().toLowerCase(),
        type: "subscription_purchased",
        title: "New Subscription Payment",
        message: `${pay.userName} (${pay.userEmail}) paid ${rupees(pay.amount)} for the ${pay.plan.planName} plan, active until ${until}.`,
        metadata: { orderId: pay.orderId, planId: pay.plan.planId, recruiterId: pay.userId },
      });
    });
    await batch.commit();
  } catch (err) {
    console.error("notifyPaid failed", err);
  }
}

/** Fetches the payment from Razorpay and captures it if it is only authorized. */
async function confirmedPayment(paymentId: string): Promise<RzpPayment> {
  let payment = await razorpay<RzpPayment>(`/payments/${encodeURIComponent(paymentId)}`);
  if (payment.status === "authorized") {
    payment = await razorpay<RzpPayment>(`/payments/${encodeURIComponent(paymentId)}/capture`, {
      method: "POST",
      body: { amount: payment.amount, currency: payment.currency },
    });
  }
  if (payment.status !== "captured") {
    throw new HttpsError("failed-precondition", payment.error_description || "The payment was not completed.");
  }
  return payment;
}

/* ------------------------------------------------------------------ *
 * 1. Create an order
 * ------------------------------------------------------------------ */

export const createSubscriptionOrder = onCall(async (request) => {
  const uid = requireAuth(request);
  const planId = cleanId((request.data as { planId?: unknown })?.planId, "plan");
  await enforceLimit(`pay-order:${uid}`, 20, HOUR, "Too many payment attempts. Please try again in an hour.");

  const db = firestore();
  const [userSnap, planSnap] = await Promise.all([db.collection("users").doc(uid).get(), db.collection(PLANS).doc(planId).get()]);
  const user = userSnap.data();
  if (!user) throw new HttpsError("failed-precondition", "Your profile could not be found.");
  if (user.role === "admin") throw new HttpsError("failed-precondition", "Admins already have full access.");

  const plan = planSnap.data();
  if (!planSnap.exists || !plan || plan.active === false) {
    throw new HttpsError("not-found", "This plan is no longer available.");
  }
  const audience = (plan.audience ?? "recruiter") as "recruiter" | "user";
  if (audience !== audienceOfRole(user.role)) {
    throw new HttpsError("permission-denied", "This plan is not available for your account.");
  }
  const price = Number(plan.price);
  const durationDays = Number(plan.durationDays);
  if (!Number.isFinite(price) || price <= 0) {
    throw new HttpsError("failed-precondition", "This plan is not sold online. Please request it from the admin.");
  }
  if (!Number.isInteger(durationDays) || durationDays < 1) {
    throw new HttpsError("failed-precondition", "This plan is not set up correctly. Please contact the admin.");
  }

  const amount = Math.round(price * 100);
  const currency = "INR";
  const userEmail = String(user.email || request.auth?.token.email || "").trim().toLowerCase();
  const userName = displayName(user);

  const order = await razorpay<RzpOrder>("/orders", {
    method: "POST",
    body: {
      amount,
      currency,
      // Razorpay caps receipts at 40 characters.
      receipt: `sub_${uid.slice(0, 20)}_${Date.now().toString(36)}`.slice(0, 40),
      notes: { userId: uid, planId, planName: str(plan.name, 100), purpose: "subscription" },
    },
  });

  const snapshot: PlanSnapshot = {
    planId,
    planName: String(plan.name || "Subscription"),
    level: Number(plan.level) || 1,
    audience,
    price,
    durationDays,
    maxPosts: typeof plan.maxPosts === "number" ? plan.maxPosts : -1,
    maxCandidates: typeof plan.maxCandidates === "number" ? plan.maxCandidates : -1,
    privileges: plan.privileges ?? {},
  };
  const doc: PaymentDoc = {
    orderId: order.id,
    userId: uid,
    userEmail,
    userName,
    plan: snapshot,
    amount: order.amount,
    currency: order.currency,
    status: "created",
    createdAt: Timestamp().now(),
  };
  await db.collection(PAYMENTS).doc(order.id).set(doc);

  return {
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId: keys().keyId,
    planName: snapshot.planName,
    durationDays,
    prefill: {
      name: userName,
      email: userEmail,
      contact: str(user.phone || user.mobile || user.phoneNumber || "", 20),
    },
  };
});

/* ------------------------------------------------------------------ *
 * 2. Verify the payment the browser hands back
 * ------------------------------------------------------------------ */

export const verifySubscriptionPayment = onCall(async (request) => {
  const uid = requireAuth(request);
  const data = (request.data || {}) as { orderId?: unknown; paymentId?: unknown; signature?: unknown };
  const orderId = cleanId(data.orderId, "order");
  const paymentId = cleanId(data.paymentId, "payment");
  const signature = str(data.signature, 128);
  await enforceLimit(`pay-verify:${uid}`, 60, HOUR);

  const paySnap = await firestore().collection(PAYMENTS).doc(orderId).get();
  const pay = paySnap.data() as PaymentDoc | undefined;
  if (!pay || pay.userId !== uid) throw new HttpsError("not-found", "Unknown order.");

  // Already granted (a retry, or the webhook got here first): nothing left to check.
  if (pay.status === "paid") {
    return { planName: pay.plan.planName, expiresAtMs: pay.expiresAt?.toMillis() ?? Date.now() };
  }

  if (!checkoutSignatureValid(orderId, paymentId, signature, keys().keySecret)) {
    throw new HttpsError("permission-denied", "Payment verification failed. If money was debited, it will be activated or refunded automatically.");
  }
  const payment = await confirmedPayment(paymentId);
  const granted = await grantPaidPlan(orderId, payment, "checkout");
  return { planName: granted.planName, expiresAtMs: granted.expiresAt.getTime() };
});

/* ------------------------------------------------------------------ *
 * 3. Webhook (Razorpay -> us)
 * ------------------------------------------------------------------ */

/**
 * Dashboard -> Settings -> Webhooks. URL: the deployed URL of this function.
 * Secret: same value as RAZORPAY_WEBHOOK_SECRET. Events: payment.captured, payment.failed, order.paid.
 */
export const razorpayWebhook = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }
  const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  const signature = String(req.header("x-razorpay-signature") || "");
  if (!secret || !req.rawBody || !webhookSignatureValid(req.rawBody, signature, secret)) {
    console.warn("razorpayWebhook: bad or missing signature");
    res.status(400).send("Invalid signature");
    return;
  }

  const event = req.body as { event?: string; payload?: { payment?: { entity?: RzpPayment } } };
  const payment = event.payload?.payment?.entity;
  const orderId = payment?.order_id;

  try {
    if (payment && orderId && (event.event === "payment.captured" || event.event === "order.paid")) {
      const exists = (await firestore().collection(PAYMENTS).doc(orderId).get()).exists;
      // Orders not created by createSubscriptionOrder are not ours to grant.
      if (exists && payment.status === "captured") await grantPaidPlan(orderId, payment, "webhook");
    } else if (payment && orderId && event.event === "payment.failed") {
      const ref = firestore().collection(PAYMENTS).doc(orderId);
      await firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        // A later attempt on the same order may still succeed; never downgrade a paid order.
        if (snap.exists && (snap.data() as PaymentDoc).status === "created") {
          tx.update(ref, { status: "failed", failureReason: str(payment.error_description || "Payment failed", 300), razorpayPaymentId: payment.id });
        }
      });
    }
    res.status(200).send("ok");
  } catch (err) {
    // A non-2xx makes Razorpay retry, which is what we want for a transient failure.
    console.error("razorpayWebhook error", err);
    res.status(500).send("error");
  }
});
