import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FREE_SUBSCRIPTION, FREE_USER_SUBSCRIPTION, resolveSubscription } from '@/lib/subscriptions';
import type { EffectiveSubscription, SubscriptionAudience } from '@/types';

/**
 * Live entitlements for a user. Listens to users/{uid}, so a plan the admin
 * approves (or revokes) takes effect on the recruiter's screen immediately.
 * Credit points are read from the plan itself, so editing a plan's credits updates them too.
 * Returns null until the first snapshot arrives.
 */
export function useSubscription(userId: string | null, audience: SubscriptionAudience = 'recruiter'): EffectiveSubscription | null {
    const [userData, setUserData] = useState<DocumentData | undefined | null>(null);
    const [planCredits, setPlanCredits] = useState<number | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!userId) {
            setUserData(null);
            return;
        }
        setFailed(false);
        const unsubscribe = onSnapshot(
            doc(db, 'users', userId),
            (snap) => setUserData(snap.exists() ? snap.data() : undefined),
            (error) => {
                console.error('Failed to listen to subscription:', error);
                setFailed(true);
            }
        );
        return unsubscribe;
    }, [userId, audience]);

    const planId: string | null = userData?.subscription?.planId ?? null;
    useEffect(() => {
        setPlanCredits(null);
        if (!planId) return;
        return onSnapshot(
            doc(db, 'subscription_plans', planId),
            (snap) => setPlanCredits(snap.exists() && typeof snap.data().credits === 'number' ? snap.data().credits : null),
            () => setPlanCredits(null) // plan not readable or deleted: the granted snapshot is used instead
        );
    }, [planId]);

    return useMemo(() => {
        if (failed) return audience === 'user' ? FREE_USER_SUBSCRIPTION : FREE_SUBSCRIPTION;
        if (userData === null) return null;
        return resolveSubscription(userData, planCredits);
    }, [userData, planCredits, failed, audience]);
}
