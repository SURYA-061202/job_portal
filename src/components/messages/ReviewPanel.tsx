import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MAX_FEEDBACK, getMyFeedback, listFeedback, saveFeedback, type Feedback } from '@/lib/feedback';
import type { MessagingProfile } from '@/lib/messaging';
import { timeAgo, toMillis } from '@/lib/profileViews';
import StarRating from '@/components/ui/StarRating';
import { useSkin, FOCUS } from '@/styles/skin';

const ROLE_LABEL: Record<string, string> = { user: 'Job seeker', recruiter: 'Recruiter', manager: 'Recruiter' };

const permissionHint = (err: unknown) =>
    (err as { code?: string })?.code === 'permission-denied'
        ? 'Reviews are blocked by the database rules. The updated Firestore rules need to be deployed.'
        : null;

/** The admin sees every review with the average at the top. */
function AdminReviews() {
    const skin = useSkin();
    const [reviews, setReviews] = useState<Feedback[] | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        listFeedback()
            .then(setReviews)
            .catch(err => {
                console.error('Could not load reviews:', err);
                setError(permissionHint(err) ?? 'Could not load the reviews. Please try again.');
            });
    }, []);

    if (error) return <p role="alert" className="m-5 rounded-lg bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">{error}</p>;
    if (!reviews) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink/60"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</div>;
    if (reviews.length === 0) return <p className={`px-6 py-16 text-center ${skin.body}`}>No reviews yet. They appear here when someone rates the portal.</p>;

    const average = reviews.reduce((n, r) => n + r.rating, 0) / reviews.length;
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto">
            <div className={`flex items-center gap-3 border-b ${skin.edge} px-5 py-4`}>
                <span className="text-3xl font-black leading-none text-ink">{average.toFixed(1)}</span>
                <div>
                    <StarRating value={average} label="Average rating" />
                    <p className={`mt-0.5 ${skin.meta}`}>{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</p>
                </div>
            </div>
            <ul className={`divide-y ${skin.divide}`}>
                {reviews.map(r => (
                    <li key={r.id} className="px-5 py-4">
                        <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-semibold text-ink">{r.userName} <span className="font-medium text-ink/50">· {ROLE_LABEL[r.userRole] ?? r.userRole}</span></p>
                            <span className={`shrink-0 ${skin.meta}`}>{timeAgo(toMillis(r.updatedAt))}</span>
                        </div>
                        <div className="mt-1 flex"><StarRating value={r.rating} label={`${r.userName}'s rating`} /></div>
                        {r.comment && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink/85">{r.comment}</p>}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Everyone else rates the portal with five stars and a few words, and can change it later. */
function WriteReview({ profile }: { profile: MessagingProfile }) {
    const skin = useSkin();
    const [loading, setLoading] = useState(true);
    const [existing, setExisting] = useState<Feedback | null>(null);
    const [rating, setRating] = useState(0);
    const [comment, setComment] = useState('');
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

    useEffect(() => {
        getMyFeedback(profile.uid)
            .then(f => {
                setExisting(f);
                if (f) { setRating(f.rating); setComment(f.comment); }
            })
            .catch(err => {
                console.error('Could not load your review:', err);
                setNotice({ ok: false, text: permissionHint(err) ?? 'Could not load your review.' });
            })
            .finally(() => setLoading(false));
    }, [profile.uid]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (rating < 1) { setNotice({ ok: false, text: 'Choose a star rating first.' }); return; }
        setSaving(true);
        setNotice(null);
        try {
            await saveFeedback(profile, rating, comment, !existing);
            setExisting(prev => prev ?? { id: profile.uid, userId: profile.uid, userName: profile.name, userRole: profile.userRole, rating, comment });
            setNotice({ ok: true, text: existing ? 'Your review was updated. Thank you!' : 'Thank you for your review!' });
        } catch (err) {
            console.error('Could not save the review:', err);
            setNotice({ ok: false, text: permissionHint(err) ?? 'Could not save your review. Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink/60"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</div>;

    return (
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
            <div>
                <h4 className="text-base font-bold text-ink">{existing ? 'Your review' : 'How is your experience?'}</h4>
                <p className={`mt-0.5 ${skin.meta}`}>Rate the portal and tell us what works and what doesn't.</p>
            </div>

            <div>
                <StarRating value={rating} size="h-9 w-9" label="Your rating" onChange={setRating} />
                <p className={`mt-1 h-4 ${skin.meta}`}>{['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'][rating]}</p>
            </div>

            <label className="block">
                <span className={`mb-1 block ${skin.meta}`}>Description (optional)</span>
                <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value.slice(0, MAX_FEEDBACK))}
                    rows={5}
                    placeholder="What did you like? What could be better?"
                    className={`w-full resize-y rounded-lg border ${skin.edge} bg-surface px-3 py-2 text-sm text-ink ${FOCUS}`}
                />
                <span className={`mt-1 block text-right ${skin.meta}`}>{comment.length}/{MAX_FEEDBACK}</span>
            </label>

          </div>

          <div className={`shrink-0 space-y-3 border-t ${skin.edge} p-4`}>
            {notice && (
                <p role={notice.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm font-medium ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-destructive/10 text-destructive'}`}>{notice.text}</p>
            )}
            <button type="submit" disabled={saving} className={`inline-flex cursor-pointer w-full items-center justify-center gap-2 rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {existing ? 'Update review' : 'Submit review'}
            </button>
          </div>
        </form>
    );
}

/** Review tab: the admin reads reviews, everyone else writes one. */
export default function ReviewPanel({ profile }: { profile: MessagingProfile }) {
    return (
        <div className="flex min-h-0 flex-1 flex-col bg-surface">
            {profile.isAdmin ? <AdminReviews /> : <WriteReview profile={profile} />}
        </div>
    );
}
