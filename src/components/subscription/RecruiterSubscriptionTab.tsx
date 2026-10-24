import { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2 } from 'lucide-react';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';
import {
    countRecruiterPosts,
    formatDate,
    formatLimit,
    FREE_POST_LIMIT,
    FREE_USER_POST_LIMIT,
    getMyRequests,
    getPlans,
    isUnlimited,
    requestSubscription,
} from '@/lib/subscriptions';
import PlanPricingCard from './PlanPricingCard';
import type { EffectiveSubscription, SubscriptionAudience, SubscriptionPlan, SubscriptionRequest } from '@/types';

interface RecruiterSubscriptionTabProps {
    userId: string | null;
    subscription: EffectiveSubscription | null;
    /** 'user' shows the job seeker version of the page. Defaults to recruiter. */
    audience?: SubscriptionAudience;
}

const STATUS_LABEL: Record<SubscriptionRequest['status'], string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Declined',
};

export default function RecruiterSubscriptionTab({ userId, subscription, audience = 'recruiter' }: RecruiterSubscriptionTabProps) {
    const skin = useSkin();
    const isUser = audience === 'user';
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
    const [postsUsed, setPostsUsed] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [requestingId, setRequestingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!userId) return;
        try {
            const [planList, requestList, used] = await Promise.all([
                getPlans({ activeOnly: true, audience }),
                getMyRequests(userId),
                isUser ? Promise.resolve(0) : countRecruiterPosts(userId),
            ]);
            setPlans(planList);
            setRequests(requestList);
            setPostsUsed(used);
        } catch (error) {
            console.error('Error loading subscription data:', error);
            popup.error('Failed to load subscription details');
        } finally {
            setLoading(false);
        }
    }, [userId, audience, isUser]);

    useEffect(() => {
        load();
    }, [load]);

    // The admin approving a request changes `subscription` live - refresh the request list with it.
    const planKey = subscription?.planId ?? subscription?.source;
    useEffect(() => {
        if (!loading) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [planKey]);

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

    const sub = subscription;
    const postLimit = sub?.maxPosts ?? (isUser ? FREE_USER_POST_LIMIT : FREE_POST_LIMIT);
    const postPct = postsUsed !== null && !isUnlimited(postLimit) && postLimit > 0
        ? Math.min(100, Math.round((postsUsed / postLimit) * 100))
        : 0;

    return (
        <div className={isUser ? 'space-y-6' : `-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-4 flex-1 flex flex-col`}>
            {isUser && (
                <div>
                    <h1 className="text-3xl font-extrabold text-ink tracking-tight">Subscription</h1>
                    <p className="text-ink/60 mt-2 text-sm md:text-base">See your plan and limits, and request an upgrade from the admin.</p>
                </div>
            )}

            {/* One white body: each section is a title followed by a grey block. */}
            <div className={`border ${skin.edge} ${skin.resultsPanel} ${skin.radius} p-3 md:p-4 space-y-6`}>
                {loading ? (
                    <div className="flex min-h-[260px] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-brand" aria-label="Loading" />
                    </div>
                ) : (
                    <>
                        <section aria-label="Current plan">
                            <h3 className={`mb-3 ${skin.cardTitle}`}>Current plan</h3>
                            <div className={`border ${skin.edge} ${skin.cardSurface} ${skin.radius} ${isUser ? 'p-4 sm:p-6' : 'p-3 sm:p-4'}`}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="text-2xl font-black text-ink">{sub?.planName ?? 'Free'}</p>
                                        {sub?.source !== 'free' && (
                                            <p className={`mt-1 ${skin.body}`}>
                                                {sub?.expiresAt ? `Active until ${formatDate(sub.expiresAt)}` : 'No expiry'}
                                            </p>
                                        )}
                                    </div>
                                    {pending && (
                                        <span className={`${skin.count} rounded-lg`}>{pending.planName} request pending</span>
                                    )}
                                </div>

                                {sub?.expired && (
                                    <p role="alert" className="mt-4 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive rounded-lg">
                                        Your previous subscription has expired and you are back on the free tier. Request a plan to restore your limits.
                                    </p>
                                )}

                                {isUser ? (
                                    <p className="mt-1 text-sm text-ink/70">
                                        Job posts you can view: <span className="text-base font-bold text-ink">{formatLimit(postLimit)}</span>
                                    </p>
                                ) : (
                                    <div className="mt-5 grid grid-cols-1 gap-4">
                                        <div className={`border ${skin.edge} bg-surface ${skin.radius} p-4`}>
                                            <p className={skin.micro}>Job posts</p>
                                            <p className="mt-1 text-xl font-bold text-ink">
                                                {postsUsed ?? 0} <span className="text-ink/40">/ {formatLimit(postLimit)}</span>
                                            </p>
                                            {!isUnlimited(postLimit) && (
                                                <div
                                                    role="progressbar"
                                                    aria-label="Job posts used"
                                                    aria-valuemin={0}
                                                    aria-valuemax={100}
                                                    aria-valuenow={postPct}
                                                    className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/10"
                                                >
                                                    <div className={`h-full ${postPct >= 100 ? 'bg-destructive' : 'bg-brand'}`} style={{ width: `${postPct}%` }} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section aria-label="Available plans">
                            <h3 className={`mb-3 ${skin.cardTitle}`}>Available plans</h3>
                            <div className={`border ${skin.edge} ${skin.cardSurface} ${skin.radius} p-3 sm:p-4 ${plans.length === 0 ? 'flex min-h-[160px] items-center justify-center text-center' : ''}`}>
                                {plans.length === 0 ? (
                                    <p className={skin.body}>No plans are available yet. Please check back soon.</p>
                                ) : (
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                                        {plans.map((plan) => {
                                            const isCurrent = sub?.source === 'plan' && sub.planId === plan.id;
                                            const isRequested = pending?.planId === plan.id;
                                            return (
                                                <PlanPricingCard
                                                    key={plan.id}
                                                    plan={plan}
                                                    audience={audience}
                                                    badge={isCurrent ? 'Current' : undefined}
                                                    action={(
                            <button
                                type="button"
                                onClick={() => handleRequest(plan)}
                                disabled={!!pending || requestingId !== null}
                                className={`inline-flex w-full items-center justify-center gap-2 cursor-pointer rounded-lg ${isRequested ? skin.secondary : skin.cta} ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                                {requestingId === plan.id ? (
                                    <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Sending...</>
                                ) : isRequested ? (
                                    <><Clock className="h-4 w-4" aria-hidden="true" /> Request pending</>
                                ) : isCurrent ? (
                                    'Renew plan'
                                ) : (
                                    'Request subscription'
                                )}
                            </button>
                                                    )}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </section>

                        {isUser && requests.length > 0 && (
                            <section aria-label="Request history">
                                <h3 className={`mb-3 ${skin.cardTitle}`}>Your requests</h3>
                                <ul className={`divide-y ${skin.divide} border ${skin.edge} ${skin.cardSurface} ${skin.radius} px-4 sm:px-6`}>
                                    {requests.map((r) => (
                                        <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                                            <div>
                                                <p className="text-sm font-semibold text-ink">{r.planName}</p>
                                                <p className={skin.meta}>Requested {formatDate(r.createdAt)}{r.note ? ` · ${r.note}` : ''}</p>
                                            </div>
                                            <span className={`${skin.chip} rounded-lg`}>{STATUS_LABEL[r.status]}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
