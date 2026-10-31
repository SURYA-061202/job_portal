import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { ArrowLeft, Briefcase, Building2, Loader2, MapPin, Star, Trash2 } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { listRecentPosts } from '@/lib/jobAlerts';
import {
    MAX_COMMENT, OUTCOMES, RATING_ASPECTS, companySlug, deleteReview, fetchCompanyReviews, findAppliedPostAt,
    reviewId, saveReview, summarize, type AspectKey, type CompanyReview,
} from '@/lib/reviews';
import { timeAgo, toMillis } from '@/lib/profileViews';
import type { RecruitmentRequest } from '@/types';
import UserHeader from '@/components/layout/UserHeader';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

/** Five stars; a number fills them, or pass onChange to let someone pick. */
function Stars({ value, onChange, size = 'h-4 w-4', label }: { value: number; onChange?: (n: number) => void; size?: string; label: string }) {
    return (
        <span className="inline-flex items-center gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={onChange ? label : `${label}: ${value.toFixed(1)} out of 5`}>
            {[1, 2, 3, 4, 5].map(n => {
                const star = <Star className={`${size} ${value >= n - 0.25 ? 'fill-amber-400 text-amber-400' : value >= n - 0.75 ? 'fill-amber-400/50 text-amber-400' : 'text-ink/25'}`} aria-hidden="true" />;
                return onChange ? (
                    <button key={n} type="button" role="radio" aria-checked={Math.round(value) === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)}
                        className={`cursor-pointer rounded p-0.5 transition-transform hover:scale-110 ${FOCUS}`}>{star}</button>
                ) : <span key={n}>{star}</span>;
            })}
        </span>
    );
}

const blankRatings = () => Object.fromEntries(RATING_ASPECTS.map(a => [a.key, 0])) as Record<AspectKey, number>;

