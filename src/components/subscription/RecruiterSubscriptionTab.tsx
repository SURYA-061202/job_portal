import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Clock, Loader2, Lock } from 'lucide-react';
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
import PlanSlider from './PlanSlider';
import type { EffectiveSubscription, SubscriptionAudience, SubscriptionPlan, SubscriptionRequest } from '@/types';

interface RecruiterSubscriptionTabProps {
    userId: string | null;
    subscription: EffectiveSubscription | null;
    /** 'user' shows the job seeker version of the page. Defaults to recruiter. */
    audience?: SubscriptionAudience;
    /** Open straight on the available plans (used by "View plans" links). */
    startOnPlans?: boolean;
}

const STATUS_LABEL: Record<SubscriptionRequest['status'], string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Declined',
};

export default function RecruiterSubscriptionTab({ userId, subscription, audience = 'recruiter', startOnPlans = false }: RecruiterSubscriptionTabProps) {
    const skin = useSkin();
    const isUser = audience === 'user';
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
    const [postsUsed, setPostsUsed] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [plansOpen, setPlansOpen] = useState(startOnPlans);
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

    const isPaid = !!sub && sub.source !== 'free';
    const matchedPlan = sub?.source === 'plan' ? plans.find((p) => p.id === sub.planId) : undefined;
    const statusText = sub?.expired ? 'Your subscription has expired.' : isPaid ? 'Your active subscription.' : 'The free tier. Subscribe to unlock more.';
    const statusLabel = sub?.expired ? 'Expired' : isPaid ? 'Active' : 'Free';

    return (
        <div className={isUser ? 'space-y-6' : `-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-5 flex-1 flex flex-col`}>
            {isUser && !plansOpen && (
                <div>
                    <h1 className="text-3xl font-extrabold text-ink tracking-tight">Subscription</h1>
                    <p className="text-ink/60 mt-2 text-sm md:text-base">See your plan and limits, and request an upgrade from the admin.</p>
                </div>
            )}

            {(!isUser || plansOpen) && (
                <div className="flex items-center justify-between gap-3">
                    <h1 className="text-2xl font-bold text-ink">{plansOpen ? 'Available Plans' : 'Subscription'}</h1>
                    {plansOpen && (
                        <button
                            type="button"
                            onClick={() => setPlansOpen(false)}
                            className={`group inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border ${skin.edge} bg-surface pl-3 pr-5 text-sm font-semibold text-ink shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-ink/40 hover:shadow-md ${FOCUS}`}
                        >
                            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
                            Back
                        </button>
                    )}
                </div>
            )}
            {pending && (
                <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-700">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {pending.planName} request pending
                    </span>
                </div>
            )}

            {loading ? (
                <div className="flex min-h-[260px] items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-brand" aria-label="Loading" />
                </div>
            ) : plansOpen ? (
                <section aria-label="Available plans" className="space-y-4">
                    {plans.length === 0 ? (
                        <div className={`flex min-h-[200px] items-center justify-center border ${skin.edge} ${skin.cardSurface} ${skin.radius} px-6 text-center`}>
                            <p className={skin.body}>No plans are available yet. Please check back soon.</p>
                        </div>
                    ) : (
                        <PlanSlider>
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
                        </PlanSlider>
                    )}
                </section>
            ) : (
                <section aria-label="Current plan" className="space-y-4">
                    {sub?.expired && (
                        <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive rounded-lg">
                            Your previous subscription has expired and you are back on the free tier. Request a plan to restore your limits.
                        </p>
                    )}
                    {/* Same vertical card as the available plans, one column wide. */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {!isUser && !isPaid ? (
                            <article className={`flex h-full flex-col border ${skin.edge} bg-surface ${skin.radius} p-6 transition-all duration-200 hover:border-black hover:shadow-md`}>
                                <h4 className="text-2xl font-bold text-ink">{sub?.planName ?? 'Free'}</h4>
                                <p className={`mt-3 ${skin.body}`}>Subscribe to unlock the following features.</p>
                                <ul className="mt-6 space-y-6">
                                    {[
                                        ['Add Posts', 'Publish job posts and reach job seekers across the platform.'],
                                        ['Access Contacts', 'View the email address and phone number of every candidate.'],
                                        ['Access Resume', 'Open and preview candidates\u2019 resumes right from their profile.'],
                                        ['And more features', 'Get new recruiter features as soon as they are released.'],
                                    ].map(([title, text]) => (
                                        <li key={title} className="flex items-start gap-3">
                                            <Lock className="mt-1 h-4 w-4 shrink-0 text-ink/50" aria-hidden="true" />
                                            <div>
                                                <p className="text-sm font-semibold text-ink">{title}</p>
                                                <p className={`mt-1 ${skin.body}`}>{text}</p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                <button
                                    type="button"
                                    onClick={() => setPlansOpen(true)}
                                    className={`mt-8 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg ${skin.cta} ${FOCUS}`}
                                >
                                    Subscribe
                                </button>
                            </article>
                        ) : (
                        <PlanPricingCard
                            plan={{
                                ...(matchedPlan ?? {}),
                                name: sub?.planName ?? 'Free',
                                description: statusText,
                                price: matchedPlan?.price ?? 0,
                                durationDays: matchedPlan?.durationDays ?? 0,
                                level: matchedPlan?.level ?? 0,
                                maxPosts: postLimit,
                                maxCandidates: sub?.maxCandidates ?? -1,
                                features: matchedPlan?.features ?? [],
                                active: true,
                            } as SubscriptionPlan}
                            audience={audience}
                            badge={statusLabel}
                            includeContact={isPaid && !sub?.expired}
                            restrictions={!isUser && !isPaid ? ['You cannot add job posts on the Free plan', 'Candidate contact details and resumes are locked'] : []}
                            priceNode={
                                <p className="mt-5 text-3xl font-bold text-ink">
                                    {isPaid ? (sub?.expiresAt ? formatDate(sub.expiresAt) : 'No expiry') : 'Free'}
                                    <span className="text-sm font-medium text-ink/60">{isPaid && sub?.expiresAt ? (sub.expired ? ' \u00B7 expired' : ' \u00B7 valid until') : ''}</span>
                                </p>
                            }
                            extra={!isUser && postLimit !== 0 ? (
                                <div>
                                    <p className="text-sm text-ink/80">
                                        Job posts used: <span className="font-semibold text-ink">{postsUsed ?? 0} / {formatLimit(postLimit)}</span>
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
                            ) : undefined}
                            action={(
                                <button
                                    type="button"
                                    onClick={() => setPlansOpen(true)}
                                    className={`inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg ${skin.cta} ${FOCUS}`}
                                >
                                    {isPaid && !sub?.expired ? 'View available plans' : 'Choose a plan'}
                                </button>
                            )}
                        />
                        )}
                    </div>

                    {isUser && requests.length > 0 && (
                        <div className={`border ${skin.edge} bg-surface ${skin.radius} p-6`}>
                            <h3 className={`mb-3 ${skin.cardTitle}`}>Your requests</h3>
                            <ul className={`divide-y ${skin.divide}`}>
                                {requests.map((r) => (
                                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                                        <div>
                                            <p className="text-sm font-semibold text-ink">{r.planName}</p>
                                            <p className={skin.meta}>Requested {formatDate(r.createdAt)}{r.note ? ` \u00B7 ${r.note}` : ''}</p>
                                        </div>
                                        <span className={`${skin.chip} rounded-lg`}>{STATUS_LABEL[r.status]}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
