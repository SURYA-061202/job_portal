import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllApplications, setApplicationStatus } from '@/lib/jobApplications';
import type { Education, RecruitmentRequest } from '@/types';
import {
    getUserCertificates,
    getUserCourses,
    getUserEducation,
    getUserExperience,
    getUserProjects,
    getUserSkills,
    type ProfileLine,
} from '@/lib/userToCandidate';
import { getPostRounds, getRoundLabel } from '@/lib/interviewRounds';
import { notifyCandidateOfStatusChange } from '@/lib/notificationHelper';
import PostCard from '@/components/recruitment/PostCard';
import { toast } from 'react-hot-toast';
import { X, ArrowRight, Search, Briefcase as BriefcaseIcon, SearchX, ChevronDown, ChevronUp, ChevronLeft, CalendarCheck, CalendarX, Clock } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';

type PipelineColumn = {
    id: string;
    title: string;
    /** Status written when a card is dropped into, or advanced to, this column. */
    targetStatus: string;
    match: (status: string) => boolean;
};

/**
 * The stages for one post. Interview rounds come from the post itself
 * (Total Rounds + round names), so two posts can run different pipelines.
 */
const buildColumns = (post: RecruitmentRequest): PipelineColumn[] => {
    const rounds = getPostRounds(post);

    return [
        {
            id: 'shortlisted',
            title: 'Shortlisted',
            targetStatus: 'shortlisted',
            match: (s) => s === 'shortlisted',
        },
        ...rounds.map((round, i) => ({
            id: `round${round.roundNumber}`,
            title: getRoundLabel(round),
            targetStatus: `round${round.roundNumber}`,
            // The last round also absorbs the legacy free-form interview statuses.
            match: (s: string) =>
                s === `round${round.roundNumber}` ||
                (i === rounds.length - 1 && (s === 'technical' || s === 'hr')),
        })),
        {
            id: 'selected',
            title: 'Selected',
            targetStatus: 'selected',
            match: (s) => s === 'selected' || s === 'hired',
        },
        {
            id: 'offer',
            title: 'Offer Sent',
            targetStatus: 'offer_sent',
            match: (s) => s === 'offer' || s === 'offer_sent',
        },
        {
            id: 'rejected',
            title: 'Rejected',
            targetStatus: 'rejected',
            // Covers plain 'rejected' as well as the per-round 'round2rejected' form.
            match: (s) => s === 'declined' || s.endsWith('rejected'),
        },
    ];
};

// A pipeline card represents someone shortlisted to a specific post. Their stage
// lives in the job_applications collection, keyed by (postId, personId). The
// display data comes either from a resume this recruiter uploaded (Firestore
// `candidates`, source 'manual') or from a platform job-seeker (Firestore
// `users`, source 'applicant').
type PipelineItem = {
    key: string;
    id: string;
    name: string;
    role: string;
    experience: string;
    skills: string[];
    summary?: string;
    status: string;
    postId: string;
    postTitle?: string;
    source: 'manual' | 'applicant';
    createdAt?: any;
    /** Profile fields the user filled in on the user-side portal. */
    email?: string;
    phone?: string;
    address?: string;
    education?: Education[];
    experienceItems?: ProfileLine[];
    projects?: ProfileLine[];
    certificates?: ProfileLine[];
    courses?: string[];
};

/** Firestore Timestamp / Date / epoch value -> comparable milliseconds. */
const toMillis = (value: any): number => {
    if (!value) return 0;
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    return Number(value) || 0;
};

/**
 * What the candidate sent back from the interview invite. Availability and the
 * verified details now arrive together from a single link, so one doc holds both.
 */
type InterviewResponse = {
    postId?: string;
    role?: string;
    roundType?: string;
    response?: 'accept' | 'decline' | string;
    selectedDate?: string | null;
    detailsSubmitted?: boolean;
    dateOfJoining?: string;
    currentSalary?: string;
    expectedSalary?: string;
    expectedSalaryPeriod?: string;
    yearsExperience?: string;
    experienceIn?: string;
    readyToRelocate?: string;
    laptop?: string;
};

