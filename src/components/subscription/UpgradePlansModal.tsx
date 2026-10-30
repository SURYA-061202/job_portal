import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Loader2, X } from 'lucide-react';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';
import { canRenewPlan, formatDate, formatLimit, formatPrice, getMyRequests, getPlans, isUnlimited, requestSubscription } from '@/lib/subscriptions';
import type { EffectiveSubscription, SubscriptionAudience, SubscriptionPlan, SubscriptionRequest } from '@/types';

interface UpgradePlansModalProps {
    isOpen: boolean;
    onClose: () => void;
    userId: string | null;
    subscription: EffectiveSubscription | null;
    /** Whose plans to show. Defaults to recruiter plans. */
    audience?: SubscriptionAudience;
}

/** The plans a recruiter (or user) can ask for, opened from the Upgrade button. */
export default function UpgradePlansModal({ isOpen, onClose, userId, subscription, audience = 'recruiter' }: UpgradePlansModalProps) {
    const skin = useSkin();
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [requestingId, setRequestingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!userId) return;
        try {
            const [planList, requestList] = await Promise.all([getPlans({ activeOnly: true, audience }), getMyRequests(userId)]);
            setPlans(planList);
            setRequests(requestList);
        } catch (error) {
            console.error('Error loading plans:', error);
            popup.error('Failed to load subscription plans');
        } finally {
            setLoading(false);
        }
    }, [userId, audience]);

    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        load();
    }, [isOpen, load]);

    if (!isOpen) return null;

    const pending = requests.find((r) => r.status === 'pending');

    const handleRequest = async (plan: SubscriptionPlan) => {
        if (!userId) return;
        setRequestingId(plan.id ?? null);
        try {
            await requestSubscription(userId, plan);
            popup.success(`Request for ${plan.name} sent to the admin`);
            await load();
        } catch (error) {
            popup.error(error instanceof Error ? error.message : 'Failed to send subscription request');
        } finally {
            setRequestingId(null);
        }
    };

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="upgrade-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={`flex max-h-[90vh] w-full max-w-5xl flex-col border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}
            >
                <div className={`flex items-start justify-between gap-3 border-b ${skin.edge} px-6 py-5`}>
                    <div className="flex items-center gap-3">
                        <div>
                            <h3 id="upgrade-title" className={skin.heading}>Upgrade your plan</h3>
                            <p className={`mt-1.5 ${skin.body}`}>
                                Current plan: {subscription?.planName ?? 'Free'}
                                {subscription?.expiresAt ? ` (until ${formatDate(subscription.expiresAt)})` : ''}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} aria-label="Close" className={`shrink-0 cursor-pointer rounded-lg p-1 ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}>
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="overflow-y-auto p-4 sm:p-6">
                    {pending && (
                        <p role="status" className={`mb-4 flex items-center gap-2 border ${skin.edge} ${skin.cardSurface} ${skin.radius} px-4 py-3 ${skin.body}`}>
                            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                            Your request for {pending.planName} is waiting for admin approval.
                        </p>
                    )}

                    {loading ? (
                        <div className="flex min-h-[200px] items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-brand" aria-label="Loading" />
                        </div>
                    ) : plans.length === 0 ? (
                        <div className={`flex min-h-[200px] items-center justify-center border ${skin.edge} ${skin.cardSurface} ${skin.radius} px-6 text-center`}>
                            <p className={skin.body}>No subscription plans are available yet.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {plans.map((plan) => {
                                const isCurrent = subscription?.source === 'plan' && subscription.planId === plan.id;
                                const renewable = canRenewPlan(subscription, plan.id ?? '');
                                const activeNoEnd = isCurrent && !renewable && pending?.planId !== plan.id;
                                const isRequested = pending?.planId === plan.id;
                                return (
                                    <article key={plan.id} className={`flex flex-col border ${skin.edge} ${skin.cardSurface} ${skin.radius} p-5`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <p className={skin.micro}>Level {plan.level}</p>
                                                <h4 className="text-lg font-bold text-ink">{plan.name}</h4>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-3xl font-black text-ink">
                                            {formatPrice(plan.price)}
                                            <span className="text-sm font-medium text-ink/50"> / {plan.durationDays} days</span>
                                        </p>
                                        {plan.description && <p className={`mt-2 ${skin.body}`}>{plan.description}</p>}
                                        <ul className="mt-4 flex-1 space-y-2 text-sm text-ink/80">
                                            <li>
                                                {audience === 'user'
                                                    ? isUnlimited(plan.maxPosts) ? 'View unlimited job posts' : `View up to ${formatLimit(plan.maxPosts)} job posts`
                                                    : isUnlimited(plan.maxPosts) ? 'Unlimited job posts' : `Up to ${formatLimit(plan.maxPosts)} job posts`}
                                            </li>
                                            {audience !== 'user' && (
                                                <li>
                                                    {isUnlimited(plan.maxCandidates) ? 'Unlimited candidate access' : `View up to ${formatLimit(plan.maxCandidates)} candidates`}
                                                </li>
                                            )}
                                            {plan.features.filter((f) => f.trim()).map((feature, i) => (
                                                <li key={i}>
                                                    {feature}
                                                </li>
                                            ))}
                                        </ul>
                                        {activeNoEnd ? (
                                            <span className="mt-5 inline-flex w-full cursor-default items-center justify-center gap-2 rounded-lg border border-current px-4 py-2 text-sm font-semibold text-ink">Active plan</span>
                                        ) : (
                                        <button
                                            type="button"
                                            onClick={() => handleRequest(plan)}
                                            disabled={!!pending || requestingId !== null}
                                            className={`mt-5 inline-flex w-full items-center justify-center gap-2 cursor-pointer rounded-lg ${isRequested ? skin.secondary : skin.cta} ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`}
                                        >
                                            {requestingId === plan.id ? (
                                                <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Sending...</>
                                            ) : isRequested ? (
                                                <><Clock className="h-4 w-4" aria-hidden="true" /> Request pending</>
                                            ) : renewable ? (
                                                'Renew plan'
                                            ) : (
                                                'Request subscription'
                                            )}
                                        </button>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
