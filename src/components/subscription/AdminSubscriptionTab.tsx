import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Briefcase, Calendar, Check, IndianRupee, Loader2, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';
import { timeAgo } from '@/lib/format';
import {
    approveRequest,
    deletePlan,
    formatDate,
    formatLimit,
    getPlans,
    isUnlimited,
    planAudience,
    rejectRequest,
    resolveSubscription,
    revokeSubscription,
    savePlan,
    subscribeAllRequests,
} from '@/lib/subscriptions';
import { UNLIMITED } from '@/types';
import type { SubscriptionAudience, SubscriptionPlan, SubscriptionRequest } from '@/types';

type Section = 'requests' | 'plans' | 'subscribers';

interface Recruiter {
    id: string;
    name: string;
    email: string;
    data: Record<string, any>;
}

interface PlanForm {
    id?: string;
    level: string;
    name: string;
    description: string;
    price: string;
    durationDays: string;
    maxPosts: string;
    maxPostsUnlimited: boolean;
    maxCandidates: string;
    maxCandidatesUnlimited: boolean;
    features: string;
}

const emptyForm = (nextLevel: number): PlanForm => ({
    level: String(nextLevel),
    name: '',
    description: '',
    price: '',
    durationDays: '30',
    maxPosts: '',
    maxPostsUnlimited: false,
    maxCandidates: '',
    maxCandidatesUnlimited: false,
    features: '',
});

const formFromPlan = (p: SubscriptionPlan): PlanForm => ({
    id: p.id,
    level: String(p.level),
    name: p.name,
    description: p.description ?? '',
    price: String(p.price),
    durationDays: String(p.durationDays),
    maxPosts: isUnlimited(p.maxPosts) ? '' : String(p.maxPosts),
    maxPostsUnlimited: isUnlimited(p.maxPosts),
    maxCandidates: isUnlimited(p.maxCandidates) ? '' : String(p.maxCandidates),
    maxCandidatesUnlimited: isUnlimited(p.maxCandidates),
    features: p.features.join('\n'),
});

const emptyMessage = (section: Section, audience: SubscriptionAudience): string => {
    if (section === 'requests') return 'No subscription requests yet.';
    if (section === 'plans') return 'No subscription plans yet. Use Add plan to create one.';
    return audience === 'user' ? 'No users yet.' : 'No recruiters yet. Add them from Add Recruiters.';
};

const STATUS_LABEL: Record<SubscriptionRequest['status'], string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Declined',
};

