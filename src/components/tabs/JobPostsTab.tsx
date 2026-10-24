import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query as fsQuery, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getApplicantCounts } from '@/lib/jobApplications';
import type { EffectiveSubscription, RecruitmentRequest } from '@/types';
import { timeAgo } from '@/lib/format';
import RecruitmentFormModal from '@/components/recruitment/RecruitmentFormModal';
import RecruitmentDetailView from '@/components/recruitment/RecruitmentDetailView';
import PostCard from '@/components/recruitment/PostCard';
import PostLimitModal from '@/components/subscription/PostLimitModal';
import UpgradePlansModal from '@/components/subscription/UpgradePlansModal';
import { checkPostQuota, formatLimit, isUnlimited } from '@/lib/subscriptions';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';
import {
    Search, Plus, Briefcase, SearchX, X, LayoutGrid, List,
    ChevronDown, ChevronRight, Crown,
} from 'lucide-react';

/* The Posts tab re-skins itself from the shared app-style store, so it always
   agrees with the sidebar rail the Palette button just cycled to.

   Each skin is a complete token sheet in @/styles/postsSkins: surface colours
   (light Swiss panels, ink/noir dark panels), radius (square to 2xl), optional
   shadow, hairline weights and the typographic micro-label. Orange never
   carries text on a light surface - #FF6600 is 2.7:1 on white and 6.75:1 on
   near-black - so it only ever appears as a fill or an aria-hidden accent. */

type SortKey = 'newest' | 'oldest' | 'applicants' | 'title';
type ViewKey = 'grid' | 'list';

const SORT_LABELS: Record<SortKey, string> = {
    newest: 'Newest first',
    oldest: 'Oldest first',
    applicants: 'Most applicants',
    title: 'Title A–Z',
};

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
}

