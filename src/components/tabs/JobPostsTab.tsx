import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, getDocs, query as fsQuery, where, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { parseKeywords, keywordPattern } from '@/lib/candidateSearch';
import { getApplicantCounts } from '@/lib/jobApplications';
import type { EffectiveSubscription, RecruitmentRequest } from '@/types';
import RecruitmentFormModal from '@/components/recruitment/RecruitmentFormModal';
import RecruiterPostDetail from '@/components/recruitment/RecruiterPostDetail';
import UserJobCard from '@/components/recruitment/UserJobCard';
import PostLimitModal from '@/components/subscription/PostLimitModal';
import { checkPostQuota } from '@/lib/subscriptions';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';
import {
    Search, Plus, SearchX, X,
} from 'lucide-react';

/* The Posts tab re-skins itself from the shared app-style store, so it always
   agrees with the sidebar rail the Palette button just cycled to.

   Each skin is a complete token sheet in @/styles/postsSkins: surface colours
   (light Swiss panels, ink/noir dark panels), radius (square to 2xl), optional
   shadow, hairline weights and the typographic micro-label. Orange never
   carries text on a light surface - #FF6600 is 2.7:1 on white and 6.75:1 on
   near-black - so it only ever appears as a fill or an aria-hidden accent. */

type SortKey = 'newest' | 'oldest' | 'applicants' | 'title';

/** Firestore Timestamp | Date | ISO string | number -> epoch ms. */
const toTime = (value: unknown): number => {
    if (!value) return 0;
    const candidate = value as { toDate?: () => Date };
    if (typeof candidate.toDate === 'function') return candidate.toDate().getTime();
    const parsed = new Date(value as string | number | Date).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
};

interface JobPostsTabProps {
    onViewCandidates?: (postId: string, postTitle?: string) => void;
    initialSelectedPostId?: string | null;
    userRole?: string | null;
    userId?: string | null;
    /** The recruiter's live plan; its maxPosts is the post limit. */
    subscription?: EffectiveSubscription | null;
    /** Opens the Subscription tab on its available plans. */
    onViewPlans?: () => void;
}

