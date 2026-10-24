import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getCountFromServer,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    Timestamp,
    updateDoc,
    where,
    deleteField,
    type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
    createSubscriptionApprovedNotification,
    createSubscriptionRejectedNotification,
    createSubscriptionRequestNotification,
    createSubscriptionRequestSentNotification,
} from '@/lib/notificationHelper';
import { UNLIMITED } from '@/types';
import type {
    EffectiveSubscription,
    SubscriptionAudience,
    SubscriptionPlan,
    SubscriptionRequest,
    UserSubscription,
} from '@/types';

/* ------------------------------------------------------------------ *
 * Free tier. Recruiters without an active plan get exactly this.
 * ------------------------------------------------------------------ */

export const FREE_POST_LIMIT = 10;
/** Everyone can view every candidate; plans unlock contact details, resumes and posts. */
export const FREE_CANDIDATE_LIMIT = -1;
/** Job seekers on the free tier can view this many job posts. */
export const FREE_USER_POST_LIMIT = 5;

const PLANS = 'subscription_plans';
const REQUESTS = 'subscription_requests';

export const isUnlimited = (limit: number): boolean => limit === UNLIMITED || limit < 0;

export const formatLimit = (limit: number): string => (isUnlimited(limit) ? 'Unlimited' : String(limit));

export const formatPrice = (price: number): string =>
    price > 0 ? `₹${price.toLocaleString('en-IN')}` : 'Free';

const toDate = (value: unknown): Date | null => {
    if (!value) return null;
    const v = value as { toDate?: () => Date; seconds?: number };
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const parsed = new Date(value as string | number | Date);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDate = (value: unknown): string => {
    const d = toDate(value);
    return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
};

/* ------------------------------------------------------------------ *
 * Entitlements
 * ------------------------------------------------------------------ */

export const FREE_SUBSCRIPTION: EffectiveSubscription = {
    source: 'free',
    planId: null,
    planName: 'Free',
    level: 0,
    maxPosts: FREE_POST_LIMIT,
    maxCandidates: FREE_CANDIDATE_LIMIT,
    expiresAt: null,
    expired: false,
};

export const FREE_USER_SUBSCRIPTION: EffectiveSubscription = {
    source: 'free',
    planId: null,
    planName: 'Free',
    level: 0,
    maxPosts: FREE_USER_POST_LIMIT,
    maxCandidates: 0,
    expiresAt: null,
    expired: false,
};

export const planAudience = (plan: { audience?: SubscriptionAudience }): SubscriptionAudience => plan.audience ?? 'recruiter';

/** Recruiters and managers are recruiter-side; everyone else with an account is a job seeker. */
export const audienceOfRole = (role: unknown): SubscriptionAudience =>
    role === 'recruiter' || role === 'manager' || role === 'admin' ? 'recruiter' : 'user';

const ADMIN_SUBSCRIPTION: EffectiveSubscription = {
    source: 'admin',
    planId: null,
    planName: 'Admin',
    level: 99,
    maxPosts: UNLIMITED,
    maxCandidates: UNLIMITED,
    expiresAt: null,
    expired: false,
};

/**
 * Turns a users/{uid} document into what that person may do right now.
 * Order: admin -> active plan -> legacy isPremium flag -> free tier.
 */
export function resolveSubscription(userData: Record<string, any> | undefined | null): EffectiveSubscription {
    if (!userData) return FREE_SUBSCRIPTION;
    if (userData.role === 'admin') return ADMIN_SUBSCRIPTION;

    const audience = audienceOfRole(userData.role);
    const freeTier = audience === 'user' ? FREE_USER_SUBSCRIPTION : FREE_SUBSCRIPTION;

    const sub = userData.subscription as UserSubscription | undefined;
    let expired = false;
    if (sub?.planId) {
        const expiresAt = toDate(sub.expiresAt);
        if (!expiresAt || expiresAt.getTime() > Date.now()) {
            return {
                source: 'plan',
                planId: sub.planId,
                planName: sub.planName || 'Subscription',
                level: sub.level ?? 1,
                maxPosts: typeof sub.maxPosts === 'number' ? sub.maxPosts : freeTier.maxPosts,
                maxCandidates: typeof sub.maxCandidates === 'number' ? sub.maxCandidates : freeTier.maxCandidates,
                expiresAt,
                expired: false,
            };
        }
        expired = true;
    }

    // Recruiters approved under the old single "premium" flag keep unlimited access.
    if (audience === 'recruiter' && userData.isPremium === true) {
        return {
            source: 'legacy',
            planId: null,
            planName: 'Premium',
            level: 99,
            maxPosts: UNLIMITED,
            maxCandidates: UNLIMITED,
            expiresAt: null,
            expired: false,
        };
    }

    return { ...freeTier, expired };
}

export async function getUserSubscription(userId: string): Promise<EffectiveSubscription> {
    const snap = await getDoc(doc(db, 'users', userId));
    return resolveSubscription(snap.exists() ? snap.data() : undefined);
}

/** How many job posts a recruiter currently owns. */
export async function countRecruiterPosts(userId: string): Promise<number> {
    const snap = await getCountFromServer(query(collection(db, 'recruits'), where('recruiterId', '==', userId)));
    return snap.data().count;
}

export interface PostQuota {
    allowed: boolean;
    used: number;
    limit: number;
    subscription: EffectiveSubscription;
}

/** Whether this user may create one more job post under their current plan. */
export async function checkPostQuota(userId: string): Promise<PostQuota> {
    const subscription = await getUserSubscription(userId);
    if (isUnlimited(subscription.maxPosts)) {
        return { allowed: true, used: 0, limit: UNLIMITED, subscription };
    }
    const used = await countRecruiterPosts(userId);
    return { allowed: used < subscription.maxPosts, used, limit: subscription.maxPosts, subscription };
}

/* ------------------------------------------------------------------ *
 * Plans (admin)
 * ------------------------------------------------------------------ */

export async function getPlans(opts: { activeOnly?: boolean; audience?: SubscriptionAudience } = {}): Promise<SubscriptionPlan[]> {
    const snap = await getDocs(collection(db, PLANS));
    let plans = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SubscriptionPlan);
    if (opts.activeOnly) plans = plans.filter((p) => p.active);
    if (opts.audience) plans = plans.filter((p) => planAudience(p) === opts.audience);
    return plans.sort((a, b) => a.level - b.level);
}