export default function JobPostsTab({ onViewCandidates, initialSelectedPostId, userRole, userId, subscription }: JobPostsTabProps) {
    const postLimit = subscription?.maxPosts;
    const planName = subscription?.planName;
    const isAdmin = userRole === 'admin';
    const [recruitmentRequests, setRecruitmentRequests] = useState<RecruitmentRequest[]>([]);
    const [editingPost, setEditingPost] = useState<RecruitmentRequest | null>(null);
    const [selectedPost, setSelectedPost] = useState<RecruitmentRequest | null>(null);
    const [isRecruitmentModalOpen, setIsRecruitmentModalOpen] = useState(false);
    const [upgradeOpen, setUpgradeOpen] = useState(false);
    const [limitInfo, setLimitInfo] = useState<{ used: number; limit: number; planName: string } | null>(null);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [isRestoring, setIsRestoring] = useState(!!initialSelectedPostId);
    const [searchTerm, setSearchTerm] = useState('');
    const [sort, setSort] = useState<SortKey>('newest');
    const [view, setView] = useState<ViewKey>('grid');
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

    // ... fetchRecruitmentRequests ...
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

    if (isRestoring) {
        return (
            <div className="flex justify-center items-center h-full min-h-[500px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
            </div>
        );
    }

    // Filter by the search term
    const term = searchTerm.trim().toLowerCase();
    const filteredRecruitmentRequests = recruitmentRequests.filter(post => {
        if (!term) return true;
        return (
            post.jobTitle?.toLowerCase().includes(term) ||
            post.department?.toLowerCase().includes(term) ||
            post.location?.toLowerCase().includes(term)
        );
    });

    // Sort never changes the result set, only its order, so the count badge can
    // stay bound to the filtered length.
    const visiblePosts = [...filteredRecruitmentRequests].sort((a, b) => {
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

    const total = recruitmentRequests.length;
    const countBadge = term
        ? `${visiblePosts.length} of ${total} ${total === 1 ? 'Post' : 'Posts'}`
        : `${total} ${total === 1 ? 'Post' : 'Posts'}`;

    return (
        <div className={`-m-4 md:-m-6 p-4 md:p-6 flex-1 min-h-0 flex flex-col overflow-hidden ${skin.canvas}`}>
            {selectedPost ? (
                <RecruitmentDetailView
                    recruitment={selectedPost}
                    onBack={() => setSelectedPost(null)}
                    onViewCandidates={(postId) => {
                        setSelectedPost(null);
                        onViewCandidates?.(postId, selectedPost.jobTitle);
                    }}
                    onEdit={(post) => {
                        setEditingPost(post);
                        setIsRecruitmentModalOpen(true);
                    }}
                    onDelete={() => {
                        setSelectedPost(null);
                        fetchRecruitmentRequests();
                    }}
                />
            ) : (
                <div className="flex-1 flex flex-col min-h-0">
                    {/* Controls row: search, clear, sort, view and the posts
                        count at the right-most end. Sits on the canvas below
                        the masthead - no panel, no tint. */}
                    <div className="mb-4 flex flex-shrink-0 flex-wrap items-center gap-3">
                            <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                                <label htmlFor="job-posts-search" className="sr-only">
                                    Search job posts by title, department or location
                                </label>
                                <Search
                                    aria-hidden="true"
                                    className={`pointer-events-none absolute inset-y-0 left-0 my-auto ml-3 h-4 w-4 ${skin.subtle}`}
                                />
                                <input
                                    id="job-posts-search"
                                    ref={searchRef}
                                    type="text"
                                    placeholder="Title, department or location..."
                                    aria-describedby="job-posts-search-hint"
                                    className={`block w-full h-9 pl-9 pr-9 rounded-lg ${skin.field} ${FOCUS}`}
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
                                        className={`absolute inset-y-0 right-0 my-auto ml-3 flex h-6 w-6 cursor-pointer items-center rounded-full transition-colors duration-200 ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                                    >
                                        <X className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                )}
                            </div>

                            <div className="ml-auto flex flex-wrap items-center gap-3">
                                {!isAdmin && postLimit !== undefined && !isUnlimited(postLimit) && (
                                    <span
                                        role="status"
                                        title={`${planName || 'Current'} plan: ${formatLimit(postLimit)} job posts`}
                                        className={`inline-flex h-9 shrink-0 items-center justify-center px-3 ${skin.chip} rounded-lg normal-case! tracking-normal! text-sm! font-semibold ${total >= postLimit ? 'text-destructive' : ''}`}
                                    >
                                        {total} / {postLimit} posts used
                                    </span>
                                )}
                                {!isAdmin && (
                                    <button
                                        type="button"
                                        onClick={() => setUpgradeOpen(true)}
                                        className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg normal-case! tracking-normal! text-sm! font-semibold ${skin.secondary} ${FOCUS}`}
                                    >
                                        <Crown className="h-4 w-4 text-brand" aria-hidden="true" />
                                        Upgrade
                                    </button>
                                )}
                                <div className="relative">
                                    <select
                                        id="job-posts-sort"
                                        value={sort}
                                        onChange={(e) => setSort(e.target.value as SortKey)}
                                        className={`cursor-pointer appearance-none h-9 pl-3 pr-8 rounded-lg ${skin.field} ${FOCUS}`}
                                    >
                                        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                                            <option key={key} value={key}>{SORT_LABELS[key]}</option>
                                        ))}
                                    </select>
                                    <ChevronDown
                                        aria-hidden="true"
                                        className={`pointer-events-none absolute inset-y-0 right-2 my-auto h-4 w-4 ${skin.subtle}`}
                                    />
                                </div>

                                <div
                                    role="group"
                                    aria-label="Post view"
                                    className={`${skin.track} h-9`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setView('grid')}
                                        aria-pressed={view === 'grid'}
                                        aria-label="Grid view"
                                        title="Grid view"
                                        className={`flex cursor-pointer items-center justify-center px-2.5 transition-colors duration-200 ${FOCUS} ${
                                            view === 'grid' ? skin.trackBtnActive : skin.trackBtnIdle
                                        }`}
                                    >
                                        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setView('list')}
                                        aria-pressed={view === 'list'}
                                        aria-label="List view"
                                        title="List view"
                                        className={`flex cursor-pointer items-center justify-center px-2.5 transition-colors duration-200 ${FOCUS} ${
                                            view === 'list' ? skin.trackBtnActive : skin.trackBtnIdle
                                        }`}
                                    >
                                        <List className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                </div>

                                <span role="status" aria-atomic="true" className={`inline-flex h-9 min-w-24 shrink-0 items-center justify-center gap-1.5 ${skin.count} rounded-lg`}>
                                    {countBadge}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleAddPost}
                                    aria-label="Add a new job post"
                                    className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg ${skin.cta} ${skin.ctaLift} ${FOCUS}`}
                                >
                                    <Plus className="h-4 w-4" aria-hidden="true" />
                                    Add Post
                                </button>
                            </div>
                    </div>

                    {/* Results - the only scrollable region, on a white panel
                        with the posts themselves in the page grey. The mb-4 on
                        the controls row above sits outside this box, so that
                        gap never scrolls in. The panel's top padding is a
                        pinned strip on the panel itself, so it stays at the
                        top of the body bg while the posts scroll under it. */}
                    <div className={`flex-1 min-h-0 w-full flex flex-col overflow-hidden border ${skin.edge} ${skin.radius} ${skin.resultsPanel}`}>
                        <div className="h-3 md:h-4 shrink-0" aria-hidden="true" />
                        <div className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide px-3 md:px-4${!loadingPosts && recruitmentRequests.length === 0 ? ' flex flex-col' : ''}`}>
                        {loadingPosts ? (
                            <div role="status" aria-busy="true" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                                <span className="sr-only">Loading job posts…</span>
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} aria-hidden="true" className={`animate-pulse border ${skin.edge} ${skin.cardSurface} ${skin.radius} p-4 sm:p-5`}>
                                        <div className={`h-5 w-2/3 ${skin.skeleton}`} />
                                        <div className={`mt-3 h-3 w-1/3 ${skin.skeleton}`} />
                                        <div className="mt-6 grid grid-cols-2">
                                            <div className={`h-14 border ${skin.edge} ${skin.skeleton}`} />
                                            <div className={`h-14 border-l ${skin.edge} ${skin.skeleton}`} />
                                        </div>
                                        <div className="mt-6 flex gap-1.5">
                                            <div className={`h-6 w-16 border ${skin.edge} ${skin.skeleton}`} />
                                            <div className={`h-6 w-20 border ${skin.edge} ${skin.skeleton}`} />
                                            <div className={`h-6 w-14 border ${skin.edge} ${skin.skeleton}`} />
                                        </div>
                                        <div className={`mt-6 h-4 w-1/2 ${skin.skeleton}`} />
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
                        ) : view === 'grid' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                                {visiblePosts.map((post) => (
                                    <PostCard key={post.id} post={post} onOpen={setSelectedPost} />
                                ))}
                            </div>
                        ) : (
                            <PostList posts={visiblePosts} onOpen={setSelectedPost} />
                        )}
                        </div>
                        <div className="h-3 md:h-4 shrink-0" aria-hidden="true" />
                    </div>
                </div>
            )}

            {/* Modals */}
            <UpgradePlansModal
                isOpen={upgradeOpen}
                onClose={() => setUpgradeOpen(false)}
                userId={userId ?? null}
                subscription={subscription ?? null}
            />
            <PostLimitModal
                isOpen={limitInfo !== null}
                onClose={() => setLimitInfo(null)}
                used={limitInfo?.used ?? 0}
                limit={limitInfo?.limit ?? 0}
                planName={limitInfo?.planName ?? ''}
                onViewPlans={() => setUpgradeOpen(true)}
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

