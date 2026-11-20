import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, getDocs, query as fsQuery, where, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { parseKeywords, keywordPattern } from '@/lib/candidateSearch';
import { getApplicantCounts } from '@/lib/jobApplications';
import type { EffectiveSubscription, RecruitmentRequest } from '@/types';
import RecruitmentFormModal from '@/components/recruitment/RecruitmentFormModal';
import RecruiterPostDetail from '@/components/recruitment/RecruiterPostDetail';
import PostTable from '@/components/recruitment/PostTable';
import UserJobCard from '@/components/recruitment/UserJobCard';
import PostLifecycleDialog, { type LifecycleDialogKind, type LifecycleDialogResult } from '@/components/recruitment/PostLifecycleDialog';
import type { LifecycleAction } from '@/components/recruitment/PostLifecycleMenu';
import { checkPostQuota } from '@/lib/subscriptions';
import { PostActionError, closePost, extendPost, pausePost, publishPost, repostPost, resumePost, setPostExpiry } from '@/lib/postActions';
import { countByStatus, getPostLifecycle } from '@/lib/postLifecycle';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';
import {
    Search, Plus, SearchX, X, List, LayoutGrid, Pause, Play, CalendarPlus, XCircle,
} from 'lucide-react';

/* The Posts tab re-skins itself from the shared app-style store, so it always
   agrees with the sidebar rail the Palette button just cycled to.

   Each skin is a complete token sheet in @/styles/postsSkins: surface colours
   (light Swiss panels, ink/noir dark panels), radius (square to 2xl), optional
   shadow, hairline weights and the typographic micro-label. Orange never
   carries text on a light surface - #FF6600 is 2.7:1 on white and 6.75:1 on
   near-black - so it only ever appears as a fill or an aria-hidden accent. */

type SortKey = 'newest' | 'oldest' | 'applicants' | 'title';

