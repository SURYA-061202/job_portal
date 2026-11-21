import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { createHmac, timingSafeEqual } from "crypto";
import type { Timestamp as FsTimestamp } from "firebase-admin/firestore";
import { cleanId, enforceLimit, escapeHtml as esc, firestore, HOUR, isEmail, requireAuth, safeBaseUrl, str, Timestamp } from "./security";

const mailer = () => require("./mailer") as typeof import("./mailer");

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
  /** Credit points the plan gave when bought (the live plan's value wins in the app). */
  credits?: number;
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
  /** Issued once, in the same transaction that grants the plan. */
  invoice?: InvoiceDoc;
  /** Set when the recruiter was told the payment failed, so a retry never notifies twice. */
  failureNotifiedAt?: FsTimestamp;
}

/**
 * Everything needed to render the invoice later, frozen at payment time so a
 * renamed plan or an edited profile never changes an issued invoice.
 */
interface InvoiceDoc {
  /** INV-2026-000123: sequential per calendar year (IST). */
  number: string;
  issuedAt: FsTimestamp;
  seller: { name: string; address: string; gstin: string; email: string };
  billedTo: { name: string; email: string; company: string; phone: string };
  description: string;
  periodStart: FsTimestamp;
  periodEnd: FsTimestamp;
  /** In paise; the plan price, inclusive of any taxes. */
  amount: number;
  currency: string;
  method: string;
  razorpayPaymentId: string;
}

const COUNTERS = "counters";

/** Seller details printed on invoices (functions/.env). */
function invoiceSeller(): InvoiceDoc["seller"] {
  return {
    name: (process.env.INVOICE_SELLER_NAME || "Indian Infra Jobs").trim(),
    address: (process.env.INVOICE_SELLER_ADDRESS || "").trim(),
    gstin: (process.env.INVOICE_SELLER_GSTIN || "").trim(),
    email: (process.env.INVOICE_SELLER_EMAIL || "").trim(),
  };
}

/** Calendar year in India, which is what the invoice number counts by. */
const istYear = (d: Date) => Number(d.toLocaleString("en-IN", { year: "numeric", timeZone: "Asia/Kolkata" }));

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
    // Invoice numbers run 000001, 000002, ... per year, with no gaps: the counter
    // moves in the same transaction that marks the order paid.
    const now = new Date();
    const year = istYear(now);
    const counterRef = db.collection(COUNTERS).doc(`invoices_${year}`);
    const counterSnap = await tx.get(counterRef);
    const seq = (Number(counterSnap.data()?.last) || 0) + 1;

    const user = (userSnap.data() ?? {}) as Record<string, any>;
    const current = user.subscription as { planId?: string; expiresAt?: FsTimestamp } | undefined;
    const currentEnd = current?.expiresAt?.toDate?.();
    const base =
      current?.planId === pay.plan.planId && currentEnd && currentEnd.getTime() > Date.now() ? currentEnd : new Date();
    const expiresAt = new Date(base.getTime() + pay.plan.durationDays * DAY_MS);

    const invoice: InvoiceDoc = {
      number: `INV-${year}-${String(seq).padStart(6, "0")}`,
      issuedAt: ts.fromDate(now),
      seller: invoiceSeller(),
      billedTo: {
        name: pay.userName,
        email: pay.userEmail,
        company: str(user.companyName || user.company || "", 200),
        phone: str(user.phone || user.mobile || user.phoneNumber || "", 20),
      },
      description: `${pay.plan.planName} subscription - ${pay.plan.durationDays} days`,
      periodStart: ts.fromDate(base),
      periodEnd: ts.fromDate(expiresAt),
      amount: pay.amount,
      currency: pay.currency,
      method: payment.method || "",
      razorpayPaymentId: payment.id,
    };
    tx.set(counterRef, { last: seq, updatedAt: ts.now() }, { merge: true });

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
      invoice,
    });

    return { planName: pay.plan.planName, expiresAt, newlyGranted: true, pay: { ...pay, invoice } };
  });

  if (result.newlyGranted) await notifyPaid(result.pay, result.expiresAt);
  return { planName: result.planName, expiresAt: result.expiresAt, newlyGranted: result.newlyGranted };
}