/* Dense comparison view - one row per post, everything needed to choose one
   without opening it. Every child is a <span>: <button> only accepts phrasing
   content, and block children there break the focus outline and hit area. */
function PostList({ posts, onOpen }: { posts: RecruitmentRequest[]; onOpen: (post: RecruitmentRequest) => void }) {
    const skin = useSkin();

    return (
        <div className={`divide-y ${skin.divide} overflow-hidden border ${skin.edge} ${skin.cardSurface} ${skin.radius}`}>
            {posts.map((post) => (
                <button
                    key={post.id}
                    type="button"
                    onClick={() => onOpen(post)}
                    aria-label={`Open job post: ${post.jobTitle}`}
                    className={`group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors duration-200 ${skin.rowHover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40`}
                >
                    <span
                        aria-hidden="true"
                        className={`flex h-9 w-9 shrink-0 items-center justify-center ${skin.iconTile} ${skin.radius}`}
                    >
                        <Briefcase className="h-4 w-4" />
                    </span>

                    <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                            <span className={skin.rowTitle}>{post.jobTitle}</span>
                            {post.positionLevel && (
                                <span className={`hidden shrink-0 ${skin.chip} rounded-lg sm:inline`}>
                                    {post.positionLevel}
                                </span>
                            )}
                        </span>
                        <span className={`mt-0.5 block truncate ${skin.meta}`}>
                            {post.department} &middot; {post.location}
                        </span>
                    </span>

                    <span className={`hidden w-24 shrink-0 md:block ${skin.meta}`}>
                        {post.yearsExperience} yrs exp
                    </span>
                    <span className={`hidden w-28 shrink-0 lg:block ${skin.meta}`}>
                        {timeAgo(post.createdAt)}
                    </span>

                    <span className={`inline-flex w-28 shrink-0 justify-center ${skin.count} rounded-lg`}>
                        {post.applicantCount ?? 0} {post.applicantCount === 1 ? 'applicant' : 'applicants'}
                    </span>

                    <ChevronRight
                        aria-hidden="true"
                        className={`h-4 w-4 shrink-0 transition-colors duration-200 ${skin.subtle} group-hover:text-ink`}
                    />
                </button>
            ))}
        </div>
    );
}