/** Lifecycle filter above the list. `expiring` = active posts within a few days of their expiry. */
type StatusFilter = 'all' | 'draft' | 'active' | 'expiring' | 'paused' | 'expired' | 'closed';
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'draft', label: 'Drafts' },
    { key: 'active', label: 'Active' },
    { key: 'expiring', label: 'Expiring soon' },
    { key: 'paused', label: 'Paused' },
    { key: 'expired', label: 'Expired' },
    { key: 'closed', label: 'Closed' },
];

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
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [lifecycleDialog, setLifecycleDialog] = useState<{ kind: LifecycleDialogKind; post: RecruitmentRequest } | null>(null);
    // The form opened from "Duplicate": a new post pre-filled from another.
    const [duplicating, setDuplicating] = useState(false);
    // False when the plan has no free slot: the form then only offers draft / schedule.
    const [canPublish, setCanPublish] = useState(true);
    // Bulk actions (table view): the ticked posts, and the extend / close dialog for them.
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDialog, setBulkDialog] = useState<'extend' | 'close' | null>(null);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [isRestoring, setIsRestoring] = useState(!!initialSelectedPostId);
    const [searchTerm, setSearchTerm] = useState('');
    const [sort] = useState<SortKey>('newest');
    // Table or card list; remembered per browser.
    const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
        try { return localStorage.getItem('postsViewMode') === 'cards' ? 'cards' : 'table'; } catch { return 'table'; }
    });
    const changeView = (mode: 'table' | 'cards') => {
        setViewMode(mode);
        if (mode === 'cards') setSelectedIds(new Set());
        try { localStorage.setItem('postsViewMode', mode); } catch { /* private mode: just not remembered */ }
    };
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

    // Whether the plan has a free slot for one more live post. The form uses it to decide between
    // "Add Post" and draft / schedule only; it re-checks when saving, so a stale tab cannot slip past.
    const checkCanPublish = async (): Promise<boolean> => {
        if (isAdmin || !userId) return true;
        try {
            return (await checkPostQuota(userId)).allowed;
        } catch (error) {
            console.error('Could not check the post limit:', error);
            return true;
        }
    };

    const openForm = async (post: RecruitmentRequest | null, asDuplicate = false) => {
        setCanPublish(await checkCanPublish());
        setDuplicating(asDuplicate);
        setEditingPost(post);
        setIsRecruitmentModalOpen(true);
    };

    const handleAddPost = () => { void openForm(null); };

    const handleEditPost = (post: RecruitmentRequest) => { void openForm(post); };

    // A copy for a similar role: the details and rounds carry over, nothing about its lifecycle or applicants does.
    const handleDuplicatePost = (post: RecruitmentRequest) => {
        const copy: RecruitmentRequest = {
            jobTitle: post.jobTitle,
            urgencyLevel: post.urgencyLevel,
            department: post.department,
            candidateType: post.candidateType,
            positionLevel: post.positionLevel,
            yearsExperience: post.yearsExperience,
            modeOfWork: post.modeOfWork,
            location: post.location,
            candidatesCount: post.candidatesCount,
            qualification: post.qualification,
            skills: post.skills,
            description: post.description,
            jdUrl: post.jdUrl,
            budgetPay: post.budgetPay,
            salaryBreakup: post.salaryBreakup,
            totalRounds: post.totalRounds,
            rounds: post.rounds,
            validityDays: post.validityDays,
            applicationCap: post.applicationCap,
            createdAt: null,
        };
        void openForm(copy, true);
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

    // Pause and resume act straight away; extend, close and repost ask one question first.
    const runLifecycle = async (work: () => Promise<void>, doneMessage: string): Promise<boolean> => {
        try {
            await work();
            popup.success(doneMessage);
            await fetchRecruitmentRequests();
            return true;
        } catch (err) {
            if (!(err instanceof PostActionError)) console.error('Post lifecycle error:', err);
            popup.error(err instanceof PostActionError ? err.message : `Could not update the post: ${err instanceof Error ? err.message : 'Unknown error'}`);
            return false;
        }
    };

    const handleLifecycle = (post: RecruitmentRequest, action: LifecycleAction) => {
        if (action === 'pause') void runLifecycle(() => pausePost(post), 'Post paused. Candidates can no longer see it.');
        else if (action === 'resume') void runLifecycle(() => resumePost(post), 'Post resumed.');
        else if (action === 'publish') void runLifecycle(() => publishPost(post, isAdmin), 'Post is live!');
        else setLifecycleDialog({ kind: action, post });
    };

    const confirmLifecycle = async (result: LifecycleDialogResult) => {
        const post = lifecycleDialog?.post;
        if (!post) return;
        let ok = false;
        if (result.kind === 'close') {
            ok = await runLifecycle(() => closePost(post, result.reason), 'Post closed.');
        } else if (result.kind === 'extend') {
            ok = result.until
                ? await runLifecycle(() => setPostExpiry(post, result.until!), 'Closing date updated.')
                : await runLifecycle(() => extendPost(post, result.days!), `Post extended by ${result.days} days.`);
        } else {
            ok = await runLifecycle(() => repostPost(post, result.until ?? result.days!, isAdmin), 'Post is live again.');
        }
        if (ok) setLifecycleDialog(null);
    };

    /* ---- bulk actions ---- */
    const selectedPosts = recruitmentRequests.filter((p) => selectedIds.has(p.id ?? ''));
    const eligible = {
        pause: selectedPosts.filter((p) => getPostLifecycle(p).status === 'active'),
        resume: selectedPosts.filter((p) => getPostLifecycle(p).status === 'paused'),
        extend: selectedPosts.filter((p) => { const lc = getPostLifecycle(p); return lc.live && !!lc.expiresAt; }),
        close: selectedPosts.filter((p) => getPostLifecycle(p).live),
    };

    /** Runs one action over the eligible posts, one at a time, and reports what happened. */
    const runBulk = async (verb: string, posts: RecruitmentRequest[], work: (post: RecruitmentRequest) => Promise<void>): Promise<void> => {
        let done = 0;
        let lastError = '';
        const succeeded = new Set<string>();
        for (const post of posts) {
            try {
                await work(post);
                done += 1;
                succeeded.add(post.id ?? '');
            } catch (err) {
                lastError = err instanceof Error ? err.message : 'Unknown error';
            }
        }
        const skipped = selectedPosts.length - posts.length;
        const failed = posts.length - done;
        const tail = [skipped > 0 ? `${skipped} skipped (not applicable)` : '', failed > 0 ? `${failed} failed` : ''].filter(Boolean).join(', ');
        if (done > 0) popup.success(`${verb} ${done} ${done === 1 ? 'post' : 'posts'}${tail ? ` - ${tail}` : ''}.`);
        else popup.error(failed > 0 ? lastError : 'None of the selected posts can do that.');
        setSelectedIds((prev) => new Set([...prev].filter((id) => !succeeded.has(id))));
        await fetchRecruitmentRequests();
    };

    const confirmBulkDialog = async (result: LifecycleDialogResult) => {
        if (result.kind === 'close') await runBulk('Closed', eligible.close, (p) => closePost(p, result.reason));
        else if (result.kind === 'extend' && result.days) await runBulk(`Extended by ${result.days} days:`, eligible.extend, (p) => extendPost(p, result.days!));
        setBulkDialog(null);
    };

    // A post that was deleted or filtered out of the data can't stay ticked.
    useEffect(() => {
        setSelectedIds((prev) => {
            const live = new Set(recruitmentRequests.map((p) => p.id ?? ''));
            const kept = [...prev].filter((id) => live.has(id));
            return kept.length === prev.size ? prev : new Set(kept);
        });
    }, [recruitmentRequests]);

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
    const statusCounts = countByStatus(recruitmentRequests);
    const inStatus = recruitmentRequests.filter((post) => {
        if (statusFilter === 'all') return true;
        const lc = getPostLifecycle(post);
        return statusFilter === 'expiring' ? lc.expiringSoon : lc.status === statusFilter;
    });
    const matchScore = new Map<string, { count: number; score: number }>();
    const filteredRecruitmentRequests = keywords.length === 0
        ? inStatus
        : inStatus.filter((post) => {
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
                    onLifecycle={handleLifecycle}
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

                            {/* Count at the left (in line with the post cards), actions at the right. */}
                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5">
                                {loadingPosts ? <span aria-hidden="true" /> : (
                                    <div aria-live="polite" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                                        <p className="flex items-baseline gap-1.5">
                                            <span className="text-2xl font-black leading-none tabular-nums text-ink">{visiblePosts.length}</span>
                                            <span className="text-sm font-semibold text-ink/60">
                                                {keywords.length > 0 ? (visiblePosts.length === 1 ? 'match' : 'matches') : (visiblePosts.length === 1 ? 'post' : 'posts')}
                                            </span>
                                        </p>
                                        {keywords.length > 0 && (
                                            <span className="max-w-[22rem] truncate rounded-full bg-ink/5 px-3 py-1 text-xs font-medium text-ink/70" title={keywords.join(', ')}>
                                                for {keywords.join(', ')}
                                            </span>
                                        )}
                                    </div>
                                )}
                                <div className="ml-auto flex items-center gap-2">
                                <div role="group" aria-label="Post layout" className="inline-flex overflow-hidden rounded-md border border-ink/70">
                                    {([['table', List, 'Table view'], ['cards', LayoutGrid, 'Card view']] as const).map(([mode, Icon, label]) => (
                                        <button
                                            key={mode}
                                            type="button"
                                            onClick={() => changeView(mode)}
                                            aria-pressed={viewMode === mode}
                                            aria-label={label}
                                            title={label}
                                            className={`flex h-8 w-9 cursor-pointer items-center justify-center transition-colors duration-200 ${viewMode === mode ? 'bg-ink/70 text-surface' : 'bg-surface text-ink hover:bg-ink/5'} ${FOCUS}`}
                                        >
                                            <Icon className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    ))}
                                </div>
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

                            {/* Lifecycle filter: where each post is in its life. */}
                            {!loadingPosts && recruitmentRequests.length > 0 && (
                                <div role="group" aria-label="Filter posts by status" className="flex flex-wrap items-center gap-2">
                                    {STATUS_FILTERS.map(({ key, label }) => {
                                        const n = key === 'all' ? statusCounts.all : key === 'expiring' ? statusCounts.expiringSoon : statusCounts[key];
                                        const on = statusFilter === key;
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setStatusFilter(key)}
                                                aria-pressed={on}
                                                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors duration-200 ${on ? 'border-ink/70 bg-ink/70 text-surface' : 'border-ink/20 bg-surface text-ink hover:bg-ink/5'} ${FOCUS}`}
                                            >
                                                {label}
                                                <span className={`tabular-nums ${on ? 'text-surface/80' : 'text-ink/50'}`}>{n}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                    </div>

                    {/* Bulk actions: appear once posts are ticked in the table. */}
                    {viewMode === 'table' && selectedIds.size > 0 && (
                        <div role="toolbar" aria-label="Bulk actions" className="mt-3 flex flex-shrink-0 flex-wrap items-center gap-2 rounded-lg border border-ink/20 bg-surface px-3 py-2">
                            <span className="mr-1 text-sm font-semibold text-ink tabular-nums">{selectedIds.size} selected</span>
                            {([
                                ['Extend', CalendarPlus, eligible.extend.length, () => setBulkDialog('extend'), false],
                                ['Pause', Pause, eligible.pause.length, () => void runBulk('Paused', eligible.pause, pausePost), false],
                                ['Resume', Play, eligible.resume.length, () => void runBulk('Resumed', eligible.resume, resumePost), false],
                                ['Close', XCircle, eligible.close.length, () => setBulkDialog('close'), true],
                            ] as const).map(([label, Icon, n, onClick, danger]) => (
                                <button
                                    key={label}
                                    type="button"
                                    disabled={n === 0}
                                    onClick={onClick}
                                    title={n === 0 ? `None of the selected posts can be ${label.toLowerCase()}d` : `${label} ${n} ${n === 1 ? 'post' : 'posts'}`}
                                    className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${danger ? 'border-destructive text-destructive hover:bg-destructive/10' : 'border-ink/30 text-ink hover:bg-ink/5'} ${FOCUS}`}
                                >
                                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                    {label} <span className="tabular-nums opacity-70">({n})</span>
                                </button>
                            ))}
                            <button type="button" onClick={() => setSelectedIds(new Set())} className={`ml-auto cursor-pointer text-xs font-semibold text-ink/60 hover:text-ink ${FOCUS}`}>Clear</button>
                        </div>
                    )}

                    {/* Results - the only scrollable region, on a white panel
                        with the posts themselves in the page grey. The mb-4 on
                        the controls row above sits outside this box, so that
                        gap never scrolls in. The panel's top padding is a
                        pinned strip on the panel itself, so it stays at the
                        top of the body bg while the posts scroll under it. */}
                    <div className={`flex-1 min-h-0 w-full flex flex-col overflow-hidden`}>
                        <div className="h-1 shrink-0" aria-hidden="true" />
                        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        {loadingPosts ? (
                            <div role="status" aria-busy="true" className={`border ${skin.edge} bg-surface`}>
                                <span className="sr-only">Loading job posts…</span>
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} aria-hidden="true" className={`flex animate-pulse items-center gap-6 border-b ${skin.edge} px-3 py-3.5 last:border-b-0`}>
                                        <div className={`h-4 w-1/4 ${skin.skeleton}`} />
                                        <div className={`h-4 w-1/6 ${skin.skeleton}`} />
                                        <div className={`h-4 w-1/6 ${skin.skeleton}`} />
                                        <div className={`h-4 flex-1 ${skin.skeleton}`} />
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
                                        : statusFilter === 'all' ? 'No posts to show.' : `You have no ${statusFilter === 'expiring' ? 'posts expiring soon' : `${statusFilter} posts`}.`}
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
                            viewMode === 'table' ? (
                                <PostTable posts={visiblePosts} onViewDetails={setSelectedPost} keywords={keywords} onEdit={handleEditPost} onDelete={handleDeletePost} onLifecycle={handleLifecycle} onDuplicate={handleDuplicatePost}
                                    selectedIds={selectedIds}
                                    onToggleSelect={(id) => setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
                                    onToggleAll={(select) => setSelectedIds(select ? new Set(visiblePosts.map((p) => p.id ?? '')) : new Set())} />
                            ) : (
                                <div className="thin-scrollbar flex min-h-0 flex-col gap-4 overflow-y-auto overflow-x-hidden scrollbar-hide">
                                    {visiblePosts.map((post) => (
                                        <UserJobCard key={post.id} recruitment={post} hideNewBadge whiteCard skillsPopover applicantCount={post.applicantCount ?? 0} onViewDetails={setSelectedPost} keywords={keywords} onEdit={handleEditPost} onDelete={handleDeletePost} onLifecycle={handleLifecycle} onDuplicate={handleDuplicatePost} />
                                    ))}
                                </div>
                            )
                        )}
                        </div>
                        <div className="h-3 md:h-4 shrink-0" aria-hidden="true" />
                    </div>
                </div>
            )}

            {/* Modals */}
            {lifecycleDialog && (
                <PostLifecycleDialog
                    kind={lifecycleDialog.kind}
                    post={lifecycleDialog.post}
                    onCancel={() => setLifecycleDialog(null)}
                    onConfirm={confirmLifecycle}
                />
            )}
            {bulkDialog && (
                <PostLifecycleDialog
                    kind={bulkDialog}
                    count={bulkDialog === 'extend' ? eligible.extend.length : eligible.close.length}
                    onCancel={() => setBulkDialog(null)}
                    onConfirm={confirmBulkDialog}
                />
            )}
            <RecruitmentFormModal
                isOpen={isRecruitmentModalOpen}
                onClose={() => {
                    setIsRecruitmentModalOpen(false);
                    setEditingPost(null);
                    setDuplicating(false);
                    fetchRecruitmentRequests();
                }}
                initialData={editingPost}
                duplicate={duplicating}
                canPublish={canPublish}
                onViewPlans={() => { setIsRecruitmentModalOpen(false); setEditingPost(null); onViewPlans?.(); }}
            />
        </div>
    );
}