/** The recruiter's notification address: the email on the order, else the profile's. */
async function recruiterEmail(pay: PaymentDoc): Promise<string> {
  if (pay.userEmail) return pay.userEmail.trim().toLowerCase();
  const email = (await firestore().collection("users").doc(pay.userId).get()).data()?.email;
  return email ? String(email).trim().toLowerCase() : "";
}

const rupees2 = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const METHOD_LABEL: Record<string, string> = {
  upi: "UPI",
  card: "Card",
  netbanking: "Net banking",
  wallet: "Wallet",
  emi: "EMI",
  paylater: "Pay later",
};
const methodLabel = (m: string) => METHOD_LABEL[m] || (m ? m.charAt(0).toUpperCase() + m.slice(1) : "Online");

/** The invoice as an email body. Mirrors the PDF the recruiter can download from Payment history. */
function invoiceEmail(pay: PaymentDoc, inv: InvoiceDoc): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;color:#64748b;">${esc(label)}</td><td style="padding:4px 0;text-align:right;color:#0f172a;">${esc(value)}</td></tr>`;
  const seller = [inv.seller.address, inv.seller.gstin ? `GSTIN: ${inv.seller.gstin}` : "", inv.seller.email]
    .filter(Boolean)
    .map((l) => `<div>${esc(l)}</div>`)
    .join("");
  const billed = [inv.billedTo.company, inv.billedTo.email, inv.billedTo.phone]
    .filter(Boolean)
    .map((l) => `<div>${esc(l)}</div>`)
    .join("");
  const appUrl = safeBaseUrl();

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;line-height:1.5;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
      <h2 style="color:#f97316;margin:0 0 4px;">Payment successful</h2>
      <p style="margin:0 0 20px;">Hi ${esc(pay.userName)}, thank you for your payment. Your <strong>${esc(pay.plan.planName)}</strong> plan is active until <strong>${esc(formatDate(inv.periodEnd.toDate()))}</strong>. Your invoice is below.</p>

      <table role="presentation" width="100%" style="border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="vertical-align:top;">
            <div style="font-size:20px;font-weight:bold;">INVOICE</div>
            <div style="color:#64748b;font-size:13px;">${esc(inv.number)}</div>
          </td>
          <td style="vertical-align:top;text-align:right;font-size:13px;color:#475569;">
            <div style="font-weight:bold;color:#0f172a;">${esc(inv.seller.name)}</div>${seller}
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <tr>
          <td style="vertical-align:top;width:50%;">
            <div style="color:#64748b;text-transform:uppercase;font-size:11px;letter-spacing:.05em;">Billed to</div>
            <div style="font-weight:bold;">${esc(inv.billedTo.name)}</div>${billed}
          </td>
          <td style="vertical-align:top;">
            <table role="presentation" width="100%" style="border-collapse:collapse;">
              ${row("Invoice date", formatDate(inv.issuedAt.toDate()))}
              ${row("Payment method", methodLabel(inv.method))}
              ${row("Status", "Paid")}
            </table>
          </td>
        </tr>
      </table>

      <table role="presentation" width="100%" style="border-collapse:collapse;font-size:13px;">
        <tr style="background:#f8fafc;">
          <th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0;">Description</th>
          <th style="text-align:left;padding:10px;border-bottom:1px solid #e2e8f0;">Period</th>
          <th style="text-align:right;padding:10px;border-bottom:1px solid #e2e8f0;">Amount</th>
        </tr>
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${esc(inv.description)}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${esc(formatDate(inv.periodStart.toDate()))} - ${esc(formatDate(inv.periodEnd.toDate()))}</td>
          <td style="padding:10px;border-bottom:1px solid #e2e8f0;text-align:right;">${esc(rupees2(inv.amount))}</td>
        </tr>
        <tr>
          <td colspan="2" style="padding:10px;text-align:right;font-weight:bold;">Total paid</td>
          <td style="padding:10px;text-align:right;font-weight:bold;">${esc(rupees2(inv.amount))}</td>
        </tr>
      </table>
      <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;text-align:right;">Inclusive of all applicable taxes.</p>

      <p style="margin-top:24px;font-size:13px;">You can download this invoice as a PDF any time from <strong>Subscription &rarr; Payment history</strong>${appUrl ? ` on <a href="${esc(appUrl)}" style="color:#f97316;">Indian Infra Jobs</a>` : ""}.</p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
      <p style="color:#94a3b8;font-size:12px;">Best regards,<br/>Indian Infra Recruitment Team</p>
    </div>
  `;
}

function failedEmail(pay: PaymentDoc, reason: string): string {
  const appUrl = safeBaseUrl();
  return `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#0f172a;line-height:1.6;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
      <h2 style="color:#dc2626;">Payment failed</h2>
      <p>Hi ${esc(pay.userName)},</p>
      <p>Your payment of <strong>${esc(rupees2(pay.amount))}</strong> for the <strong>${esc(pay.plan.planName)}</strong> plan could not be completed, so the plan has not been activated.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;padding:16px;border-radius:8px;margin:20px 0;">
        <p style="margin:0;font-weight:bold;color:#b91c1c;">Reason</p>
        <p style="margin:8px 0 0;">${esc(reason)}</p>
      </div>
      <p>If any money was debited, it will be refunded to your account automatically by your bank or Razorpay, usually within 5-7 working days.</p>
      ${appUrl ? `<p style="margin-top:24px;"><a href="${esc(appUrl)}" style="background:#f97316;color:#ffffff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Try again</a></p>` : ""}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
      <p style="color:#94a3b8;font-size:12px;">Best regards,<br/>Indian Infra Recruitment Team</p>
    </div>
  `;
}

/** Best-effort email; a mail outage never undoes a payment. */
async function sendPaymentMail(to: string, subject: string, html: string): Promise<void> {
  if (!isEmail(to)) return;
  try {
    await mailer().sendMail({ to, subject, html });
  } catch (err) {
    console.error("payment email failed", subject, err);
  }
}

/** Recruiter: "your plan is active" + invoice email. Admins: "X bought Y". Best-effort, never throws. */
async function notifyPaid(pay: PaymentDoc, expiresAt: Date): Promise<void> {
  let to = "";
  try {
    const db = firestore();
    const now = Timestamp().now();
    const batch = db.batch();
    const base = { read: false, viewed: false, createdAt: now };
    const until = formatDate(expiresAt);
    const invoiceNote = pay.invoice ? ` Invoice ${pay.invoice.number} has been emailed to you.` : "";
    to = await recruiterEmail(pay);

    if (to) {
      batch.set(db.collection("notifications").doc(), {
        ...base,
        userId: to,
        type: "subscription_activated",
        title: "Payment Successful",
        message: `Payment of ${rupees(pay.amount)} received. Your ${pay.plan.planName} subscription is active until ${until}.${invoiceNote}`,
        metadata: { orderId: pay.orderId, planId: pay.plan.planId, ...(pay.invoice ? { invoiceNumber: pay.invoice.number } : {}) },
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
  if (to && pay.invoice) {
    await sendPaymentMail(to, `Payment received - Invoice ${pay.invoice.number} | Indian Infra Jobs`, invoiceEmail(pay, pay.invoice));
  }
}

/** Recruiter: "your payment failed" (in-app + email). Best-effort, never throws. */
async function notifyFailed(pay: PaymentDoc, reason: string): Promise<void> {
  let to = "";
  try {
    to = await recruiterEmail(pay);
    if (to) {
      await firestore().collection("notifications").add({
        userId: to,
        type: "subscription_payment_failed",
        title: "Payment Failed",
        message: `Your payment of ${rupees(pay.amount)} for the ${pay.plan.planName} plan failed: ${reason}. The plan was not activated. If money was debited, it will be refunded automatically.`,
        metadata: { orderId: pay.orderId, planId: pay.plan.planId },
        read: false,
        viewed: false,
        createdAt: Timestamp().now(),
      });
    }
  } catch (err) {
    console.error("notifyFailed failed", err);
  }
  if (to) await sendPaymentMail(to, "Payment failed | Indian Infra Jobs", failedEmail(pay, reason));
}

/**
 * Marks an unpaid order failed and tells the recruiter, once per order. Checkout
 * retries on the same order, so a later attempt can still succeed (grantPaidPlan
 * accepts a failed order) and never downgrades a paid one.
 */
async function recordFailure(orderId: string, payment: RzpPayment): Promise<void> {
  const db = firestore();
  const ref = db.collection(PAYMENTS).doc(orderId);
  const reason = str(payment.error_description || "Payment failed", 300);
  const notify = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const pay = snap.data() as PaymentDoc;
    if (pay.status === "paid" || payment.order_id !== orderId) return null;
    const first = !pay.failureNotifiedAt;
    tx.update(ref, {
      status: "failed",
      failureReason: reason,
      razorpayPaymentId: payment.id,
      ...(first ? { failureNotifiedAt: Timestamp().now() } : {}),
    });
    return first ? pay : null;
  });
  if (notify) await notifyFailed(notify, reason);
}

/**
 * Fetches the payment from Razorpay and captures it if it is only authorized.
 * A payment Razorpay reports as failed is recorded (and the recruiter told) first.
 */
async function confirmedPayment(paymentId: string, orderId: string): Promise<RzpPayment> {
  let payment = await razorpay<RzpPayment>(`/payments/${encodeURIComponent(paymentId)}`);
  if (payment.status === "authorized") {
    payment = await razorpay<RzpPayment>(`/payments/${encodeURIComponent(paymentId)}/capture`, {
      method: "POST",
      body: { amount: payment.amount, currency: payment.currency },
    });
  }
  if (payment.status === "failed") await recordFailure(orderId, payment);
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
    credits: Number.isFinite(Number(plan.credits)) ? Math.max(0, Math.floor(Number(plan.credits))) : 0,
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
  const payment = await confirmedPayment(paymentId, orderId);
  const granted = await grantPaidPlan(orderId, payment, "checkout");
  return { planName: granted.planName, expiresAtMs: granted.expiresAt.getTime() };
});

/* ------------------------------------------------------------------ *
 * 2b. A failed attempt the browser reports
 * ------------------------------------------------------------------ */

/**
 * Checkout's payment.failed event. Without it a failure only reaches us through
 * the webhook; with it the recruiter is told even when no webhook is set up. The
 * browser's word is never trusted: the payment is read back from Razorpay.
 */
export const reportSubscriptionPaymentFailed = onCall(async (request) => {
  const uid = requireAuth(request);
  const data = (request.data || {}) as { orderId?: unknown; paymentId?: unknown };
  const orderId = cleanId(data.orderId, "order");
  const paymentId = cleanId(data.paymentId, "payment");
  await enforceLimit(`pay-failed:${uid}`, 30, HOUR);

  const pay = (await firestore().collection(PAYMENTS).doc(orderId).get()).data() as PaymentDoc | undefined;
  if (!pay || pay.userId !== uid) throw new HttpsError("not-found", "Unknown order.");
  if (pay.status === "paid") return { recorded: false };

  const payment = await razorpay<RzpPayment>(`/payments/${encodeURIComponent(paymentId)}`);
  if (payment.status !== "failed" || payment.order_id !== orderId) return { recorded: false };
  await recordFailure(orderId, payment);
  return { recorded: true };
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
      // Records the failure and notifies the recruiter once; never downgrades a paid order.
      await recordFailure(orderId, payment);
    }
    res.status(200).send("ok");
  } catch (err) {
    // A non-2xx makes Razorpay retry, which is what we want for a transient failure.
    console.error("razorpayWebhook error", err);
    res.status(500).send("error");
  }
});
