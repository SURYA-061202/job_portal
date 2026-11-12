import { useCallback, useState } from 'react';
import popup from '@/components/ui/Popup';
import { formatDate } from '@/lib/subscriptions';
import { payForPlan } from '@/lib/payments';
import type { EffectiveSubscription, SubscriptionPlan } from '@/types';

/**
 * Shared "Pay & subscribe" handler for the plan cards. Tracks which plan is
 * being paid for, warns before a different plan replaces an active one, and
 * reports the outcome. The plan itself appears through useSubscription().
 */
export function usePlanCheckout(subscription: EffectiveSubscription | null, onPaid?: () => void) {
    const [payingId, setPayingId] = useState<string | null>(null);

    const pay = useCallback(
        async (plan: SubscriptionPlan) => {
            if (!plan.id) return;

            const switching =
                subscription?.source === 'plan' && !subscription.expired && subscription.planId !== plan.id;
            if (
                switching &&
                !window.confirm(
                    `You are on ${subscription.planName}${subscription.expiresAt ? ` until ${formatDate(subscription.expiresAt)}` : ''}. ` +
                        `Buying ${plan.name} replaces it from today. Continue?`
                )
            ) {
                return;
            }

            setPayingId(plan.id);
            try {
                const result = await payForPlan(plan);
                if (result.status === 'paid') {
                    popup.success(`Payment successful. ${result.planName} is active until ${formatDate(result.expiresAt)}.`, { duration: 6000 });
                    onPaid?.();
                } else {
                    popup.info('Payment cancelled. You have not been charged.');
                }
            } catch (error) {
                popup.error(error instanceof Error ? error.message : 'Payment failed. Please try again.', { duration: 8000 });
            } finally {
                setPayingId(null);
            }
        },
        [subscription, onPaid]
    );

    return { payingId, pay };
}