export default function RecruitmentPipelineTab({ userRole, userId }: { userRole?: string | null; userId?: string | null }) {
    const [items, setItems] = useState<PipelineItem[]>([]);
    const [interviewsById, setInterviewsById] = useState<Record<string, InterviewResponse>>({});
    const [detailItem, setDetailItem] = useState<PipelineItem | null>(null);
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
    const [selectedPost, setSelectedPost] = useState<RecruitmentRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
    const skin = useSkin();

    const toggleSkillsExpanded = (key: string) => {
        setExpandedSkills(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    useEffect(() => {
        fetchData();
    }, [userRole, userId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const isAdmin = userRole === 'admin';

            // Posts this recruiter owns (all posts for admin) — scopes which
            // applications are visible and labels the cards.
            const postsQ = (!isAdmin && userId)
                ? query(collection(db, 'recruits'), where('recruiterId', '==', userId))
                : query(collection(db, 'recruits'));
            const postsSnap = await getDocs(postsQ);
            const postsData = postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as RecruitmentRequest));
            postsData.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
            const postTitleById: Record<string, string> = {};
            postsData.forEach(p => { if (p.id) postTitleById[p.id] = p.jobTitle || 'Untitled Post'; });
            const ownedPostIds = postsData.map(p => p.id as string);
            setPosts(postsData);

            // Candidates uploaded by this recruiter (all, for admin)
            const candQ = (!isAdmin && userId)
                ? query(collection(db, 'candidates'), where('recruiterId', '==', userId))
                : query(collection(db, 'candidates'));
            const candSnap = await getDocs(candQ);
            const manualById: Record<string, any> = {};
            candSnap.forEach(d => { manualById[d.id] = d.data(); });

            // Interview invite responses (availability + verified details), keyed by candidate id.
            const interviewsSnap = await getDocs(collection(db, 'interviews'));
            const interviewsData: Record<string, InterviewResponse> = {};
            interviewsSnap.forEach(d => { interviewsData[d.id] = d.data() as InterviewResponse; });
            setInterviewsById(interviewsData);

            // Registered job-seekers, used to render names/roles for their applications.
            const usersSnap = await getDocs(collection(db, 'users'));
            const registeredById: Record<string, any> = {};
            usersSnap.forEach(d => {
                const data = d.data();
                if (data.role === 'user') registeredById[d.id] = data;
            });

            // Applications against owned posts — the source of truth for a card's stage.
            let apps: { user_id: string; post_id: string; status: string }[] = [];
            if (isAdmin || ownedPostIds.length > 0) {
                try {
                    apps = await getAllApplications();
                    if (!isAdmin) apps = apps.filter(app => ownedPostIds.includes(app.post_id));
                } catch (error) {
                    console.error('Error fetching applications:', error);
                }
            }

            const nextItems: PipelineItem[] = [];
            const processedCandidateIds = new Set<string>();

            apps.forEach(app => {
                const registered = registeredById[app.user_id];
                const manual = manualById[app.user_id];
                const display = registered || manual;
                if (!display) return; // orphaned application (e.g. candidate deleted)

                processedCandidateIds.add(app.user_id);

                nextItems.push({
                    key: `${app.user_id}::${app.post_id}`,
                    id: app.user_id,
                    name: registered
                        ? (`${registered.firstName || ''} ${registered.lastName || ''}`.trim() || registered.email || 'Unnamed')
                        : (display.name || 'Unnamed Candidate'),
                    role: (registered ? registered.department : display.role) || 'Not specified',
                    experience: (registered ? registered.yearsOfExperience : display.experience) || '',
                    skills: getUserSkills(display),
                    email: display.email || '',
                    phone: display.mobile || display.phone || '',
                    address: display.address || '',
                    education: getUserEducation(display),
                    experienceItems: getUserExperience(display),
                    projects: getUserProjects(display),
                    certificates: getUserCertificates(display),
                    courses: getUserCourses(display),
                    summary: display.summary || display.extractedData?.summary,
                    status: app.status || 'shortlisted',
                    postId: app.post_id,
                    postTitle: postTitleById[app.post_id] || 'Untitled Post',
                    source: registered ? 'applicant' : 'manual',
                    createdAt: display.createdAt,
                });
            });

            // Uploaded candidates already attached to a post but with no application doc yet.
            Object.entries(manualById).forEach(([id, data]) => {
                if (!data.postId) return; // not shortlisted to a post — lives in the Candidates tab
                if (processedCandidateIds.has(id)) return; // already added via its application
                nextItems.push({
                    key: `${id}::${data.postId}`,
                    id,
                    name: data.name || 'Unnamed Candidate',
                    role: data.role || 'Not specified',
                    experience: data.experience || '',
                    skills: getUserSkills(data),
                    email: data.email || '',
                    phone: data.mobile || data.phone || '',
                    address: data.address || '',
                    education: getUserEducation(data),
                    experienceItems: getUserExperience(data),
                    projects: getUserProjects(data),
                    certificates: getUserCertificates(data),
                    courses: getUserCourses(data),
                    summary: data.extractedData?.summary,
                    status: data.status || 'shortlisted',
                    postId: data.postId,
                    postTitle: postTitleById[data.postId] || 'Untitled Post',
                    source: 'manual',
                    createdAt: data.createdAt,
                });
            });

            nextItems.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

            setItems(nextItems);
        } catch (error) {
            console.error('Error fetching pipeline data:', error);
            toast.error('Failed to load pipeline');
        } finally {
            setLoading(false);
        }
    };

    const columns = useMemo(
        () => (selectedPost ? buildColumns(selectedPost) : []),
        [selectedPost]
    );

    const postItems = useMemo(
        () => (selectedPost ? items.filter(i => i.postId === selectedPost.id) : []),
        [items, selectedPost]
    );

    // Candidates sitting in one of this post's stages. Anyone still at an earlier
    // status (e.g. a fresh 'applied') isn't shown here, so this matches the sum
    // of the column counts.
    const visiblePostItems = useMemo(
        () => postItems.filter(i => columns.some(c => c.match((i.status || '').toLowerCase()))),
        [postItems, columns]
    );

    // Per-post count of candidates actually sitting in one of that post's stages,
    // so the number on a post card matches what opening it shows.
    const countsByPost = useMemo(() => {
        const counts: Record<string, number> = {};
        posts.forEach(post => {
            if (!post.id) return;
            const postColumns = buildColumns(post);
            counts[post.id] = items.filter(
                i => i.postId === post.id && postColumns.some(c => c.match((i.status || '').toLowerCase()))
            ).length;
        });
        return counts;
    }, [posts, items]);

    /**
     * The interview doc is keyed by candidate id alone, so a candidate in two
     * posts shares one doc — only show it against the post it was raised for.
     */
    const getInterview = (item: PipelineItem): InterviewResponse | null => {
        const interview = interviewsById[item.id];
        if (!interview) return null;
        if (interview.postId && interview.postId !== item.postId) return null;
        return interview;
    };

    const updateStatus = async (item: PipelineItem, newStatus: string) => {
        try {
            await setApplicationStatus(item.postId, item.id, newStatus);
            setItems(prev => prev.map(i => i.key === item.key ? { ...i, status: newStatus } : i));
            const column = columns.find(c => c.targetStatus === newStatus);
            // Fire-and-forget: the candidate's notification must never block the move.
            void notifyCandidateOfStatusChange({
                candidateId: item.id,
                postId: item.postId,
                status: newStatus,
                roundLabel: column?.title,
            });
            toast.success(`Moved to ${column?.title || newStatus}`);
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Failed to update status');
        }
    };

    const getColumnItems = (col: PipelineColumn) => {
        const searchLower = searchTerm.trim().toLowerCase();
        return postItems.filter(item => {
            if (!col.match((item.status || '').toLowerCase())) return false;
            if (!searchLower) return true;
            return (
                item.name?.toLowerCase().includes(searchLower) ||
                item.role?.toLowerCase().includes(searchLower)
            );
        });
    };

    const onDragStart = (e: React.DragEvent, key: string) => {
        e.dataTransfer.setData('itemKey', key);
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const onDrop = async (e: React.DragEvent, col: PipelineColumn) => {
        e.preventDefault();
        const key = e.dataTransfer.getData('itemKey');
        const item = postItems.find(i => i.key === key);
        if (!item) return;
        if (col.match((item.status || '').toLowerCase())) return; // already in this column
        await updateStatus(item, col.targetStatus);
    };

    const openPost = (post: RecruitmentRequest) => {
        setSelectedPost(post);
        setSearchTerm('');
    };

    const closePost = () => {
        setSelectedPost(null);
        setSearchTerm('');
    };

    if (loading) {
        return (
            <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} flex-1 min-h-0 flex flex-col overflow-hidden`}>
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 -mx-1 pb-2">
                    {/* Same card-grid skeleton the Posts tab shows while loading. */}
                    <div role="status" aria-busy="true" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                        <span className="sr-only">Loading posts…</span>
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} aria-hidden="true" className={`animate-pulse border ${skin.edge} ${skin.surface} ${skin.radius} p-4 sm:p-5`}>
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
                </div>
            </div>
        );
    }

    // ---------------------------------------------------------------- post list
    if (!selectedPost) {
        const search = searchTerm.trim().toLowerCase();
        const filteredPosts = posts.filter(post =>
            !search ||
            post.jobTitle?.toLowerCase().includes(search) ||
            post.department?.toLowerCase().includes(search) ||
            post.location?.toLowerCase().includes(search)
        );

        return (
            <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} flex-1 min-h-0 flex flex-col overflow-hidden`}>
                {/* Header - Posts masthead recipe: brand-washed title row
                    (heading + count badge, search at the right end) over a
                    description row. */}
                <div className={`shrink-0 mb-4 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash}`}>
                    <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${skin.edge} px-4 py-3.5 sm:px-5`}>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h2 className={skin.heading}>Recruitment Pipeline</h2>
                            <span role="status" aria-atomic="true" className={`inline-flex shrink-0 items-center gap-1.5 ${skin.count} rounded-lg`}>
                                <span
                                    aria-hidden="true"
                                    className={`h-1.5 w-1.5 shrink-0 rounded-full animate-pulse motion-reduce:animate-none ${skin.countDot}`}
                                />
                                {posts.length}
                            </span>
                        </div>

                        <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:gap-3 min-w-0">
                            <div className="relative w-full sm:w-72">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search className="h-4 w-4 text-ink/40" />
                                </div>
                                <input
                                    type="text"
                                    placeholder="Search posts..."
                                    className={`block w-full pl-10 pr-3 py-2 leading-5 rounded-lg ${skin.field} ${FOCUS}`}
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="px-4 py-2.5 sm:px-5">
                        <p className={skin.body}>Select a job post to manage its candidates through each stage.</p>
                    </div>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 -mx-1 pb-2">
                    {filteredPosts.length === 0 ? (
                        <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} px-6 py-14 text-center`}>
                            <span className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center ${skin.stateIcon}`} aria-hidden="true">
                                {posts.length === 0 ? <BriefcaseIcon className="h-6 w-6" /> : <SearchX className="h-6 w-6" />}
                            </span>
                            <h3 className={skin.emptyTitle}>
                                {posts.length === 0 ? 'No job posts yet' : 'No matching posts'}
                            </h3>
                            <p className={`mx-auto mt-2 max-w-sm ${skin.body}`}>
                                {posts.length === 0
                                    ? 'Create a post to start a pipeline.'
                                    : searchTerm
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
                            {filteredPosts.map(post => (
                                <PostCard
                                    key={post.id}
                                    post={{ ...post, applicantCount: countsByPost[post.id as string] || 0 }}
                                    onOpen={openPost}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ------------------------------------------------------------ post pipeline
    const rounds = getPostRounds(selectedPost);

    return (
        <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} flex-1 min-h-0 flex flex-col overflow-hidden`}>
            {/* Header Section */}
            {/* Header - Posts masthead recipe with back button and search. */}
            <div className={`shrink-0 mb-4 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash}`}>
                <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${skin.edge} px-4 py-3.5 sm:px-5`}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <button
                            onClick={closePost}
                            className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} ${skin.radius} cursor-pointer transition-colors duration-200 hover:border-brand hover:text-brand ${FOCUS}`}
                            title="Back to posts"
                            aria-label="Back to posts"
                        >
                            <ChevronLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
                        </button>
                        <h2 className={`${skin.heading} truncate`}>{selectedPost.jobTitle}</h2>
                        <span role="status" aria-atomic="true" className={`inline-flex shrink-0 items-center gap-1.5 ${skin.count} rounded-lg`}>
                            <span
                                aria-hidden="true"
                                className={`h-1.5 w-1.5 shrink-0 rounded-full animate-pulse motion-reduce:animate-none ${skin.countDot}`}
                            />
                            {visiblePostItems.length}
                        </span>
                    </div>

                    {/* Search Input */}
                    <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:gap-3 min-w-0">
                        <div className="relative w-full sm:w-72">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-ink/40" />
                            </div>
                            <input
                                type="text"
                                placeholder="Search by name, role..."
                                className={`block w-full pl-10 pr-3 py-2 leading-5 rounded-lg ${skin.field} ${FOCUS}`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="px-4 py-2.5 sm:px-5">
                    <p className={skin.body}>
                        {rounds.length} interview round{rounds.length === 1 ? '' : 's'} · {visiblePostItems.length} candidate{visiblePostItems.length === 1 ? '' : 's'}
                    </p>
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden hover-scrollbar pb-2">
                <div className="flex space-x-4 h-full" style={{ minWidth: `${columns.length * 316}px` }}>
                    {columns.map((col, colIndex) => {
                        const columnItems = getColumnItems(col);
                        // Next stage in this post's own order; never auto-advance into Rejected.
                        const nextColumn = columns[colIndex + 1];
                        const advanceTo = nextColumn && nextColumn.id !== 'rejected' ? nextColumn : null;

                        return (
                            <div
                                key={col.id}
                                className={`flex-[0_0_300px] w-[300px] ${skin.canvas} ${skin.radius} flex flex-col h-full border ${skin.edge} border-t-4 border-brand ${skin.shadow}`}
                                onDragOver={onDragOver}
                                onDrop={(e) => onDrop(e, col)}
                            >
                                <div className={`p-3 border-b ${skin.edge} flex justify-between items-center gap-2 ${skin.surface} rounded-t-2xl flex-shrink-0`}>
                                    <h3 className="font-bold text-ink truncate" title={col.title}>{col.title}</h3>
                                    <span className={`flex-shrink-0 ${skin.count} rounded-lg`}>
                                        {columnItems.length}
                                    </span>
                                </div>

                                <div className="flex-1 overflow-y-auto p-2 space-y-2 hover-scrollbar">
                                    {columnItems.map(item => (
                                        <div
                                            key={item.key}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, item.key)}
                                            onClick={() => setDetailItem(item)}
                                            title="View interview response & details"
                                            className={`p-3 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} cursor-grab active:cursor-grabbing transition-colors duration-200 ${skin.cardHover} group flex flex-col h-56 overflow-hidden`}
                                        >
                                            <div className="flex justify-between items-start mb-2 flex-shrink-0">
                                                <h4 className="font-bold text-ink truncate pr-2" title={item.name}>{item.name}</h4>
                                            </div>

                                            {(() => {
                                                const interview = getInterview(item);
                                                if (!interview) return null;
                                                if (interview.response === 'accept') {
                                                    return (
                                                        <div className="mb-2 flex-shrink-0">
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand/10 text-brand border border-brand/20">
                                                                <CalendarCheck className="h-2.5 w-2.5" />
                                                                {interview.selectedDate || 'Confirmed'}
                                                            </span>
                                                        </div>
                                                    );
                                                }
                                                if (interview.response) {
                                                    return (
                                                        <div className="mb-2 flex-shrink-0">
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-destructive/10 text-destructive border border-destructive/20">
                                                                <CalendarX className="h-2.5 w-2.5" />
                                                                Declined
                                                            </span>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <div className="mb-2 flex-shrink-0">
                                                            <span className={`inline-flex items-center gap-1 ${skin.chip} rounded-lg`}>
                                                            <Clock className="h-2.5 w-2.5" />
                                                            Awaiting response
                                                        </span>
                                                    </div>
                                                );
                                            })()}

                                            <div className="text-xs text-ink/60 flex-1 min-h-0 overflow-y-auto hover-scrollbar pr-1 divide-y divide-ink/10">
                                                {Boolean(item.role) && item.role !== 'Not specified' && (
                                                    <p className="py-1 leading-snug">{item.role}</p>
                                                )}
                                                {Boolean(item.experience) && item.experience !== '0' && (
                                                    <div className="py-1.5 space-y-1">
                                                        <span className="block text-[9px] font-bold uppercase tracking-wider text-ink/40">Experience</span>
                                                        <p className="leading-snug">{item.experience} YoE</p>
                                                    </div>
                                                )}
                                                {item.skills.length > 0 && (
                                                    <div className="py-1.5 space-y-1">
                                                        <span className="block text-[9px] font-bold uppercase tracking-wider text-ink/40">Skills</span>
                                                        <div className="flex flex-wrap gap-1">
                                                        {(expandedSkills.has(item.key) ? item.skills : item.skills.slice(0, 6)).map((skill, i) => (
                                                            <span key={i} className={`${skin.tag} rounded-lg`}>
                                                                {skill}
                                                            </span>
                                                        ))}
                                                        {item.skills.length > 6 && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); toggleSkillsExpanded(item.key); }}
                                                                className={`flex items-center gap-0.5 px-1.5 py-0.5 text-ink/60 hover:bg-ink/5 hover:text-ink cursor-pointer ${skin.radius} text-[9px] font-bold ${FOCUS}`}
                                                            >
                                                                {expandedSkills.has(item.key) ? (
                                                                    <>Less <ChevronUp className="h-2.5 w-2.5" /></>
                                                                ) : (
                                                                    <>+{item.skills.length - 6} <ChevronDown className="h-2.5 w-2.5" /></>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                    </div>
                                                )}
                                                {(item.email || item.phone || item.address) && (
                                                    <div className="py-1.5 space-y-1">
                                                        <span className="block text-[9px] font-bold uppercase tracking-wider text-ink/40">Contact</span>
                                                        {item.email && <p className="truncate" title={item.email}>{item.email}</p>}
                                                        {item.phone && <p className="truncate" title={item.phone}>{item.phone}</p>}
                                                        {item.address && <p className="truncate" title={item.address}>{item.address}</p>}
                                                    </div>
                                                )}
                                                {item.education && item.education.length > 0 && (
                                                    <div className="py-1.5 space-y-1">
                                                        <span className="block text-[9px] font-bold uppercase tracking-wider text-ink/40">Education</span>
                                                        {item.education.map((edu, i) => {
                                                            const hasDegree = Boolean(edu.degree || edu.field);
                                                            const line = hasDegree
                                                                ? [edu.degree, edu.field].filter(Boolean).join(' in ')
                                                                : edu.institution;
                                                            const meta = [
                                                                hasDegree ? edu.institution : '',
                                                                edu.year,
                                                                edu.cgpa ? `CGPA ${edu.cgpa}` : ''
                                                            ].filter(Boolean).map((v) => ` · ${v}`).join('');
                                                            return (
                                                                <p key={i} className="leading-snug break-words" title={line}>
                                                                    {line}
                                                                    <span className="text-ink/40">{meta}</span>
                                                                </p>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                                {item.experienceItems && item.experienceItems.length > 0 && (
                                                    <div className="py-1.5 space-y-1">
                                                        <span className="block text-[9px] font-bold uppercase tracking-wider text-ink/40">Work Experience</span>
                                                        {item.experienceItems.map((exp, i) => (
                                                            <p key={i} className="leading-snug break-words" title={exp.title}>
                                                                {exp.title}
                                                                {exp.meta && <span className="text-ink/40"> · {exp.meta}</span>}
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}
                                                {item.projects && item.projects.length > 0 && (
                                                    <div className="py-1.5 space-y-1">
                                                        <span className="block text-[9px] font-bold uppercase tracking-wider text-ink/40">Projects</span>
                                                        {item.projects.map((project, i) => (
                                                            <p key={i} className="leading-snug break-words" title={project.title}>
                                                                {project.title}
                                                                {project.meta && <span className="text-ink/40"> · {project.meta}</span>}
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}
                                                {item.certificates && item.certificates.length > 0 && (
                                                    <div className="py-1.5 space-y-1">
                                                        <span className="block text-[9px] font-bold uppercase tracking-wider text-ink/40">Certificates</span>
                                                        {item.certificates.map((certificate, i) => (
                                                            <p key={i} className="leading-snug break-words" title={certificate.title}>
                                                                {certificate.title}
                                                                {certificate.meta && <span className="text-ink/40"> · {certificate.meta}</span>}
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}
                                                {item.courses && item.courses.length > 0 && (
                                                    <div className="py-1.5 space-y-1">
                                                        <span className="block text-[9px] font-bold uppercase tracking-wider text-ink/40">Courses</span>
                                                        <div className="flex flex-wrap gap-1">
                                                            {item.courses.map((course, i) => (
                                                                <span key={i} className={`${skin.tag} rounded-lg`}>{course}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {item.summary && (
                                                    <p className="py-1.5 text-[10px] text-ink/40">{item.summary}</p>
                                                )}
                                            </div>

                                            <div className={`mt-3 pt-2 border-t ${skin.edge} flex justify-between items-center flex-shrink-0`}>
                                                <span className={skin.meta}>
                                                    {new Date(toMillis(item.createdAt) || Date.now()).toLocaleDateString()}
                                                </span>

                                                <div className="flex gap-1">
                                                    {col.id !== 'rejected' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); updateStatus(item, 'rejected'); }}
                                                            className={`p-1 border border-destructive bg-surface text-destructive ${skin.radius} hover:bg-destructive/10 cursor-pointer ${FOCUS}`}
                                                            title="Reject"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                    {advanceTo && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); updateStatus(item, advanceTo.targetStatus); }}
                                                            className={`p-1 border border-ink bg-ink text-surface ${skin.radius} hover:border-brand hover:bg-brand hover:text-ink cursor-pointer ${FOCUS}`}
                                                            title={`Move to ${advanceTo.title}`}
                                                        >
                                                            <ArrowRight className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {columnItems.length === 0 && (
                                        <div className={`text-center py-8 italic ${skin.body}`}>
                                            No candidates
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {detailItem && (
                <CandidateDetailModal
                    item={detailItem}
                    interview={getInterview(detailItem)}
                    onClose={() => setDetailItem(null)}
                />
            )}
        </div>
    );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
    const skin = useSkin();
    return (
        <div className={`flex flex-col p-2.5 border ${skin.edge} ${skin.canvas} ${skin.radius}`}>
            <span className={`mb-0.5 ${skin.micro}`}>{label}</span>
            <span className="text-sm font-bold text-ink break-words">{value || '—'}</span>
        </div>
    );
}

/** Read-only view of what the candidate sent back from their interview invite. */
function CandidateDetailModal({ item, interview, onClose }: { item: PipelineItem; interview: InterviewResponse | null; onClose: () => void }) {
    const skin = useSkin();
    const accepted = interview?.response === 'accept';
    const hasDetails = !!interview && (
        interview.detailsSubmitted ||
        !!interview.dateOfJoining ||
        !!interview.currentSalary ||
        !!interview.expectedSalary ||
        !!interview.experienceIn
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/30 backdrop-blur-sm" onClick={onClose}>
            <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} w-full max-w-lg max-h-[85vh] flex flex-col`} onClick={(e) => e.stopPropagation()}>
                <div className={`px-6 py-4 border-b ${skin.edge} flex justify-between items-start gap-3 flex-shrink-0`}>
                    <div className="min-w-0">
                        <h3 className={`${skin.cardTitle} truncate`}>{item.name}</h3>
                        <p className="text-sm text-ink/60 truncate">{item.role}{item.experience ? ` · ${item.experience} YoE` : ''}</p>
                    </div>
                    <button onClick={onClose} className={`p-2 text-ink/60 hover:bg-ink/5 hover:text-ink cursor-pointer ${skin.radius} transition-colors flex-shrink-0 ${FOCUS}`}>
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
                    <div>
                        <h4 className="text-sm font-bold text-ink mb-3">Interview Response</h4>
                        {!interview ? (
                            <p className="text-sm text-ink/60 italic">No interview invite has been sent to this candidate yet.</p>
                        ) : !interview.response ? (
                            <p className="text-sm text-ink/60 italic">Invite sent — waiting for the candidate to respond.</p>
                        ) : accepted ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <DetailRow label="Response" value="Accepted" />
                                <DetailRow label="Chosen Slot" value={interview.selectedDate} />
                                {interview.roundType && <DetailRow label="Round" value={interview.roundType} />}
                            </div>
                        ) : (
                            <p className="text-sm font-bold text-destructive">Candidate declined the invitation.</p>
                        )}
                    </div>

                    {accepted && (
                        <div>
                            <h4 className="text-sm font-bold text-ink mb-3">Verified Details</h4>
                            {hasDetails ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <DetailRow label="Date of Joining" value={interview?.dateOfJoining} />
                                    <DetailRow label="Current Salary" value={interview?.currentSalary} />
                                    <DetailRow
                                        label="Expected Salary"
                                        value={interview?.expectedSalary ? `${interview.expectedSalary} / ${interview.expectedSalaryPeriod || 'month'}` : ''}
                                    />
                                    <DetailRow label="Years of Experience" value={interview?.yearsExperience} />
                                    <DetailRow label="Experience In" value={interview?.experienceIn} />
                                    <DetailRow label="Ready to Relocate" value={interview?.readyToRelocate} />
                                    <DetailRow label="Has a Laptop" value={interview?.laptop} />
                                </div>
                            ) : (
                                <p className="text-sm text-ink/60 italic">The candidate accepted before details were collected on this step.</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
