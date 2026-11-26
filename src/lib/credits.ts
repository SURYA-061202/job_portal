import { toMillis } from '@/lib/dates';
import type { FireDate } from '@/types';
import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, type Unsubscribe } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { resolveSubscription } from '@/lib/subscriptions';
import popup from '@/components/ui/Popup';

/** Credit points each recruiter action costs. */
export const CREDIT_COST = {
    /** One keyword search in the Candidates tab. */
    search: 1,
    /** Downloading a candidate's resume. */
    download: 5,
    /** Opening a candidate's resume or profile details (once per candidate). */
    view: 5,
    /** Adding a job post (a new post, draft or live). */
    post: 20,
} as const;

export type CreditAction = keyof typeof CREDIT_COST;

/** Per-action costs stored on a plan; unset actions use the CREDIT_COST default. */
export type CreditCosts = Partial<Record<CreditAction, number>>;

/** The points one action costs on a plan (the plan's own value, else the default). */
export const resolveCost = (costs: CreditCosts | undefined, action: CreditAction): number => {
    const value = costs?.[action];
    return typeof value === 'number' && Number.isFinite(value) ? value : CREDIT_COST[action];
};

/** What a credit point was spent on, as shown in the usage breakdown. */
export type CreditUsageKind = 'search' | 'view_profile' | 'view_resume' | 'download' | 'post';

export const USAGE_KINDS: { kind: CreditUsageKind; label: string; hint: string }[] = [
    { kind: 'search', label: 'Searches', hint: 'Keyword searches in Candidates' },
    { kind: 'post', label: 'Job posts', hint: 'Posts added to the Job Posts tab' },
    { kind: 'view_profile', label: 'Profile views', hint: 'Candidate profile details opened' },
    { kind: 'view_resume', label: 'Resume views', hint: 'Resumes opened for preview' },
    { kind: 'download', label: 'Resume downloads', hint: 'Resumes downloaded' },
];

/** Points one spend of a usage kind costs (how the usage table shows its cost). */
export const usageCost = (kind: CreditUsageKind): number =>
    kind === 'search' ? CREDIT_COST.search
        : kind === 'download' ? CREDIT_COST.download
            : kind === 'post' ? CREDIT_COST.post
                : CREDIT_COST.view;

export interface CreditUsageEntry {
    id: string;
    kind: CreditUsageKind;
    cost: number;
    /** Candidate name, or the search keywords. */
    note?: string;
    createdAt?: FireDate;
}

export interface SpendResult {
    ok: boolean;
    /** Points left after the charge (undefined when the recruiter is never charged). */
    balance?: number;
}

interface SpendOptions {
    /** What the points are spent on. Defaults to the action for searches and downloads. */
    kind?: CreditUsageKind;
    /** Shown in the usage list: the candidate's name or the search keywords. */
    note?: string;
    /**
     * Makes the charge once-only: the first call deducts and records `key`, later calls with the
     * same key are free (re-opening a candidate you already paid to view).
     */
    unlockKey?: string;
    /** Shown instead of the default message when the balance is too low. */
    label?: string;
}

const defaultKind = (action: CreditAction): CreditUsageKind =>
    action === 'search' ? 'search' : action === 'download' ? 'download' : action === 'post' ? 'post' : 'view_profile';

/**
 * Deducts credit points from the signed-in recruiter's balance in one transaction and
 * logs what they were spent on (users/{uid}/creditUsage). Admins and legacy premium
 * recruiters are never charged. Shows its own message and returns ok:false when the
 * balance is too low (or the user is not signed in).
 *
 * The balance is the plan's credit points minus users/{uid}.creditsUsed for the current
 * subscription period. Firestore rules only let a recruiter raise creditsUsed.
 */
