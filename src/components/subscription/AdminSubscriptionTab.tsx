import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Check, ClipboardList, Loader2, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';
import {
    approveRequest,
    deletePlan,
    deleteRequest,
    formatDate,
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
import PlanPricingCard from './PlanPricingCard';
import PlanSlider from './PlanSlider';
import ExpandingModal from './ExpandingModal';
import type { SubscriptionAudience, SubscriptionPlan, SubscriptionRequest } from '@/types';

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

const STATUS_LABEL: Record<SubscriptionRequest['status'], string> = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Declined',
};

export default function AdminSubscriptionTab({ adminId }: { adminId: string | null }) {
    const skin = useSkin();
    // Plans are for recruiters only; one subscription unlocks contact details, resumes and posts.
    const audience = 'recruiter' as SubscriptionAudience;
    // Requests and Recruiters open in a modal that grows out of their header icon.
    const [reqFilter, setReqFilter] = useState<'all' | 'pending' | 'resolved'>('all');
    const [recSearch, setRecSearch] = useState('');
    const [panel, setPanel] = useState<{ kind: 'requests' | 'recruiters'; x: number; y: number } | null>(null);
    const openPanel = (kind: 'requests' | 'recruiters', el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        setPanel({ kind, x: r.left + r.width / 2, y: r.top + r.height / 2 });
    };
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

    const handleDeleteRequest = (r: SubscriptionRequest) => {
        if (!r.id || !window.confirm(`Delete ${r.recruiterName}'s request for ${r.planName}?${r.status === 'pending' ? ' It has not been answered yet.' : ''}`)) return;
        return run(`req-${r.id}`, () => deleteRequest(r.id as string), 'Request deleted');
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
        const maxCandidates = UNLIMITED; // every plan can view all candidates

        if (!form.name.trim()) return popup.error('Plan name is required');
        if (!Number.isInteger(level) || level < 1) return popup.error('Level must be 1 or higher');
        if (!Number.isFinite(price) || price < 0) return popup.error('Price cannot be negative');
        if (!Number.isInteger(durationDays) || durationDays < 1) return popup.error('Duration must be at least 1 day');
        if (!form.maxPostsUnlimited && (!Number.isInteger(maxPosts) || maxPosts < 1)) return popup.error(`Enter a ${isUserSide ? 'job view' : 'post'} limit of 1 or more, or tick Unlimited`);
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


    const fieldClass = `w-full p-2.5 rounded-lg ${skin.field} ${FOCUS}`;

    return (
        <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-4 flex-1 flex flex-col`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0">
                    <h2 className={skin.heading}>Subscription plans</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                    <button
                        type="button"
                        onClick={(e) => openPanel('requests', e.currentTarget)}
                        aria-label={`Requests${pending.length ? ` (${pending.length} pending)` : ''}`}
                        className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border ${skin.edge} bg-surface pl-1.5 pr-4 text-sm font-semibold text-ink shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-ink/40 hover:shadow-md ${FOCUS}`}
                    >
                        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-ink/5">
                            <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                            {pending.length > 0 && (
                                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                                    {pending.length}
                                </span>
                            )}
                        </span>
                        Requests
                    </button>
                    <button
                        type="button"
                        onClick={(e) => openPanel('recruiters', e.currentTarget)}
                        className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border ${skin.edge} bg-surface pl-1.5 pr-4 text-sm font-semibold text-ink shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-ink/40 hover:shadow-md ${FOCUS}`}
                    >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink/5">
                            <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        Recruiters
                    </button>
                    <button
                        type="button"
                        onClick={() => setForm(emptyForm(Math.max(0, ...plans.map((p) => p.level)) + 1))}
                        className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-brand pl-3 pr-5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-px hover:opacity-90 hover:shadow-md ${FOCUS}`}
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" /> Add plan
                    </button>
                </div>
            </div>

            <div className="flex flex-1 flex-col">
                {loading ? (
                    <div className="flex min-h-[260px] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-brand" aria-label="Loading" />
                    </div>
                ) : plans.length === 0 ? (
                    <div className={`flex min-h-[200px] flex-1 items-center justify-center border ${skin.edge} ${skin.cardSurface} ${skin.radius} px-6 text-center`}>
                        <p className={skin.body}>No plans yet. Use Add plan to create one.</p>
                    </div>
                ) : (
                    <PlanSlider>
                        {plans.map((p) => (
                            <PlanPricingCard
                                key={p.id}
                                plan={p}
                                audience={audience}
                                corner={(
                                    <>
                                            <button
                                                type="button"
                                                onClick={() => setForm(formFromPlan(p))}
                                                aria-label={`Edit ${p.name}`}
                                                title="Edit"
                                                className={`p-1 text-ink/50 rounded-md hover:bg-ink/5 hover:text-ink cursor-pointer transition-colors duration-200 ${FOCUS}`}
                                            >
                                                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                disabled={busyId === `plan-${p.id}`}
                                                onClick={() => handleDeletePlan(p)}
                                                aria-label={`Delete ${p.name}`}
                                                title="Delete"
                                                className={`p-1 text-destructive/80 rounded-md hover:bg-destructive/10 cursor-pointer transition-colors duration-200 ${FOCUS} disabled:opacity-50`}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                    </>
                                )}
                            />
                        ))}
                    </PlanSlider>
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
            {panel && (
                <ExpandingModal
                    origin={{ x: panel.x, y: panel.y }}
                    title={panel.kind === 'requests' ? 'Subscription requests' : 'Recruiters'}
                    onClose={() => setPanel(null)}
                >
                    {panel.kind === 'requests' ? (
                        <>
                            <div className={`flex shrink-0 gap-2 border-b ${skin.edge} px-5 py-3`}>
                                {([['all', 'All', requests.length], ['pending', 'Pending', pending.length], ['resolved', 'Resolved', history.length]] as const).map(([key, label, n]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setReqFilter(key)}
                                        aria-pressed={reqFilter === key}
                                        className={`cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200 ${FOCUS} ${reqFilter === key ? 'bg-ink text-surface' : 'bg-ink/5 text-ink/70 hover:bg-ink/10'}`}
                                    >
                                        {label} ({n})
                                    </button>
                                ))}
                            </div>
                            {(() => {
                                const rows = reqFilter === 'pending' ? pending : reqFilter === 'resolved' ? history : [...pending, ...history];
                                if (rows.length === 0) {
                                    return <p className={`px-6 py-16 text-center ${skin.body}`}>{requests.length === 0 ? 'No subscription requests yet.' : 'Nothing in this view.'}</p>;
                                }
                                return (
                                    <table className="min-w-full">
                                        <thead className={`sticky top-0 z-10 border-b ${skin.edge} bg-surface`}>
                                            <tr>
                                                <th scope="col" className={`px-5 py-3 text-left ${skin.micro}`}>Recruiter</th>
                                                <th scope="col" className={`px-3 py-3 text-left ${skin.micro}`}>Plan</th>
                                                <th scope="col" className={`px-3 py-3 text-left ${skin.micro}`}>Status</th>
                                                <th scope="col" className={`px-5 py-3 text-center ${skin.micro}`}>Delete</th>
                                            </tr>
                                        </thead>
                                        <tbody className={`divide-y ${skin.divide}`}>
                                            {rows.map((r) => {
                                                const busy = busyId === `req-${r.id}`;
                                                const chip =
                                                    r.status === 'approved' ? 'bg-green-500/10 text-green-700'
                                                    : r.status === 'rejected' ? 'bg-destructive/10 text-destructive'
                                                    : 'bg-amber-500/15 text-amber-700';
                                                return (
                                                    <tr key={r.id} className="transition-colors duration-150 hover:bg-ink/[0.03]">
                                                        <td className="px-5 py-3.5">
                                                            <p className="text-sm font-semibold text-ink">{r.recruiterName}</p>
                                                            <p className={skin.meta}>{r.recruiterEmail}</p>
                                                        </td>
                                                        <td className="px-3 py-3.5">
                                                            <p className="text-sm text-ink">{r.planName}</p>
                                                            <p className={skin.meta}>{formatDate(r.createdAt)}</p>
                                                        </td>
                                                        <td className="px-3 py-3.5">
                                                            {r.status === 'pending' ? (
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip}`}>{STATUS_LABEL[r.status]}</span>
                                                                    <>
                                                                        <button
                                                                            type="button"
                                                                            disabled={busy}
                                                                            onClick={() => handleReject(r)}
                                                                            className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border ${skin.edge} bg-surface px-2 text-[11px] font-semibold text-ink/80 hover:border-ink/40 ${FOCUS} disabled:opacity-50`}
                                                                        >
                                                                            <X className="h-3 w-3" aria-hidden="true" /> Decline
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={busy}
                                                                            onClick={() => handleApprove(r)}
                                                                            className={`inline-flex h-6 cursor-pointer items-center gap-1 rounded-md bg-brand px-2 text-[11px] font-semibold text-white hover:opacity-90 ${FOCUS} disabled:opacity-50`}
                                                                        >
                                                                            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3 w-3" aria-hidden="true" />}
                                                                            Approve
                                                                        </button>
                                                                    </>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${chip}`}>{STATUS_LABEL[r.status]}</span>
                                                                    <p className={`mt-1 ${skin.meta}`}>{formatDate(r.resolvedAt)}{r.note ? ` \u00B7 ${r.note}` : ''}</p>
                                                                </>
                                                            )}
                                                        </td>
                                                        <td className="px-5 py-3.5">
                                                            <div className="flex justify-center">
                                                                <button
                                                                    type="button"
                                                                    disabled={busy}
                                                                    onClick={() => handleDeleteRequest(r)}
                                                                    aria-label={`Delete ${r.recruiterName}'s request`}
                                                                    title="Delete request"
                                                                    className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-destructive/60 bg-surface text-destructive hover:bg-destructive/10 ${FOCUS} disabled:opacity-50`}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                );
                            })()}
                        </>
                    ) : (
                        <>
                            <div className={`flex shrink-0 items-center justify-between gap-3 border-b ${skin.edge} px-5 py-3`}>
                                <label htmlFor="recruiter-search" className="sr-only">Search recruiters</label>
                                <input
                                    id="recruiter-search"
                                    type="text"
                                    value={recSearch}
                                    onChange={(e) => setRecSearch(e.target.value)}
                                    placeholder="Search recruiters"
                                    className={`h-9 w-52 max-w-[60%] rounded-lg border border-ink/20 bg-surface px-3 text-sm text-ink placeholder:text-ink/40 ${FOCUS}`}
                                />
                                <span className={`shrink-0 ${skin.meta}`}>{recruiters.length} recruiter{recruiters.length === 1 ? '' : 's'}</span>
                            </div>
                            {(() => {
                                const q = recSearch.trim().toLowerCase();
                                const rows = q ? recruiters.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(q)) : recruiters;
                                if (rows.length === 0) {
                                    return <p className={`px-6 py-16 text-center ${skin.body}`}>{recruiters.length === 0 ? 'No recruiters yet. Add them from Add Recruiters.' : 'No recruiter matches your search.'}</p>;
                                }
                                return (
                                    <table className="min-w-full">
                                        <thead className={`sticky top-0 z-10 border-b ${skin.edge} bg-surface`}>
                                            <tr>
                                                <th scope="col" className={`px-5 py-3 text-left ${skin.micro}`}>Recruiter</th>
                                                <th scope="col" className={`px-3 py-3 text-left ${skin.micro}`}>Plan</th>
                                                <th scope="col" className={`px-3 py-3 text-left ${skin.micro}`}>Valid until</th>
                                                <th scope="col" className={`px-5 py-3 text-center ${skin.micro}`}>Remove</th>
                                            </tr>
                                        </thead>
                                        <tbody className={`divide-y ${skin.divide}`}>
                                            {rows.map((r) => {
                                                const sub = resolveSubscription(r.data);
                                                const hasPlan = sub.source === 'plan' || sub.source === 'legacy';
                                                return (
                                                    <tr key={r.id} className="transition-colors duration-150 hover:bg-ink/[0.03]">
                                                        <td className="px-5 py-3.5">
                                                            <p className="text-sm font-semibold text-ink">{r.name}</p>
                                                            <p className={skin.meta}>{r.email}</p>
                                                        </td>
                                                        <td className="px-3 py-3.5">
                                                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${hasPlan ? 'bg-brand/10 text-brand' : 'bg-ink/5 text-ink/60'}`}>{sub.planName}</span>
                                                            {sub.expired && <span className="ml-2 text-xs font-medium text-destructive">expired</span>}
                                                        </td>
                                                        <td className="px-3 py-3.5 text-sm text-ink/80">{sub.expiresAt ? formatDate(sub.expiresAt) : '-'}</td>
                                                        <td className="px-5 py-3.5">
                                                            <div className="flex justify-center">
                                                                <button
                                                                    type="button"
                                                                    disabled={!hasPlan || busyId === `rec-${r.id}`}
                                                                    onClick={() => handleRevoke(r)}
                                                                    aria-label={hasPlan ? `Remove ${r.name}'s subscription` : `${r.name} is on the Free plan`}
                                                                    title={hasPlan ? 'Remove subscription' : 'Free plan - nothing to remove'}
                                                                    className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-destructive/60 bg-surface text-destructive hover:bg-destructive/10 ${FOCUS} disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface`}
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                );
                            })()}
                        </>
                    )}
                </ExpandingModal>
            )}
        </div>
    );
}
