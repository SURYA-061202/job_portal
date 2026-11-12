import { httpsCallable } from 'firebase/functions';
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore';
import { db, functions } from './firebase';
import type { PaymentRecord, SubscriptionPlan } from '@/types';

/**
 * Online payment for subscription plans, through Razorpay Checkout.
 *
 * The browser never decides the price or grants a plan. It asks the
 * createSubscriptionOrder function for an order (price read from the plan on the
 * server), opens Razorpay's checkout, then hands the signed result to
 * verifySubscriptionPayment, which checks it with Razorpay and writes the plan.
 * A webhook does the same on the server, so a closed tab never loses a payment.
 */

const CHECKOUT_SRC = 'https://checkout.razorpay.com/v1/checkout.js';
const BRAND_COLOR = '#f97316';

interface OrderResponse {
    orderId: string;
    amount: number;
    currency: string;
    keyId: string;
    planName: string;
    durationDays: number;
    prefill: { name: string; email: string; contact: string };
}

interface VerifyResponse {
    planName: string;
    expiresAtMs: number;
}

const createOrderFn = httpsCallable<{ planId: string }, OrderResponse>(functions, 'createSubscriptionOrder');
const verifyPaymentFn = httpsCallable<{ orderId: string; paymentId: string; signature: string }, VerifyResponse>(
    functions,
    'verifySubscriptionPayment'
);

/* ------------------------------------------------------------------ *
 * Razorpay Checkout script
 * ------------------------------------------------------------------ */

interface RazorpaySuccess {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
}

interface RazorpayFailure {
    error?: { description?: string; reason?: string };
}

interface RazorpayInstance {
    open: () => void;
    on: (event: 'payment.failed', cb: (response: RazorpayFailure) => void) => void;
}

type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;

declare global {
    interface Window {
        Razorpay?: RazorpayCtor;
    }
}

let scriptPromise: Promise<RazorpayCtor> | null = null;

/** Loads checkout.js once, on first use, so it never slows down page load. */
function loadCheckout(): Promise<RazorpayCtor> {
    if (window.Razorpay) return Promise.resolve(window.Razorpay);
    if (!scriptPromise) {
        scriptPromise = new Promise<RazorpayCtor>((resolve, reject) => {
            const script = document.createElement('script');
            script.src = CHECKOUT_SRC;
            script.async = true;
            script.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Payment window failed to load.')));
            script.onerror = () => reject(new Error('Could not reach the payment service. Check your connection and try again.'));
            document.body.appendChild(script);
        }).catch((error) => {
            scriptPromise = null; // allow a retry
            throw error;
        });
    }
    return scriptPromise;
}

/* ------------------------------------------------------------------ *
 * Checkout flow
 * ------------------------------------------------------------------ */

export type CheckoutResult =
    | { status: 'paid'; planName: string; expiresAt: Date }
    | { status: 'cancelled' };

/** Turns a Firebase callable error into the message the function sent. */
function messageOf(error: unknown, fallback: string): string {
    const e = error as { message?: string; code?: string };
    if (e?.message && !/^internal$/i.test(e.message)) return e.message;
    return fallback;
}

/**
 * Pays for a plan. Resolves 'paid' once the plan is active on the account,
 * 'cancelled' if the recruiter closes the window, and throws on failure.
 * The live useSubscription() listener picks up the new plan by itself.
 */
export async function payForPlan(plan: SubscriptionPlan): Promise<CheckoutResult> {
    if (!plan.id) throw new Error('This plan cannot be bought right now.');

    const [Razorpay, order] = await Promise.all([
        loadCheckout(),
        createOrderFn({ planId: plan.id })
            .then((r) => r.data)
            .catch((error) => {
                throw new Error(messageOf(error, 'Could not start the payment. Please try again.'));
            }),
    ]);

    return new Promise<CheckoutResult>((resolve, reject) => {
        let settled = false;
        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            fn();
        };

        const rzp = new Razorpay({
            key: order.keyId,
            order_id: order.orderId,
            amount: order.amount,
            currency: order.currency,
            name: 'Indian Infra Jobs',
            description: `${order.planName} - ${order.durationDays} days`,
            image: `${window.location.origin}/images/indianinfra.png`,
            prefill: order.prefill,
            notes: { planId: plan.id },
            theme: { color: BRAND_COLOR },
            // Checkout retries a failed attempt inside the same window; only the
            // final outcome reaches handler/ondismiss.
            retry: { enabled: true, max_count: 3 },
            handler: async (response: RazorpaySuccess) => {
                try {
                    const { data } = await verifyPaymentFn({
                        orderId: response.razorpay_order_id,
                        paymentId: response.razorpay_payment_id,
                        signature: response.razorpay_signature,
                    });
                    finish(() => resolve({ status: 'paid', planName: data.planName, expiresAt: new Date(data.expiresAtMs) }));
                } catch (error) {
                    finish(() =>
                        reject(
                            new Error(
                                messageOf(
                                    error,
                                    'Payment received but we could not confirm it yet. Your plan will activate automatically within a few minutes.'
                                )
                            )
                        )
                    );
                }
            },
            modal: {
                confirm_close: true,
                ondismiss: () => finish(() => resolve({ status: 'cancelled' })),
            },
        });

        rzp.on('payment.failed', (response) => {
            // Logged only; checkout lets the user try another method. If they then
            // close it, ondismiss resolves as cancelled.
            console.warn('Payment attempt failed:', response.error?.description || response.error?.reason);
        });

        rzp.open();
    });
}

/* ------------------------------------------------------------------ *
 * Payment history
 * ------------------------------------------------------------------ */

const toMillis = (v: any): number => (typeof v?.toMillis === 'function' ? v.toMillis() : 0);
const newestFirst = (rows: PaymentRecord[]) => rows.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

/** Live list of one recruiter's payments (paid and failed; abandoned checkouts are left out). */
export function subscribeMyPayments(
    userId: string,
    onData: (payments: PaymentRecord[]) => void,
    onError?: (error: Error) => void
): Unsubscribe {
    return onSnapshot(
        query(collection(db, 'payments'), where('userId', '==', userId)),
        (snap) =>
            onData(
                newestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentRecord)).filter((p) => p.status !== 'created')
            ),
        (error) => onError?.(error)
    );
}

/** Admin: every payment, newest first. */
export function subscribeAllPayments(onData: (payments: PaymentRecord[]) => void, onError?: (error: Error) => void): Unsubscribe {
    return onSnapshot(
        collection(db, 'payments'),
        (snap) => onData(newestFirst(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PaymentRecord))),
        (error) => onError?.(error)
    );
}

/** ₹ amount from paise. */
export const formatAmount = (paise: number): string => `₹${(paise / 100).toLocaleString('en-IN')}`;

/** A plan is bought online when it has a price; ₹0 plans stay "by arrangement" with the admin. */
export const isPurchasable = (plan: SubscriptionPlan): boolean => Number(plan.price) > 0;