export async function savePlan(plan: SubscriptionPlan): Promise<void> {
    const { id, createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = plan;
    if (id) {
        await updateDoc(doc(db, PLANS, id), { ...fields, updatedAt: serverTimestamp() });
    } else {
        await addDoc(collection(db, PLANS), { ...fields, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
}

export async function deletePlan(planId: string): Promise<void> {
    await deleteDoc(doc(db, PLANS, planId));
}

/* ------------------------------------------------------------------ *
 * Requests (recruiter -> admin)
 * ------------------------------------------------------------------ */

const sortNewest = <T extends { createdAt?: any }>(rows: T[]): T[] =>
    rows.sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0));

export async function getMyRequests(recruiterId: string): Promise<SubscriptionRequest[]> {
    const snap = await getDocs(query(collection(db, REQUESTS), where('recruiterId', '==', recruiterId)));
    return sortNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SubscriptionRequest));
}

export async function getAllRequests(): Promise<SubscriptionRequest[]> {
    const snap = await getDocs(collection(db, REQUESTS));
    return sortNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SubscriptionRequest));
}

/** Live feed of every request, so a recruiter's request shows up on the admin's screen at once. */
export function subscribeAllRequests(
    onData: (requests: SubscriptionRequest[]) => void,
    onError?: (error: Error) => void
): Unsubscribe {
    return onSnapshot(
        collection(db, REQUESTS),
        (snap) => onData(sortNewest(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as SubscriptionRequest))),
        (error) => onError?.(error)
    );
}

/**
 * Recruiter asks for a plan. One open request at a time. Every admin is
 * notified, and the recruiter gets a confirmation notification.
 */