export default function AdminSubscriptionTab({ adminId }: { adminId: string | null }) {
    const skin = useSkin();
    const [audience, setAudience] = useState<SubscriptionAudience>('recruiter');
    const [section, setSection] = useState<Section>('requests');
    const [allPlans, setAllPlans] = useState<SubscriptionPlan[]>([]);
    const [allRequests, setAllRequests] = useState<SubscriptionRequest[]>([]);
    const [recruiters, setRecruiters] = useState<Recruiter[]>([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [form, setForm] = useState<PlanForm | null>(null);
    const [saving, setSaving] = useState(false);

    const isUserSide = audience === 'user';
    const plans = useMemo(() => allPlans.filter((p) => planAudience(p) === audience), [allPlans, audience]);
    const requests = useMemo(() => allRequests.filter((r) => (r.audience ?? 'recruiter') === audience), [allRequests, audience]);

    const load = useCallback(async () => {
        try {
            const peopleQuery = isUserSide
                ? query(collection(db, 'users'), where('role', '==', 'user'))
                : query(collection(db, 'users'), where('role', 'in', ['recruiter', 'manager']));
            const [planList, recruiterSnap] = await Promise.all([getPlans(), getDocs(peopleQuery)]);
            setAllPlans(planList);
            setRecruiters(
                recruiterSnap.docs
                    .map((d) => {
                        const data = d.data();
                        return {
                            id: d.id,
                            name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || (isUserSide ? 'User' : 'Recruiter'),
                            email: data.email || '',
                            data,
                        };
                    })
                    .sort((a, b) => a.name.localeCompare(b.name))
            );
        } catch (error) {
            console.error('Error loading subscriptions:', error);
            popup.error('Failed to load subscriptions');
        } finally {
            setLoading(false);
        }
    }, [isUserSide]);

    useEffect(() => {
        setLoading(true);
        load();
    }, [load]);

    // Requests are live: a recruiter's new request appears here without a refresh.
    useEffect(
        () =>
            subscribeAllRequests(setAllRequests, (error) => {
                console.error('Error listening to subscription requests:', error);
                popup.error('Failed to load subscription requests');
            }),
        []
    );

    const pending = useMemo(() => requests.filter((r) => r.status === 'pending'), [requests]);
    const history = useMemo(() => requests.filter((r) => r.status !== 'pending'), [requests]);

    const run = async (id: string, work: () => Promise<void>, success: string) => {
        setBusyId(id);
        try {
            await work();
            popup.success(success);
            await load();
        } catch (error) {
            console.error(error);
            popup.error(error instanceof Error ? error.message : 'Something went wrong');
        } finally {
            setBusyId(null);
        }
    };

    const handleApprove = (r: SubscriptionRequest) =>
        run(`req-${r.id}`, () => approveRequest(r, adminId ?? ''), `${r.planName} approved for ${r.recruiterName}`);

    const handleReject = (r: SubscriptionRequest) => {
        const note = window.prompt(`Reason for declining ${r.recruiterName}'s request (optional):`);
        if (note === null) return; // cancelled
        return run(`req-${r.id}`, () => rejectRequest(r, adminId ?? '', note.trim() || undefined), 'Request declined');
    };

    const handleDeletePlan = (p: SubscriptionPlan) => {
        if (!p.id || !window.confirm(`Delete the ${p.name} plan? ${isUserSide ? 'Users' : 'Recruiters'} already on it keep their current terms.`)) return;
        return run(`plan-${p.id}`, () => deletePlan(p.id as string), 'Plan deleted');
    };

    const handleRevoke = (recruiter: Recruiter) => {
        if (!window.confirm(`Remove ${recruiter.name}'s subscription? They go back to the free tier.`)) return;
        return run(`rec-${recruiter.id}`, () => revokeSubscription(recruiter.id), 'Subscription removed');
    };

    const handleSavePlan = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form) return;

        const level = parseInt(form.level, 10);
        const price = Number(form.price || 0);
        const durationDays = parseInt(form.durationDays, 10);
        const maxPosts = form.maxPostsUnlimited ? UNLIMITED : parseInt(form.maxPosts, 10);
        const maxCandidates = isUserSide ? 0 : form.maxCandidatesUnlimited ? UNLIMITED : parseInt(form.maxCandidates, 10);

        if (!form.name.trim()) return popup.error('Plan name is required');
        if (!Number.isInteger(level) || level < 1) return popup.error('Level must be 1 or higher');
        if (!Number.isFinite(price) || price < 0) return popup.error('Price cannot be negative');
        if (!Number.isInteger(durationDays) || durationDays < 1) return popup.error('Duration must be at least 1 day');
        if (!form.maxPostsUnlimited && (!Number.isInteger(maxPosts) || maxPosts < 1)) return popup.error(`Enter a ${isUserSide ? 'job view' : 'post'} limit of 1 or more, or tick Unlimited`);
        if (!isUserSide && !form.maxCandidatesUnlimited && (!Number.isInteger(maxCandidates) || maxCandidates < 1)) return popup.error('Enter a candidate limit of 1 or more, or tick Unlimited');
        if (plans.some((p) => p.level === level && p.id !== form.id)) return popup.error(`Level ${level} is already used by another plan`);

        setSaving(true);
        try {
            await savePlan({
                id: form.id,
                audience,
                level,
                name: form.name.trim(),
                description: form.description.trim(),
                price,
                durationDays,
                maxPosts,
                maxCandidates,
                features: form.features.split('\n').map((f) => f.trim()).filter(Boolean),
                active: true,
            });
            popup.success(form.id ? 'Plan updated' : 'Plan created');
            setForm(null);
            await load();
        } catch (error) {
            console.error('Error saving plan:', error);
            popup.error('Failed to save plan');
        } finally {
            setSaving(false);
        }
    };

    const tabs: { key: Section; label: string; count?: number }[] = [
        { key: 'requests', label: 'Requests', count: pending.length },
        { key: 'plans', label: 'Plans', count: plans.length },
        { key: 'subscribers', label: isUserSide ? 'Users' : 'Recruiters' },
    ];

    const isEmpty = !loading && (
        section === 'requests' ? requests.length === 0 : section === 'plans' ? plans.length === 0 : recruiters.length === 0
    );

    const fieldClass = `w-full p-2.5 rounded-lg ${skin.field} ${FOCUS}`;

    return (
        <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-4 flex-1 flex flex-col`}>
            <div className={`shrink-0 flex flex-wrap items-center justify-between gap-3 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash} px-4 py-3.5 sm:px-5`}>
                <div>
                    <h2 className={skin.heading}>Subscriptions</h2>
                    <p className={`mt-1.5 ${skin.body}`}>
                        Manage subscription levels, review requests and see who is on which plan.
                    </p>
                </div>
                <div role="tablist" aria-label="Subscription audience" className={`${skin.track} h-9`}>
                    {([['recruiter', 'Recruiters'], ['user', 'Users']] as const).map(([key, label]) => (
                        <button
                            key={key}
                            role="tab"
                            aria-selected={audience === key}
                            onClick={() => setAudience(key)}
                            className={`cursor-pointer px-4 text-xs font-semibold transition-colors duration-200 ${FOCUS} ${audience === key ? skin.trackBtnActive : skin.trackBtnIdle}`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="tablist" aria-label="Subscription sections" className={`${skin.track} h-9`}>
                    {tabs.map((t) => (
                        <button
                            key={t.key}
                            role="tab"
                            aria-selected={section === t.key}
                            onClick={() => setSection(t.key)}
                            className={`cursor-pointer px-4 text-xs font-semibold transition-colors duration-200 ${FOCUS} ${section === t.key ? skin.trackBtnActive : skin.trackBtnIdle}`}
                        >
                            {t.label}
                            {t.count !== undefined && t.count > 0 ? ` (${t.count})` : ''}
                        </button>
                    ))}
                </div>
                {section === 'plans' && (
                    <button
                        type="button"
                        onClick={() => setForm(emptyForm(Math.max(0, ...plans.map((p) => p.level)) + 1))}
                        className={`inline-flex items-center gap-2 cursor-pointer rounded-lg ${skin.cta} ${FOCUS}`}
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" /> Add plan
                    </button>
                )}
            </div>

            {/* White body panel. Empty tab: a grey section fills it with the message
                centred. With a list: the panel hugs its content. */}
            <div
                className={
                    loading || isEmpty
                        ? `border ${skin.edge} ${skin.resultsPanel} ${skin.radius} p-3 md:p-4 flex-1 flex flex-col`
                        : `border ${skin.edge} ${skin.resultsPanel} ${skin.radius} p-3 md:p-4`
                }
            >
                {loading ? (
                    <div className="flex min-h-[260px] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-brand" aria-label="Loading" />
                    </div>
                ) : isEmpty ? (
                    <div className={`flex flex-1 items-center justify-center border ${skin.edge} ${skin.cardSurface} ${skin.radius} px-6 text-center`}>
                        <p className={skin.body}>{emptyMessage(section, audience)}</p>
                    </div>
                ) : section === 'requests' ? (
                    /* One grey list section inside the white body panel; open requests first. */
                    <ul className={`divide-y ${skin.divide} overflow-hidden border ${skin.edge} ${skin.cardSurface} ${skin.radius}`}>
                        {[...pending, ...history].map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold text-ink">{r.recruiterName}</p>
                                    <p className={`truncate ${skin.meta}`}>{r.recruiterEmail}</p>
                                    <p className={`mt-1 ${skin.body}`}>
                                        {r.status === 'pending' ? 'Wants' : 'Requested'} <strong className="text-ink">{r.planName}</strong> (Level {r.planLevel}) &middot; {formatDate(r.createdAt)}
                                        {r.status !== 'pending' && <> &middot; Resolved {formatDate(r.resolvedAt)}{r.note ? ` \u00B7 ${r.note}` : ''}</>}
                                    </p>
                                </div>
                                {r.status === 'pending' ? (
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            disabled={busyId === `req-${r.id}`}
                                            onClick={() => handleReject(r)}
                                            className={`inline-flex items-center gap-1.5 cursor-pointer rounded-lg ${skin.secondary} ${FOCUS} disabled:opacity-50`}
                                        >
                                            <X className="h-4 w-4" aria-hidden="true" /> Decline
                                        </button>
                                        <button
                                            type="button"
                                            disabled={busyId === `req-${r.id}`}
                                            onClick={() => handleApprove(r)}
                                            className={`inline-flex items-center gap-1.5 cursor-pointer rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}
                                        >
                                            {busyId === `req-${r.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                                            Approve
                                        </button>
                                    </div>
                                ) : (
                                    <span className={`${skin.chip} rounded-lg`}>{STATUS_LABEL[r.status]}</span>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : section === 'plans' ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                        {plans.map((p) => (
                            <article key={p.id} className={`flex h-full flex-col overflow-hidden border ${skin.edge} ${skin.cardSurface} ${skin.radius} transition-colors duration-200 ${skin.cardHover}`}>
                                <div className="flex flex-1 flex-col p-4 sm:p-5">
                                    <h4 className={`min-w-0 line-clamp-2 min-h-[2.5em] ${skin.cardTitle} text-base!`}>{p.name}</h4>
                                    <span className={`mt-1 block ${skin.micro}`}>Level {p.level}</span>

                                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                                        <span className={`flex items-center gap-1.5 ${skin.cardValue} font-semibold!`}>
                                            <IndianRupee className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                            {p.price > 0 ? `${p.price.toLocaleString('en-IN')} / ${p.durationDays} days` : `Free / ${p.durationDays} days`}
                                        </span>
                                        <span className={`flex items-center gap-1.5 ${skin.cardValue} font-semibold!`}>
                                            <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                            {formatLimit(p.maxPosts)} {isUserSide ? 'jobs viewable' : 'posts'}
                                        </span>
                                        {!isUserSide && (
                                            <span className={`flex items-center gap-1.5 ${skin.cardValue} font-semibold!`}>
                                                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                                {formatLimit(p.maxCandidates)} candidates
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-4 flex-1">
                                        <span className={`mb-2 block ${skin.micro} font-bold!`}>Includes</span>
                                        <p className={`line-clamp-2 ${skin.body}`}>
                                            {p.description || p.features.filter(Boolean).join(', ') || '-'}
                                        </p>
                                    </div>

                                    <div className="mt-4 flex items-center justify-between gap-2">
                                        <span className={`flex items-center gap-1.5 ${skin.meta}`}>
                                            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                                            {timeAgo(p.createdAt)}
                                        </span>
                                        <span className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setForm(formFromPlan(p))}
                                                aria-label={`Edit ${p.name}`}
                                                title="Edit"
                                                className={`p-2 border ${skin.edge} bg-surface text-ink/70 ${skin.radius} hover:text-ink hover:border-ink/40 cursor-pointer transition-colors duration-200 ${FOCUS}`}
                                            >
                                                <Pencil className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busyId === `plan-${p.id}`}
                                                onClick={() => handleDeletePlan(p)}
                                                aria-label={`Delete ${p.name}`}
                                                title="Delete"
                                                className={`p-2 border border-destructive bg-surface text-destructive ${skin.radius} hover:bg-destructive/10 cursor-pointer transition-colors duration-200 ${FOCUS} disabled:opacity-50`}
                                            >
                                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                                            </button>
                                        </span>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                ) : (
                    <div className={`overflow-x-auto border ${skin.edge} ${skin.cardSurface} ${skin.radius}`}>
                        <table className={`min-w-full divide-y ${skin.divide}`}>
                            <thead className="bg-ink/5">
                                <tr>
                                    <th scope="col" className={`px-4 py-3 text-left ${skin.micro}`}>{isUserSide ? 'User' : 'Recruiter'}</th>
                                    <th scope="col" className={`px-4 py-3 text-left ${skin.micro}`}>Plan</th>
                                    <th scope="col" className={`px-4 py-3 text-left ${skin.micro}`}>Valid until</th>
                                    <th scope="col" className={`px-4 py-3 text-center ${skin.micro}`}>Delete</th>
                                </tr>
                            </thead>
                            <tbody className={`divide-y ${skin.divide}`}>
                                {recruiters.map((r) => {
                                    const sub = resolveSubscription(r.data);
                                    const hasPlan = sub.source === 'plan' || sub.source === 'legacy';
                                    return (
                                        <tr key={r.id}>
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-semibold text-ink">{r.name}</p>
                                                <p className={skin.meta}>{r.email}</p>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-ink/80">
                                                {sub.planName}
                                                {sub.expired && <span className="ml-2 text-xs text-destructive">expired</span>}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-ink/80">{sub.expiresAt ? formatDate(sub.expiresAt) : '-'}</td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    type="button"
                                                    disabled={!hasPlan || busyId === `rec-${r.id}`}
                                                    onClick={() => handleRevoke(r)}
                                                    aria-label={hasPlan ? `Remove ${r.name}'s subscription` : `${r.name} is on the Free plan`}
                                                    title={hasPlan ? 'Remove subscription' : 'Free plan - nothing to remove'}
                                                    className={`p-2 border border-destructive bg-surface text-destructive ${skin.radius} hover:bg-destructive/10 cursor-pointer transition-colors duration-200 ${FOCUS} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface`}
                                                >
                                                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {form && (
                <div role="dialog" aria-modal="true" aria-labelledby="plan-form-title" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <form
                        onSubmit={handleSavePlan}
                        className={`w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}
                    >
                        <h3 id="plan-form-title" className={skin.heading}>{form.id ? 'Edit' : 'Add'} {isUserSide ? 'user' : 'recruiter'} plan</h3>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="col-span-1">
                                <label htmlFor="plan-level" className="block text-xs font-bold text-ink/80 mb-1">Level</label>
                                <input id="plan-level" required type="number" min={1} value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className={fieldClass} />
                            </div>
                            <div className="col-span-2">
                                <label htmlFor="plan-name" className="block text-xs font-bold text-ink/80 mb-1">Name</label>
                                <input id="plan-name" required type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={fieldClass} placeholder="e.g. Standard" />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="plan-desc" className="block text-xs font-bold text-ink/80 mb-1">Description</label>
                            <input id="plan-desc" type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={fieldClass} />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="plan-price" className="block text-xs font-bold text-ink/80 mb-1">Price (INR)</label>
                                <input id="plan-price" type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className={fieldClass} placeholder="0 = free" />
                            </div>
                            <div>
                                <label htmlFor="plan-days" className="block text-xs font-bold text-ink/80 mb-1">Valid for (days)</label>
                                <input id="plan-days" required type="number" min={1} value={form.durationDays} onChange={(e) => setForm({ ...form, durationDays: e.target.value })} className={fieldClass} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label htmlFor="plan-posts" className="block text-xs font-bold text-ink/80 mb-1">{isUserSide ? 'Job posts viewable' : 'Max job posts'}</label>
                                <input id="plan-posts" type="number" min={1} disabled={form.maxPostsUnlimited} value={form.maxPostsUnlimited ? '' : form.maxPosts} onChange={(e) => setForm({ ...form, maxPosts: e.target.value })} className={`${fieldClass} disabled:opacity-50`} />
                                <label className="mt-1.5 flex items-center gap-2 text-xs text-ink/70">
                                    <input type="checkbox" checked={form.maxPostsUnlimited} onChange={(e) => setForm({ ...form, maxPostsUnlimited: e.target.checked })} /> Unlimited
                                </label>
                            </div>
                            {!isUserSide && (
                            <div>
                                <label htmlFor="plan-cands" className="block text-xs font-bold text-ink/80 mb-1">Max candidates visible</label>
                                <input id="plan-cands" type="number" min={1} disabled={form.maxCandidatesUnlimited} value={form.maxCandidatesUnlimited ? '' : form.maxCandidates} onChange={(e) => setForm({ ...form, maxCandidates: e.target.value })} className={`${fieldClass} disabled:opacity-50`} />
                                <label className="mt-1.5 flex items-center gap-2 text-xs text-ink/70">
                                    <input type="checkbox" checked={form.maxCandidatesUnlimited} onChange={(e) => setForm({ ...form, maxCandidatesUnlimited: e.target.checked })} /> Unlimited
                                </label>
                            </div>
                            )}
                        </div>

                        <div>
                            <label htmlFor="plan-features" className="block text-xs font-bold text-ink/80 mb-1">Extra features (one per line)</label>
                            <textarea id="plan-features" rows={3} value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} className={fieldClass} />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={() => setForm(null)} className={`flex-1 cursor-pointer rounded-lg ${skin.secondary} ${FOCUS}`}>
                                Cancel
                            </button>
                            <button type="submit" disabled={saving} className={`flex-1 cursor-pointer rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}>
                                {saving ? 'Saving...' : 'Save plan'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
