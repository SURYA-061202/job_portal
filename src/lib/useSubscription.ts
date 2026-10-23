import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FREE_SUBSCRIPTION, FREE_USER_SUBSCRIPTION, resolveSubscription } from '@/lib/subscriptions';
import type { EffectiveSubscription, SubscriptionAudience } from '@/types';

/**
 * Live entitlements for a user. Listens to users/{uid}, so a plan the admin
 * approves (or revokes) takes effect on the recruiter's screen immediately.
 * Returns null until the first snapshot arrives.
 */
export function useSubscription(userId: string | null, audience: SubscriptionAudience = 'recruiter'): EffectiveSubscription | null {
    const [subscription, setSubscription] = useState<EffectiveSubscription | null>(null);

    useEffect(() => {
        if (!userId) {
            setSubscription(null);
            return;
        }
        const unsubscribe = onSnapshot(
            doc(db, 'users', userId),
            (snap) => setSubscription(resolveSubscription(snap.exists() ? snap.data() : undefined)),
            (error) => {
                console.error('Failed to listen to subscription:', error);
                setSubscription(audience === 'user' ? FREE_USER_SUBSCRIPTION : FREE_SUBSCRIPTION);
            }
        );
        return unsubscribe;
    }, [userId, audience]);

    return subscription;
}