/** A company's open jobs and what applicants say about its hiring process. */
export default function CompanyPage() {
    const { slug = '' } = useParams();
    const navigate = useNavigate();
    const skin = useSkin();
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState<string | null>(null);
    const [me, setMe] = useState<{ uid: string; name: string } | null>(null);
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
    const [reviews, setReviews] = useState<CompanyReview[]>([]);
    const [appliedPost, setAppliedPost] = useState<RecruitmentRequest | null>(null);
    const [form, setForm] = useState({ ratings: blankRatings(), comment: '', outcome: 'in-process' as CompanyReview['outcome'], anonymous: false });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async (uid: string) => {
        try {
            const [userSnap, allPosts, list] = await Promise.all([getDoc(doc(db, 'users', uid)), listRecentPosts(), fetchCompanyReviews(slug)]);
            const u = userSnap.exists() ? userSnap.data() : {};
            const userRole = String(u.role || 'user');
            setRole(userRole);
            setMe({ uid, name: `${u.firstName || ''} ${String(u.lastName || '').charAt(0)}`.trim() });
            setPosts(allPosts.filter(p => companySlug(p.companyName || '') === slug));
            setReviews(list);
            if (userRole === 'user') setAppliedPost(await findAppliedPostAt(slug, uid));

            const mine = list.find(r => r.userId === uid);
            if (mine) setForm({ ratings: { ...blankRatings(), ...mine.ratings }, comment: mine.comment, outcome: mine.outcome, anonymous: mine.anonymous });
        } catch (err) {
            console.error('Error loading company page:', err);
            popup.error('Failed to load this company');
        } finally {
            setLoading(false);
        }
    }, [slug]);

    useEffect(() => onAuthStateChanged(auth, user => {
        if (!user) { navigate('/', { replace: true }); return; }
        void load(user.uid);
    }), [load, navigate]);

    const summary = useMemo(() => summarize(reviews), [reviews]);
    const companyName = posts[0]?.companyName || reviews[0]?.companyName || '';
    const myReview = reviews.find(r => r.userId === me?.uid);
    const canReview = role === 'user' && (!!appliedPost || !!myReview);
    const allRated = RATING_ASPECTS.every(a => form.ratings[a.key] > 0);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!me || !allRated) return;
        const postId = myReview?.postId || appliedPost?.id;
        if (!postId) return;
        setSaving(true);
        try {
            const overall = RATING_ASPECTS.reduce((n, a) => n + form.ratings[a.key], 0) / RATING_ASPECTS.length;
            await saveReview({
                companySlug: slug,
                companyName,
                userId: me.uid,
                postId,
                ratings: form.ratings,
                overall: Math.round(overall * 10) / 10,
                comment: form.comment.trim().slice(0, MAX_COMMENT),
                outcome: form.outcome,
                anonymous: form.anonymous,
                authorName: form.anonymous ? '' : me.name,
            }, !myReview);
            popup.success(myReview ? 'Review updated' : 'Thanks for sharing your experience');
            setReviews(await fetchCompanyReviews(slug));
        } catch (err) {
            console.error('Error saving review:', err);
            popup.error('Could not save your review');
        } finally {
            setSaving(false);
        }
    };

    const removeMine = async () => {
        if (!me) return;
        try {
            await deleteReview(slug, me.uid);
            setForm({ ratings: blankRatings(), comment: '', outcome: 'in-process', anonymous: false });
            setReviews(await fetchCompanyReviews(slug));
            popup.success('Your review was deleted');
        } catch {
            popup.error('Could not delete your review');
        }
    };

    const shell = (body: React.ReactNode) => (
        <div className={`min-h-screen ${skin.canvas} flex flex-col`}>
            {role === 'user' || role === null ? <UserHeader /> : null}
            <main className="mx-auto w-full max-w-4xl flex-1 space-y-5 px-4 py-6 sm:px-6 sm:py-8">
                <button type="button" onClick={() => navigate(-1)} className={`inline-flex cursor-pointer items-center gap-2 ${skin.secondary} ${FOCUS}`}>
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />Back
                </button>
                {body}
            </main>
        </div>
    );

    if (loading) return shell(<div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-ink/40" aria-label="Loading" /></div>);
    if (!companyName) return shell(
        <div className={`rounded-2xl border border-dashed ${skin.edge} bg-surface px-6 py-16 text-center`}>
            <Building2 className="mx-auto h-8 w-8 text-ink/30" aria-hidden="true" />
            <p className="mt-3 text-base font-bold text-ink">Company not found</p>
            <p className={`mt-1 ${skin.body}`}>We couldn't find any jobs or reviews for this company.</p>
        </div>,
    );

    const input = `w-full rounded-lg border ${skin.edge} bg-surface px-3 py-2 text-sm text-ink ${FOCUS}`;

    return shell(
        <>
            {/* Overview */}
            <section className={`rounded-2xl border ${skin.edge} bg-surface p-5 sm:p-6`}>
                <div className="flex flex-wrap items-center gap-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-ink/70 text-xl font-black text-surface" aria-hidden="true">{companyName.charAt(0).toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                        <h1 className={`${skin.heading} truncate`}>{companyName}</h1>
                        <div className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 ${skin.meta}`}>
                            {summary.count > 0 ? (
                                <span className="inline-flex items-center gap-1.5"><Stars value={summary.overall} label="Overall rating" /><span className="font-bold text-ink">{summary.overall.toFixed(1)}</span>({summary.count} {summary.count === 1 ? 'review' : 'reviews'})</span>
                            ) : <span>No reviews yet</span>}
                            <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" aria-hidden="true" />{posts.length} open {posts.length === 1 ? 'job' : 'jobs'}</span>
                        </div>
                    </div>
                </div>

                {summary.count > 0 && (
                    <div className={`mt-5 grid grid-cols-1 gap-x-8 gap-y-3 border-t ${skin.edge} pt-5 sm:grid-cols-2`}>
                        {RATING_ASPECTS.map(a => (
                            <div key={a.key}>
                                <div className="mb-1 flex items-center justify-between text-sm">
                                    <span className="font-semibold text-ink">{a.label}</span>
                                    <span className={skin.meta}>{summary.aspects[a.key].toFixed(1)}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-amber-400" style={{ width: `${(summary.aspects[a.key] / 5) * 100}%` }} /></div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Open jobs */}
            <section className={`overflow-hidden rounded-2xl border ${skin.edge} bg-surface`}>
                <div className={`border-b ${skin.edge} px-5 py-3`}><h2 className={skin.micro}>Open jobs {posts.length > 0 && <span className="font-medium text-ink/40">{posts.length}</span>}</h2></div>
                {posts.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-ink/60">No open jobs right now.</p>
                ) : (
                    <ul className={`divide-y ${skin.divide}`}>
                        {posts.map(p => (
                            <li key={p.id}>
                                <button type="button" onClick={() => navigate(`/job/${p.id}`)} className={`flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-ink/[0.03] ${FOCUS}`}>
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-semibold text-ink">{p.jobTitle}</span>
                                        <span className={`mt-0.5 flex flex-wrap items-center gap-x-3 ${skin.meta}`}>
                                            {p.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{p.location}</span>}
                                            {p.yearsExperience && <span>{p.yearsExperience} yrs</span>}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-xs font-bold text-brand">View</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Write or edit a review */}
            {role === 'user' && (
                <section className={`rounded-2xl border ${skin.edge} bg-surface p-5 sm:p-6`}>
                    <h2 className={skin.micro}>{myReview ? 'Your review' : 'Rate the hiring process'}</h2>
                    {!canReview ? (
                        <p className={`mt-2 ${skin.body}`}>Only people who applied to a job at {companyName} can review it. Apply to one of the jobs above to share your experience.</p>
                    ) : (
                        <form onSubmit={submit} className="mt-4 space-y-5">
                            <div className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                                {RATING_ASPECTS.map(a => (
                                    <div key={a.key} className="flex items-center justify-between gap-3">
                                        <span className="text-sm font-semibold text-ink">{a.label}</span>
                                        <Stars value={form.ratings[a.key]} size="h-5 w-5" label={a.label} onChange={n => setForm(f => ({ ...f, ratings: { ...f.ratings, [a.key]: n } }))} />
                                    </div>
                                ))}
                            </div>
                            <label className="block">
                                <span className={`mb-1 block ${skin.meta}`}>How did it end?</span>
                                <select value={form.outcome} onChange={e => setForm(f => ({ ...f, outcome: e.target.value as CompanyReview['outcome'] }))} className={input}>
                                    {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                            </label>
                            <label className="block">
                                <span className={`mb-1 block ${skin.meta}`}>Your experience (optional)</span>
                                <textarea value={form.comment} onChange={e => setForm(f => ({ ...f, comment: e.target.value.slice(0, MAX_COMMENT) }))} rows={4}
                                    placeholder="How quickly did they reply? Was the process clear and respectful?" className={`${input} resize-y`} />
                                <span className={`mt-1 block text-right ${skin.meta}`}>{form.comment.length}/{MAX_COMMENT}</span>
                            </label>
                            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                                <input type="checkbox" checked={form.anonymous} onChange={e => setForm(f => ({ ...f, anonymous: e.target.checked }))} className="h-4 w-4 accent-brand" />
                                Don't show my name
                            </label>
                            <div className="flex flex-wrap items-center gap-3">
                                <button type="submit" disabled={!allRated || saving} className={`inline-flex cursor-pointer items-center gap-2 ${skin.cta} ${FOCUS} disabled:opacity-50`}>
                                    {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                                    {myReview ? 'Update review' : 'Post review'}
                                </button>
                                {!allRated && <span className={skin.meta}>Rate all five areas to post.</span>}
                                {myReview && (
                                    <button type="button" onClick={removeMine} className={`ml-auto inline-flex cursor-pointer items-center gap-1.5 text-sm font-bold text-destructive hover:underline ${FOCUS}`}>
                                        <Trash2 className="h-4 w-4" aria-hidden="true" />Delete
                                    </button>
                                )}
                            </div>
                        </form>
                    )}
                </section>
            )}

            {/* Reviews */}
            <section className={`overflow-hidden rounded-2xl border ${skin.edge} bg-surface`}>
                <div className={`border-b ${skin.edge} px-5 py-3`}><h2 className={skin.micro}>Reviews {reviews.length > 0 && <span className="font-medium text-ink/40">{reviews.length}</span>}</h2></div>
                {reviews.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-ink/60">No reviews yet. Be the first to share how hiring went.</p>
                ) : (
                    <ul className={`divide-y ${skin.divide}`}>
                        {reviews.map(r => (
                            <li key={reviewId(r.companySlug, r.userId)} className="px-5 py-4">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="inline-flex items-center gap-2"><Stars value={r.overall} label="Rating" /><span className="text-sm font-bold text-ink">{r.overall.toFixed(1)}</span></span>
                                    <span className={skin.meta}>{timeAgo(toMillis(r.createdAt))}</span>
                                </div>
                                <p className={`mt-1 ${skin.meta}`}>
                                    {r.anonymous || !r.authorName ? 'Anonymous applicant' : r.authorName}
                                    {' · '}{OUTCOMES.find(o => o.value === r.outcome)?.label ?? ''}
                                </p>
                                {r.comment && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink/85">{r.comment}</p>}
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {RATING_ASPECTS.map(a => <span key={a.key} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-ink/70">{a.label} {r.ratings?.[a.key] ?? '–'}</span>)}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </>,
    );
}
