import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Briefcase, Check, Loader2, MapPin, X } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Candidate, RecruitmentRequest } from '@/types';
import { useSkin, FOCUS } from '@/styles/skin';
import InterviewInviteModal from './InterviewInviteModal';

interface InviteFlowProps {
    candidate: Candidate;
    userRole?: string | null;
    userId?: string | null;
    /** Posts this candidate already applied to; they are tagged and listed first. */
    appliedPostIds?: string[];
    /** Opened from a post: invite straight to this post, no picker. */
    postId?: string | null;
    onClose: () => void;
    onSent?: () => void;
}

/**
 * Interview Invite: first asks which of the recruiter's posts the candidate is
 * being invited to, then opens the invite form for that post.
 */
export default function InviteFlow({ candidate, userRole, userId, appliedPostIds = [], postId, onClose, onSent }: InviteFlowProps) {
    const skin = useSkin();
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [pickedId, setPickedId] = useState<string>('');
    const [confirmed, setConfirmed] = useState<RecruitmentRequest | null>(null);

    useEffect(() => {
        if (postId) return;
        (async () => {
            try {
                const q = (userRole !== 'admin' && userId)
                    ? query(collection(db, 'recruits'), where('recruiterId', '==', userId))
                    : query(collection(db, 'recruits'));
                const snap = await getDocs(q);
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as RecruitmentRequest));
                list.sort((a, b) => Number(appliedPostIds.includes(b.id as string)) - Number(appliedPostIds.includes(a.id as string)));
                setPosts(list);
                const firstApplied = list.find(p => appliedPostIds.includes(p.id as string));
                if (firstApplied) setPickedId(firstApplied.id as string);
            } catch (err) {
                console.error('Failed to load posts for invite', err);
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userRole, userId]);

    useEffect(() => {
        if (confirmed || postId) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [confirmed, onClose]);

    if (postId) {
        return (
            <InterviewInviteModal
                candidate={{ ...candidate, postId } as Candidate}
                onClose={onClose}
                onSent={onSent}
            />
        );
    }

    if (confirmed) {
        // The invite form treats a candidate with a postId as invited to that post.
        return (
            <InterviewInviteModal
                candidate={{ ...candidate, postId: confirmed.id } as Candidate}
                onClose={onClose}
                onSent={onSent}
            />
        );
    }

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-post-title"
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
            <div onClick={(e) => e.stopPropagation()} className={`flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border ${skin.edge} ${skin.surface} shadow-2xl`}>
                <div className={`flex items-start justify-between gap-3 border-b ${skin.edge} px-6 py-5`}>
                    <div className="min-w-0">
                        <h3 id="invite-post-title" className="text-lg font-bold text-ink">Interview Invite</h3>
                        <p className={`mt-1 ${skin.body}`}>Choose the post to invite <span className="font-semibold text-ink">{candidate.name}</span> to.</p>
                    </div>
                    <button onClick={onClose} aria-label="Close" className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}>
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4 scrollbar-hide">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-ink/50" aria-label="Loading posts" /></div>
                    ) : posts.length === 0 ? (
                        <p className={`py-8 text-center ${skin.body}`}>You have no job posts yet. Add a post first, then invite candidates to it.</p>
                    ) : (
                        <ul className="space-y-2" role="radiogroup" aria-label="Posts">
                            {posts.map((p) => {
                                const picked = pickedId === p.id;
                                const applied = appliedPostIds.includes(p.id as string);
                                return (
                                    <li key={p.id}>
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={picked}
                                            onClick={() => setPickedId(p.id as string)}
                                            className={`flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition-colors ${picked ? 'border-ink bg-ink/5' : `${skin.edge} hover:border-ink/40`} ${FOCUS}`}
                                        >
                                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${picked ? 'border-ink bg-ink text-surface' : 'border-ink/30'}`} aria-hidden="true">
                                                {picked && <Check className="h-3 w-3" />}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2">
                                                    <span className="truncate text-sm font-semibold text-ink">{p.jobTitle}</span>
                                                    {applied && <span className="shrink-0 rounded-md border border-orange-300 bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-700">Applied</span>}
                                                </span>
                                                <span className={`mt-0.5 flex flex-wrap items-center gap-x-3 ${skin.meta}`}>
                                                    {p.department && <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" aria-hidden="true" />{p.department}</span>}
                                                    {p.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{p.location}</span>}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <div className={`flex gap-3 border-t ${skin.edge} px-6 py-4`}>
                    <button onClick={onClose} className={`h-10 flex-1 cursor-pointer rounded-lg border border-ink/20 text-sm font-semibold text-ink hover:border-ink/40 ${FOCUS}`}>Cancel</button>
                    <button
                        disabled={!pickedId}
                        onClick={() => setConfirmed(posts.find(p => p.id === pickedId) ?? null)}
                        className={`h-10 flex-1 cursor-pointer rounded-lg ${skin.cta} ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                        Continue
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