export async function requestSubscription(recruiterId: string, plan: SubscriptionPlan): Promise<void> {
    if (!plan.id) throw new Error('Plan has no id');

    const mine = await getMyRequests(recruiterId);
    if (mine.some((r) => r.status === 'pending')) {
        throw new Error('You already have a pending subscription request.');
    }

    const userSnap = await getDoc(doc(db, 'users', recruiterId));
    const user = userSnap.data() ?? {};
    const audience = planAudience(plan);
    const recruiterName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || (audience === 'user' ? 'User' : 'Recruiter');
    const recruiterEmail: string = user.email || '';

    await addDoc(collection(db, REQUESTS), {
        audience,
        recruiterId,
        recruiterName,
        recruiterEmail,
        planId: plan.id,
        planName: plan.name,
        planLevel: plan.level,
        status: 'pending',
        createdAt: serverTimestamp(),
    });

    // Notifications are best-effort: the request itself already succeeded.
    try {
        const admins = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
        await Promise.all(
            admins.docs
                .map((a) => a.data().email as string | undefined)
                .filter((email): email is string => !!email)
                .map((email) => createSubscriptionRequestNotification(email, recruiterName, recruiterEmail, plan.name))
        );
        if (recruiterEmail) {
            await createSubscriptionRequestSentNotification(recruiterEmail, recruiterName, plan.name);
        }
    } catch (error) {
        console.error('Failed to send subscription request notifications:', error);
    }
}

/* ------------------------------------------------------------------ *
 * Admin actions
 * ------------------------------------------------------------------ */

const addDays = (from: Date, days: number): Date => new Date(from.getTime() + days * 86_400_000);

/** Writes the plan snapshot onto the recruiter. Renewing the same plan extends from its current end. */
async function grantPlan(recruiterId: string, plan: SubscriptionPlan): Promise<Date> {
    const userSnap = await getDoc(doc(db, 'users', recruiterId));
    const current = userSnap.data()?.subscription as UserSubscription | undefined;
    const currentEnd = toDate(current?.expiresAt);
    const base = current?.planId === plan.id && currentEnd && currentEnd.getTime() > Date.now() ? currentEnd : new Date();
    const expiresAt = addDays(base, plan.durationDays);

    const subscription: UserSubscription = {
        planId: plan.id as string,
        planName: plan.name,
        level: plan.level,
        maxPosts: plan.maxPosts,
        maxCandidates: plan.maxCandidates,
        startedAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(expiresAt),
    };
    await updateDoc(doc(db, 'users', recruiterId), { subscription });
    return expiresAt;
}

export async function approveRequest(request: SubscriptionRequest, adminId: string): Promise<void> {
    if (!request.id) return;
    const planSnap = await getDoc(doc(db, PLANS, request.planId));
    if (!planSnap.exists()) throw new Error('This plan no longer exists.');
    const plan = { id: planSnap.id, ...planSnap.data() } as SubscriptionPlan;

    const expiresAt = await grantPlan(request.recruiterId, plan);
    await updateDoc(doc(db, REQUESTS, request.id), {
        status: 'approved',
        resolvedAt: serverTimestamp(),
        resolvedBy: adminId,
    });

    try {
        await createSubscriptionApprovedNotification(request.recruiterEmail, request.recruiterName, plan.name, formatDate(expiresAt));
    } catch (error) {
        console.error('Failed to send approval notification:', error);
    }
}

export async function rejectRequest(request: SubscriptionRequest, adminId: string, note?: string): Promise<void> {
    if (!request.id) return;
    await updateDoc(doc(db, REQUESTS, request.id), {
        status: 'rejected',
        resolvedAt: serverTimestamp(),
        resolvedBy: adminId,
        ...(note ? { note } : {}),
    });
    try {
        await createSubscriptionRejectedNotification(request.recruiterEmail, request.recruiterName, request.planName, note);
    } catch (error) {
        console.error('Failed to send rejection notification:', error);
    }
}

/** Admin assigns a plan directly, without a request. */
export async function assignPlan(recruiterId: string, plan: SubscriptionPlan): Promise<void> {
    const expiresAt = await grantPlan(recruiterId, plan);
    try {
        const snap = await getDoc(doc(db, 'users', recruiterId));
        const u = snap.data() ?? {};
        const name = `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Recruiter';
        if (u.email) await createSubscriptionApprovedNotification(u.email, name, plan.name, formatDate(expiresAt));
    } catch (error) {
        console.error('Failed to send assignment notification:', error);
    }
}

/** Removes a recruiter's plan (and the legacy premium flag) so they fall back to the free tier. */
export async function revokeSubscription(recruiterId: string): Promise<void> {
    await updateDoc(doc(db, 'users', recruiterId), { subscription: deleteField(), isPremium: false });
}