export async function spendCredits(action: CreditAction, options: SpendOptions = {}): Promise<SpendResult> {
    const user = auth.currentUser;
    if (!user) {
        popup.error('Please sign in again.');
        return { ok: false };
    }
    const kind = options.kind ?? defaultKind(action);
    const userRef = doc(db, 'users', user.uid);
    const unlockRef = options.unlockKey ? doc(db, 'users', user.uid, 'unlocked', options.unlockKey) : null;
    const usageRef = doc(collection(db, 'users', user.uid, 'creditUsage'));

    try {
        // The points a plan gives - and what each action costs on it - are read from the plan itself.
        const planId = (await getDoc(userRef)).data()?.subscription?.planId as string | undefined;
        let planCredits: number | null = null;
        let planCosts: CreditCosts | undefined;
        if (planId) {
            try {
                const planSnap = await getDoc(doc(db, 'subscription_plans', planId));
                if (planSnap.exists()) {
                    const data = planSnap.data();
                    if (typeof data.credits === 'number') planCredits = data.credits;
                    if (data.costs && typeof data.costs === 'object') planCosts = data.costs as CreditCosts;
                }
            } catch {
                /* falls back to the credits stored when the plan was granted */
            }
        }
        const actionCost = resolveCost(planCosts, action);

        const result = await runTransaction(db, async (tx): Promise<SpendResult & { short?: boolean }> => {
            const userSnap = await tx.get(userRef);
            const userData = userSnap.exists() ? userSnap.data() : undefined;
            const sub = resolveSubscription(userData, planCredits);
            if (sub.unlimitedCredits) return { ok: true };

            if (unlockRef) {
                const unlocked = await tx.get(unlockRef);
                if (unlocked.exists()) return { ok: true, balance: sub.credits };
            }

            if (sub.credits < actionCost) return { ok: false, balance: sub.credits, short: true };

            const balance = sub.credits - actionCost;
            // Spending is recorded against the current subscription period (its start time).
            const periodStart = (userData?.subscription?.startedAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
            tx.update(userRef, { creditsUsed: sub.creditsUsed + actionCost, creditsPeriod: periodStart });
            if (unlockRef) tx.set(unlockRef, { action, cost: actionCost, createdAt: new Date() });
            tx.set(usageRef, {
                kind,
                cost: actionCost,
                ...(options.note ? { note: options.note.slice(0, 200) } : {}),
                createdAt: serverTimestamp(),
            });
            return { ok: true, balance };
        });

        if (!result.ok && result.short) {
            popup.error(
                `Not enough credit points. ${options.label ?? 'This action'} needs ${actionCost} point${actionCost === 1 ? '' : 's'}; you have ${result.balance ?? 0}. Get more credits from the Subscription tab.`
            );
        }
        return { ok: result.ok, balance: result.balance };
    } catch (error) {
        console.error('Failed to deduct credits:', error);
        popup.error('Could not use your credit points. Please try again.');
        return { ok: false };
    }
}

/** Unlock key for "viewed this candidate's resume / profile": one charge per candidate. */
export const unlockKey = (candidateId: string, kind: 'profile' | 'resume'): string => `${candidateId}_${kind}`;

const millis = (value: FireDate | undefined): number => {
    if (!value) return Date.now(); // a just-written entry whose server time has not arrived yet
    return toMillis(value);
};

/** Live list of a recruiter's credit spending, newest first. */
export function subscribeCreditUsage(
    userId: string,
    onData: (entries: CreditUsageEntry[]) => void,
    onError?: (error: Error) => void
): Unsubscribe {
    return onSnapshot(
        collection(db, 'users', userId, 'creditUsage'),
        (snap) =>
            onData(
                snap.docs
                    .map((d) => ({ id: d.id, ...d.data() }) as CreditUsageEntry)
                    .sort((a, b) => millis(b.createdAt) - millis(a.createdAt))
            ),
        (error) => onError?.(error)
    );
}

export interface UsageSummary {
    totalPoints: number;
    byKind: Record<CreditUsageKind, { count: number; points: number }>;
}

export function summarizeUsage(entries: CreditUsageEntry[]): UsageSummary {
    const byKind = Object.fromEntries(USAGE_KINDS.map((k) => [k.kind, { count: 0, points: 0 }])) as UsageSummary['byKind'];
    let totalPoints = 0;
    for (const e of entries) {
        const bucket = byKind[e.kind];
        if (!bucket) continue;
        bucket.count += 1;
        bucket.points += e.cost || 0;
        totalPoints += e.cost || 0;
    }
    return { totalPoints, byKind };
}

export const usageEntryTime = millis;