export default function JobPostsTab({ onViewCandidates, initialSelectedPostId, userRole, userId, onViewPlans }: JobPostsTabProps) {
    const isAdmin = userRole === 'admin';
    const [recruitmentRequests, setRecruitmentRequests] = useState<RecruitmentRequest[]>([]);
    const [editingPost, setEditingPost] = useState<RecruitmentRequest | null>(null);
    const [selectedPost, setSelectedPost] = useState<RecruitmentRequest | null>(null);
    const [isRecruitmentModalOpen, setIsRecruitmentModalOpen] = useState(false);
    const [limitInfo, setLimitInfo] = useState<{ used: number; limit: number; planName: string } | null>(null);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [isRestoring, setIsRestoring] = useState(!!initialSelectedPostId);
    const [searchTerm, setSearchTerm] = useState('');
    const [sort] = useState<SortKey>('newest');
    const searchRef = useRef<HTMLInputElement>(null);
    const skin = useSkin();

    const fetchRecruitmentRequests = async () => {
        try {
            setLoadingPosts(true);

            const recruitsRef = collection(db, 'recruits');
            // Admins oversee every recruiter's posts; a recruiter only sees their own.
            // Neither path uses orderBy — it would need a composite index when
            // combined with the where, and drops posts whose timestamp is still
            // resolving — so the sort happens below instead.
            const q = (!isAdmin && userId)
                ? fsQuery(recruitsRef, where('recruiterId', '==', userId))
                : fsQuery(recruitsRef);

            const querySnapshot = await getDocs(q);

            let recruits = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as any[];

            recruits = recruits.sort((a, b) => {
                const dateA = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate() : (a.createdAt || 0);
                const dateB = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : (b.createdAt || 0);
                return Number(dateB) - Number(dateA);
            });

            // Older posts have no owner email on them; store it so applicant notifications can find the owner.
            const ownEmail = auth.currentUser?.email?.trim().toLowerCase();
            if (ownEmail && userId) {
                recruits.filter(r => r.recruiterId === userId && !r.recruiterEmail).forEach(r => {
                    updateDoc(doc(db, 'recruits', r.id), { recruiterEmail: ownEmail }).catch(err => console.warn('Could not store owner email on post', err));
                    r.recruiterEmail = ownEmail;
                });
            }

            // 2. Fetch application counts (Firestore job_applications)
            const counts: Record<string, number> = await getApplicantCounts();

            // 4. Add counts from Firestore uploaded candidates
            const candSnap = await getDocs(collection(db, 'candidates'));
            candSnap.forEach(cDoc => {
                const cData = cDoc.data();
                const targetPostId = cData.postId || cData.recruitmentId;
                if (targetPostId) {
                    counts[targetPostId] = (counts[targetPostId] || 0) + 1;
                }
            });

            // 5. Combine
            const postsData: RecruitmentRequest[] = recruits.map(post => ({
                ...post,
                applicantCount: counts[post.id] || 0
            }));

            setRecruitmentRequests(postsData);

            // Refreshed selectedPost if it exists
            if (selectedPost) {
                const updatedSelected = postsData.find(p => p.id === selectedPost.id);
                if (updatedSelected) {
                    setSelectedPost(updatedSelected);
                }
            }
        } catch (error) {
            console.error('Error fetching recruitment requests:', error);
            popup.error('Failed to fetch recruitment requests');
        } finally {
            setLoadingPosts(false);
        }
    };

    // Add Post is gated by the plan: at the limit the recruiter is sent to the
    // upgrade dialog instead of the form. The form re-checks on save, so a stale
    // tab or a second browser window cannot slip past it.
    const handleAddPost = async () => {
        if (!isAdmin && userId) {
            try {
                const quota = await checkPostQuota(userId);
                if (!quota.allowed) {
                    setLimitInfo({ used: quota.used, limit: quota.limit, planName: quota.subscription.planName });
                    return;
                }
            } catch (error) {
                console.error('Could not check the post limit:', error);
            }
        }
        setEditingPost(null);
        setIsRecruitmentModalOpen(true);
    };

    const handleEditPost = (post: RecruitmentRequest) => {
        setEditingPost(post);
        setIsRecruitmentModalOpen(true);
    };

    const handleDeletePost = async (post: RecruitmentRequest) => {
        if (!post.id) return;
        try {
            await deleteDoc(doc(db, 'recruits', post.id));
            popup.success('Recruitment post deleted successfully');
            fetchRecruitmentRequests();
        } catch (err) {
            console.error('Delete error:', err);
            popup.error(`Failed to delete: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };
    useEffect(() => {
        fetchRecruitmentRequests();
    }, []);

    // Handle initial selection from navigation
    useEffect(() => {
        if (!loadingPosts && initialSelectedPostId && isRestoring) {
            const post = recruitmentRequests.find(p => p.id === initialSelectedPostId);
            if (post) {
                setSelectedPost(post);
            }
            setIsRestoring(false);
        } else if (!initialSelectedPostId) {
            // Ensure we don't get stuck if prop is missing but state initialized true (unlikely but safe)
            if (isRestoring) setIsRestoring(false);
        }
    }, [loadingPosts, initialSelectedPostId, recruitmentRequests, isRestoring]);

    // Hooks must run before the early return below, on every render.
    const keywords = useMemo(() => parseKeywords(searchTerm), [searchTerm]);

    if (isRestoring) {
        return (
            <div className="flex justify-center items-center h-full min-h-[500px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
            </div>
        );
    }

    // Same keyword search as the Candidates tab: commas split phrases, otherwise each
    // word is its own keyword ("quoted" keeps a phrase). Any keyword may hit; posts
    // that match more keywords (and in more important fields) come first.
    const matchScore = new Map<string, { count: number; score: number }>();
    const filteredRecruitmentRequests = keywords.length === 0
        ? recruitmentRequests
        : recruitmentRequests.filter((post) => {
            const fields: [string | undefined, number][] = [
                [post.jobTitle, 5], [post.skills, 5], [post.department, 3], [post.location, 3],
                [post.positionLevel, 2], [post.modeOfWork, 2], [post.candidateType, 2],
                [post.qualification, 2], [post.description, 1],
            ];
            let count = 0;
            let score = 0;
            for (const kw of keywords) {
                const re = new RegExp(keywordPattern(kw), 'iu');
                let best = 0;
                for (const [text, w] of fields) if (text && re.test(text)) best = Math.max(best, w);
                if (best > 0) { count++; score += best; }
            }
            if (count === 0) return false;
            matchScore.set(post.id ?? '', { count, score });
            return true;
        });

    // Sort never changes the result set, only its order, so the count badge can
    // stay bound to the filtered length.
    const visiblePosts = [...filteredRecruitmentRequests].sort((a, b) => {
        if (keywords.length > 0) {
            const ma = matchScore.get(a.id ?? '') ?? { count: 0, score: 0 };
            const mb = matchScore.get(b.id ?? '') ?? { count: 0, score: 0 };
            if (mb.count !== ma.count) return mb.count - ma.count;
            if (mb.score !== ma.score) return mb.score - ma.score;
        }
        switch (sort) {
            case 'oldest':
                return toTime(a.createdAt) - toTime(b.createdAt);
            case 'applicants':
                return (b.applicantCount ?? 0) - (a.applicantCount ?? 0);
            case 'title':
                return (a.jobTitle ?? '').localeCompare(b.jobTitle ?? '');
            default:
                // Newest first - the fetch already sorts descending by createdAt.
                return toTime(b.createdAt) - toTime(a.createdAt);
        }
    });

    return (
        <div className={`-m-4 md:-m-6 p-4 md:p-6 flex-1 min-h-0 flex flex-col overflow-hidden ${skin.canvas}`}>
            {selectedPost ? (
                <RecruiterPostDetail
                    recruitment={selectedPost}
                    onBack={() => setSelectedPost(null)}
                    onViewCandidates={(postId) => {
                        setSelectedPost(null);
                        onViewCandidates?.(postId, selectedPost.jobTitle);
                    }}
                />
            ) : (
                <div className="flex-1 flex flex-col min-h-0">
                    {/* Controls row: search at the left edge, add post at the right. Sits on the canvas below
                        the masthead - no panel, no tint. */}
                    <div className="mb-1 flex flex-shrink-0 flex-col gap-3">
                            <div className="relative mx-auto min-w-0 w-full max-w-[36rem]">
                                <label htmlFor="job-posts-search" className="sr-only">
                                    Search job posts by title, department or location
                                </label>
                                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                    <Search aria-hidden="true" className="h-5 w-5 text-ink/40" />
                                </div>
                                <input
                                    id="job-posts-search"
                                    ref={searchRef}
                                    type="text"
                                    placeholder="Search posts by title, department or location"
                                    aria-describedby="job-posts-search-hint"
                                    className={`block w-full h-12 pl-11 pr-10 text-sm rounded-lg border border-ink/20 bg-surface text-ink placeholder:text-ink/40 shadow-sm transition-colors hover:border-ink/40 ${FOCUS}`}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape' && searchTerm) {
                                            e.preventDefault();
                                            setSearchTerm('');
                                        }
                                    }}
                                />
                                <span id="job-posts-search-hint" className="sr-only">
                                    Press Escape to clear the search.
                                </span>
                                {searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        aria-label="Clear search"
                                        className={`absolute inset-y-0 right-0 my-auto mr-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                                    >
                                        <X className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                )}
                            </div>

                            {/* Actions row under the search, right-aligned. */}
                            <div className="flex flex-wrap items-center justify-end gap-2.5">
                                <button
                                    type="button"
                                    onClick={handleAddPost}
                                    aria-label="Add a new job post"
                                    className={`group inline-flex h-8 cursor-pointer items-stretch overflow-hidden rounded-md border border-ink/70 bg-ink/70 text-[11px] font-bold uppercase tracking-wider text-surface shadow-sm transition-colors duration-200 hover:bg-ink/60 active:scale-95 ${FOCUS}`}
                                >
                                    <span className="flex items-center px-3">Add Post</span>
                                    <span className="flex w-8 items-center justify-center border-l border-surface/30 bg-surface/10 transition-colors duration-200 group-hover:bg-surface/20">
                                        <Plus className="h-3.5 w-3.5 transition-transform duration-200 group-hover:rotate-90" aria-hidden="true" />
                                    </span>
                                </button>
                            </div>
                    </div>

                    {/* Results - the only scrollable region, on a white panel
                        with the posts themselves in the page grey. The mb-4 on
                        the controls row above sits outside this box, so that
                        gap never scrolls in. The panel's top padding is a
                        pinned strip on the panel itself, so it stays at the
                        top of the body bg while the posts scroll under it. */}
                    <div className={`flex-1 min-h-0 w-full flex flex-col overflow-hidden`}>
                        <div className="h-1 shrink-0" aria-hidden="true" />
                        <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide ${!loadingPosts && recruitmentRequests.length === 0 ? ' flex flex-col' : ''}`}>
                        {loadingPosts ? (
                            <div role="status" aria-busy="true" className="flex flex-col gap-4">
                                <span className="sr-only">Loading job posts…</span>
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} aria-hidden="true" className={`animate-pulse rounded-lg border ${skin.edge} bg-surface p-4 md:p-6`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className={`h-6 w-1/3 ${skin.skeleton}`} />
                                            <div className={`h-6 w-20 ${skin.skeleton}`} />
                                        </div>
                                        <div className="mt-4 flex flex-wrap gap-4">
                                            <div className={`h-3.5 w-28 ${skin.skeleton}`} />
                                            <div className={`h-3.5 w-20 ${skin.skeleton}`} />
                                            <div className={`h-3.5 w-24 ${skin.skeleton}`} />
                                        </div>
                                        <div className={`mt-4 h-3.5 w-full ${skin.skeleton}`} />
                                        <div className={`mt-2 h-3.5 w-2/3 ${skin.skeleton}`} />
                                        <div className="mt-5 flex items-center justify-between gap-4">
                                            <div className="flex gap-1.5">
                                                <div className={`h-6 w-16 ${skin.skeleton}`} />
                                                <div className={`h-6 w-20 ${skin.skeleton}`} />
                                                <div className={`h-6 w-14 ${skin.skeleton}`} />
                                            </div>
                                            <div className={`h-8 w-20 ${skin.skeleton}`} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : recruitmentRequests.length === 0 ? (
                            /* No posts: inside the white body, one grey section fills it with the message centred. */
                            <div className={`flex flex-1 items-center justify-center border ${skin.edge} ${skin.cardSurface} ${skin.radius} px-6 text-center`}>
                                <p className={skin.body}>No job posts yet. Use Add Post to create your first job post.</p>
                            </div>
                        ) : visiblePosts.length === 0 ? (
                            <div className={`border ${skin.edge} ${skin.radius} px-6 py-14 text-center`}>
                                <span className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center ${skin.stateIcon}`} aria-hidden="true">
                                    <SearchX className="h-6 w-6" />
                                </span>
                                <h3 className={skin.emptyTitle}>No matching posts</h3>
                                <p className={`mx-auto mt-2 max-w-sm ${skin.body}`}>
                                    {searchTerm
                                        ? <>Nothing matches <span className={`break-words ${skin.cardValue}`}>“{searchTerm}”</span>. Try a different title, department or location.</>
                                        : 'No posts to show.'}
                                </p>
                                {searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchTerm('')}
                                        className={`mt-5 rounded-lg ${skin.secondary} ${FOCUS}`}
                                    >
                                        Clear search
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4">
                                {visiblePosts.map((post) => (
                                    <UserJobCard key={post.id} recruitment={post} hideNewBadge whiteCard applicantCount={post.applicantCount ?? 0} onViewDetails={setSelectedPost} keywords={keywords} onEdit={handleEditPost} onDelete={handleDeletePost} />
                                ))}
                            </div>
                        )}
                        </div>
                        <div className="h-3 md:h-4 shrink-0" aria-hidden="true" />
                    </div>
                </div>
            )}

            {/* Modals */}
            <PostLimitModal
                isOpen={limitInfo !== null}
                onClose={() => setLimitInfo(null)}
                used={limitInfo?.used ?? 0}
                limit={limitInfo?.limit ?? 0}
                planName={limitInfo?.planName ?? ''}
                onViewPlans={() => onViewPlans?.()}
            />
            <RecruitmentFormModal
                isOpen={isRecruitmentModalOpen}
                onClose={() => {
                    setIsRecruitmentModalOpen(false);
                    setEditingPost(null);
                    fetchRecruitmentRequests();
                }}
                initialData={editingPost}
            />
        </div>
    );
}
