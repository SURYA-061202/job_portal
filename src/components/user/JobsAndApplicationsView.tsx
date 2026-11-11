import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { getUserApplications, getApplicantCounts } from '@/lib/jobApplications';
import type { RecruitmentRequest } from '@/types';
import RecruitmentDetailView from '@/components/recruitment/RecruitmentDetailView';
import UserJobCard from '@/components/recruitment/UserJobCard';
import FilterSidebar from '@/components/recruitment/FilterSidebar';
import { JobListSkeleton } from '@/components/user/SkeletonLoaders';
import { Search, ChevronDown, BellRing, Building2, X, Undo2, Bookmark } from 'lucide-react';
import { getSavedJobIds } from '@/lib/savedJobs';
import popup from '@/components/ui/Popup';
import ExpandingModal from '@/components/subscription/ExpandingModal';
import JobAlertsPanel from '@/components/user/JobAlertsPanel';
import TopCompaniesPanel from '@/components/user/TopCompaniesPanel';
import { parseKeywords } from '@/lib/candidateSearch';
import { byRelevance, compileKeywords, searchJob } from '@/lib/jobSearch';
import { companySlug } from '@/lib/reviews';
import { FOCUS as FOCUS_RING } from '@/styles/skin';

interface JobsAndApplicationsViewProps {
    activeTab: 'jobs' | 'applications';
    /** Kept for callers; the filter sidebar no longer shows a profile prompt. */
    onCompleteProfile?: () => void;
}

/** Applicant counts are a nice-to-have; job seekers may not be allowed to read every application, so a denial just means no counts. */
const safeApplicantCounts = async (): Promise<Record<string, number>> => {
    try {
        return await getApplicantCounts();
    } catch (err) {
        console.warn('Applicant counts unavailable:', err);
        return {};
    }
};

export default function JobsAndApplicationsView({ activeTab }: JobsAndApplicationsViewProps) {
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
    const [applications, setApplications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
        jobType: [],
        experience: [],
        salary: [],
        department: [],
        location: []
    });
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
    const [applicantCounts, setApplicantCounts] = useState<Record<string, number>>({});
    const [selectedJob, setSelectedJob] = useState<RecruitmentRequest | null>(null);
    const [alertsOrigin, setAlertsOrigin] = useState<{ x: number; y: number } | null>(null);
    // Top companies replaces the post list with company cards; opening one shows its posts.
    const [showCompanies, setShowCompanies] = useState(false);
    const [activeCompany, setActiveCompany] = useState<string | null>(null);
    // "Saved jobs" narrows the list to posts saved from the job detail page.
    const [showSaved, setShowSaved] = useState(false);
    const [savedIds, setSavedIds] = useState<string[]>([]);
    // Typing stays smooth on long lists: the search runs on a slightly lagging copy.
    const deferredSearch = useDeferredValue(searchTerm);

    useEffect(() => {
        setSelectedJob(null);
    }, [activeTab]);

    useEffect(() => {
        if (!auth.currentUser) return;
        if (activeTab === 'jobs') fetchPosts();
        else fetchApplications();
    }, [activeTab]);

    // Re-read the saved ids whenever the list is on screen, so a job saved (or
    // un-saved) in the detail view is reflected as soon as the person comes back.
    useEffect(() => {
        const uid = auth.currentUser?.uid;
        if (!uid || activeTab !== 'jobs' || selectedJob) return;
        let cancelled = false;
        getSavedJobIds(uid).then((ids) => { if (!cancelled) setSavedIds(ids); });
        return () => { cancelled = true; };
    }, [activeTab, selectedJob]);

    const fetchApplications = async () => {
        const user = auth.currentUser;
        if (!user) return;

        try {
            setLoading(true);

            const apps = await getUserApplications(user.uid);

            const detailedApplications = await Promise.all(apps.map(async (app: any) => {
                try {
                    const postDoc = await getDoc(doc(db, 'recruits', app.post_id));
                    if (postDoc.exists()) {
                        return {
                            ...app,
                            recruitment_requests: {
                                id: postDoc.id,
                                ...postDoc.data()
                            }
                        };
                    }
                    return null;
                } catch (err) {
                    console.error('Error fetching post details:', err);
                    return null;
                }
            }));

            setApplications(detailedApplications.filter(Boolean));

            const counts = await safeApplicantCounts();
            setApplicantCounts(counts);

        } catch (error: any) {
            console.error('Error fetching applications:', error);
            popup.error('Failed to load applications. ' + (error?.message || ''));
        } finally {
            setLoading(false);
        }
    };

    const fetchPosts = async () => {
        try {
            setLoading(true);
            const recruitsRef = collection(db, 'recruits');
            const q = query(recruitsRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);

            const postsData = querySnapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            })) as RecruitmentRequest[];

            const counts = await safeApplicantCounts();
            setApplicantCounts(counts);

            const merged = postsData.map(post => ({
                ...post,
                applicantCount: counts[post.id!] || 0
            }));

            setPosts(merged);
        } catch (error) {
            console.error('Error fetching posts:', error);
            popup.error('Failed to load job posts');
        } finally {
            setLoading(false);
        }
    };

    const toggleFilter = (section: string, option: string) => {
        setSelectedFilters(prev => {
            const current = prev[section] || [];
            return {
                ...prev,
                [section]: current.includes(option)
                    ? current.filter(o => o !== option)
                    : [...current, option]
            };
        });
    };

    const clearAllFilters = () => {
        setSelectedFilters({
            jobType: [], experience: [], salary: [], department: [], location: []
        });
    };

    /**
     * Search box and the sidebar filters, applied to one post.
     * Shared by both tabs. Every field read here is optional on a post now, so
     * nothing may be dereferenced directly — a blank department used to throw
     * inside .filter() and take the whole list down with it.
     */
    const matchesFilters = (post?: Partial<RecruitmentRequest> | null) => {
        if (!post) return false;

        const matchesJobType = selectedFilters.jobType.length === 0 ||
            selectedFilters.jobType.includes(post.candidateType || 'Permanent');

        // Experience Level: exact match against the positionLevel the Add Post
        // form stores (Entry | Junior | Mid | Senior | Manager).
        const matchesExp = selectedFilters.experience.length === 0 ||
            selectedFilters.experience.includes(String(post.positionLevel || ''));

        const matchesSalary = selectedFilters.salary.length === 0 ||
            selectedFilters.salary.some(sal => {
                const budget = String(post.budgetPay || '').toLowerCase();
                const budgetNumbers = budget.match(/\d+/g);
                if (!budgetNumbers || budgetNumbers.length === 0) return false;
                const budgetValue = parseInt(budgetNumbers[0]);
                if (sal === "0-5 LPA" && budgetValue >= 0 && budgetValue <= 5) return true;
                if (sal === "5-10 LPA" && budgetValue > 5 && budgetValue <= 10) return true;
                if (sal === "10-20 LPA" && budgetValue > 10 && budgetValue <= 20) return true;
                if (sal === "20+ LPA" && budgetValue > 20) return true;
                return false;
            });

        const matchesDepartment = selectedFilters.department.length === 0 ||
            selectedFilters.department.includes(post.department || '');

        const matchesLocation = (selectedFilters.location?.length ?? 0) === 0 ||
            selectedFilters.location.some(city => {
                const place = String(post.location || '').toLowerCase();
                if (!place) return false;
                const name = city.toLowerCase();
                // Posts spell it either way; "Bangalore" should catch "Bengaluru".
                const forms = name === 'bangalore' ? ['bangalore', 'bengaluru'] : [name];
                return forms.some(form => place.includes(form));
            });

        return matchesJobType && matchesExp && matchesSalary && matchesDepartment && matchesLocation;
    };

    /** Firestore Timestamp, Date, or anything Date can parse. */
    type SortableDate = { toDate?: () => Date; seconds?: number } | string | number | null | undefined;

    const toMillis = (value: SortableDate) => {
        if (!value) return 0;
        if (typeof value === 'object') {
            if (typeof value.toDate === 'function') return value.toDate().getTime();
            if (typeof value.seconds === 'number') return value.seconds * 1000;
            return 0;
        }
        const parsed = new Date(value).getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
    };

    /** Newest first, the order the sort dropdown used to default to. */
    const newestFirst = (aDate: SortableDate, bDate: SortableDate) => toMillis(bDate) - toMillis(aDate);

    // Keyword search, the same rules as the recruiter's candidate search: commas
    // separate phrases, quotes keep a phrase together, and a job needs to match at
    // least one keyword. Better matches come first; with nothing typed, newest first.
    const keywords = useMemo(() => parseKeywords(deferredSearch), [deferredSearch]);
    const compiled = useMemo(() => compileKeywords(keywords), [keywords]);
    const rankByKeywords = <T,>(items: T[], postOf: (item: T) => Partial<RecruitmentRequest> | undefined): T[] => {
        if (keywords.length === 0) return items;
        return items
            .map(item => ({ item, hit: searchJob(postOf(item) ?? {}, compiled) }))
            .filter((x): x is { item: T; hit: NonNullable<typeof x.hit> } => x.hit !== null)
            .sort((a, b) => byRelevance(a.hit, b.hit))
            .map(x => x.item);
    };

    const filteredPosts = rankByKeywords(
        posts
            // Jobs already applied to live on the Applications tab instead.
            .filter(post => matchesFilters(post) && !applications.some(app => app.post_id === post.id))
            .sort((a, b) => newestFirst(a.createdAt, b.createdAt)),
        post => post,
    );

    // The plan decides how many jobs can be opened; assume the free limit until it loads.
    const visiblePosts = showSaved ? filteredPosts.filter(post => savedIds.includes(post.id!)) : filteredPosts;

    // The Applications tab honours the same filters; it used to render the raw list.
    const filteredApplications = rankByKeywords(
        applications
            .filter(app => matchesFilters(app.recruitment_requests))
            .sort((a, b) => newestFirst(a.created_at || a.recruitment_requests?.createdAt, b.created_at || b.recruitment_requests?.createdAt)),
        app => app.recruitment_requests,
    );

    // Open jobs the person can still apply to, and the ones inside the company they opened.
    const openPosts = posts.filter(post => !applications.some(app => app.post_id === post.id));
    const companyPosts = activeCompany
        ? openPosts.filter(p => companySlug(p.companyName || '') === companySlug(activeCompany)).sort((a, b) => newestFirst(a.createdAt, b.createdAt))
        : [];
    const closeCompanies = () => { setShowCompanies(false); setActiveCompany(null); };

    if (selectedJob) {
        return (
            <div className="min-h-[500px] px-4 sm:px-6 lg:px-8">
                <RecruitmentDetailView
                    recruitment={selectedJob}
                    onBack={() => setSelectedJob(null)}
                    isUserView
                />
            </div>
        );
    }

    return (
        <div className="px-4 py-1 sm:px-6 sm:py-2 lg:px-8 lg:py-3">
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Left Sidebar - Filters, starting level with the search field */}
                <aside className="hidden lg:block lg:col-span-1 pr-4 sticky top-24 self-start max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-hide">
                    <FilterSidebar
                        selectedFilters={selectedFilters}
                        onToggleFilter={toggleFilter}
                        onClearFilters={clearAllFilters}
                    />
                </aside>

                {/* Right Content - Search field at the top, posts below it */}
                <div className="lg:col-span-3 flex flex-col">
                    <div className="mb-3">
                        <div className="relative w-full">
                            <label htmlFor="job-keyword-search" className="sr-only">Search jobs by keywords</label>
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                <Search className="h-5 w-5 text-ink/40" />
                            </div>
                            <input
                                id="job-keyword-search"
                                type="text"
                                placeholder="Search by job title, skill, company or city"
                                title='Separate keywords with commas, e.g. "site engineer, autocad". Without commas each word is a keyword; use "quotes" to keep a phrase together.'
                                className={`block h-12 w-full rounded-lg border border-ink/20 bg-surface pl-11 pr-10 text-sm text-ink shadow-sm transition-colors placeholder:text-ink/40 hover:border-ink/40 ${FOCUS_RING}`}
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); if (showCompanies) closeCompanies(); }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape' && searchTerm) {
                                        e.preventDefault();
                                        setSearchTerm('');
                                    }
                                }}
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm('')}
                                    aria-label="Clear search"
                                    className={`absolute inset-y-0 right-0 my-auto mr-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-ink/50 transition-colors duration-200 hover:bg-ink/5 hover:text-ink ${FOCUS_RING}`}
                                >
                                    <X className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </div>
                    {/* My job alerts, then the companies hiring the most */}
                    {activeTab === 'jobs' && (
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
                            {showCompanies && activeCompany ? (
                                <div className="flex min-w-0 items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setActiveCompany(null)}
                                        aria-label="Back to companies"
                                        title="Back to companies"
                                        className={`inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-ink bg-transparent text-ink ${FOCUS_RING}`}
                                    >
                                        <Undo2 className="h-4 w-4 -scale-x-100" aria-hidden="true" />
                                    </button>
                                    <h3 className="min-w-0 truncate text-base font-bold leading-none text-ink">{activeCompany}</h3>
                                </div>
                            ) : showCompanies ? (
                                <button
                                    type="button"
                                    onClick={closeCompanies}
                                    aria-label="Back to posts"
                                    title="Back to posts"
                                    className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-ink bg-transparent pl-2.5 pr-3.5 text-sm font-bold text-ink ${FOCUS_RING}`}
                                >
                                    <Undo2 className="h-4 w-4 -scale-x-100" aria-hidden="true" />Back to posts
                                </button>
                            ) : (
                                <p aria-live="polite">
                                    {!loading && (
                                        <span className={`inline-flex h-8 items-center rounded-lg border border-ink px-3.5 text-xs font-bold text-ink`}>
                                            {visiblePosts.length} {showSaved ? 'saved' : ''} {visiblePosts.length === 1 ? 'post' : 'posts'}
                                        </span>
                                    )}
                                </p>
                            )}
                            <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
                            <button
                                type="button"
                                onClick={(e) => {
                                    const r = e.currentTarget.getBoundingClientRect();
                                    setAlertsOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
                                }}
                                className={`inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-bold text-ink transition-colors hover:text-brand ${FOCUS_RING}`}
                            >
                                <BellRing className="h-4 w-4" aria-hidden="true" />My job alerts
                            </button>
                            <button
                                type="button"
                                onClick={() => { closeCompanies(); setShowSaved(s => !s); }}
                                aria-pressed={showSaved}
                                className={`inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-bold transition-colors hover:text-brand ${showSaved ? 'text-brand' : 'text-ink'} ${FOCUS_RING}`}
                            >
                                <Bookmark className="h-4 w-4" aria-hidden="true" />Saved jobs
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowSaved(false);
                                    if (!showCompanies) setShowCompanies(true);
                                    else if (activeCompany) setActiveCompany(null);
                                    else closeCompanies();
                                }}
                                aria-pressed={showCompanies}
                                className={`inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-bold transition-colors hover:text-brand ${showCompanies ? 'text-brand' : 'text-ink'} ${FOCUS_RING}`}
                            >
                                <Building2 className="h-4 w-4" aria-hidden="true" />Top companies
                            </button>
                            </div>
                        </div>
                    )}
                    {/* Mobile-only filter trigger; on desktop the sidebar covers filtering */}
                    <div className="flex justify-end mb-3 lg:hidden">
                        <button
                            onClick={() => setIsFilterDrawerOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 border border-border bg-surface rounded-lg text-xs font-bold text-ink/80"
                        >
                            <Search className="w-3 h-3" /> Filters
                        </button>
                    </div>

                    {/* The cards sit straight on the page, each on its own white card; height matched to the filter sidebar */}
                    <div className="flex flex-col overflow-hidden max-h-[calc(100vh-7rem)]">
                        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide">
                        {loading ? (
                            <JobListSkeleton count={3} />
                        ) : activeTab === 'jobs' && showCompanies ? (
                            activeCompany ? (
                                <div>
                                    {companyPosts.length === 0 ? (
                                        <div className="text-center py-20 bg-muted rounded-lg border border-dashed border-border">
                                            <h3 className="text-lg font-bold text-ink mb-2">No open jobs here right now</h3>
                                            <p className="text-ink/60 max-w-sm mx-auto">Check another company, or come back later.</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-4">
                                            {companyPosts.map((post) => (
                                                <UserJobCard key={post.id} recruitment={post} onViewDetails={setSelectedJob} whiteCard plainSkills />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <TopCompaniesPanel posts={openPosts} onSelect={setActiveCompany} />
                            )
                        ) : activeTab === 'jobs' ? (
                            visiblePosts.length === 0 ? (
                                <div className="text-center py-20 bg-muted rounded-lg border border-dashed border-border">
                                    <h3 className="text-lg font-bold text-ink mb-2">{showSaved && savedIds.length === 0 ? 'No saved jobs yet' : 'No jobs matched your criteria'}</h3>
                                    <p className="text-ink/60 max-w-sm mx-auto">
                                        {showSaved && savedIds.length === 0 ? 'Open a job and choose Save to keep it here.' : 'Adjust filters or search terms.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {visiblePosts.map((post) => (
                                        <UserJobCard key={post.id} recruitment={post} onViewDetails={setSelectedJob} whiteCard plainSkills keywords={keywords} />
                                    ))}
                                </div>
                            )
                        ) : (
                            filteredApplications.length === 0 ? (
                                <div className="text-center py-20 bg-muted rounded-lg border border-dashed border-border">
                                    <h3 className="text-lg font-bold text-ink mb-2">
                                        {applications.length === 0 ? 'No applications yet' : 'No matching applications'}
                                    </h3>
                                    <p className="text-ink/60 max-w-sm mx-auto mb-6">
                                        {applications.length === 0
                                            ? "You haven't applied for any jobs yet."
                                            : 'Try clearing a filter or two to see more of your applications.'}
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {filteredApplications.map((app) => (
                                        <UserJobCard
                                            key={app.id}
                                            /* Spread the whole post: hand-picking fields used to drop
                                               `rounds`/`totalRounds` (and `modeOfWork`), so the detail
                                               view fell back to four unnamed interview rounds. */
                                            recruitment={{
                                                ...app.recruitment_requests,
                                                id: app.recruitment_requests.id,
                                                applicantCount: applicantCounts[app.recruitment_requests.id] || 0
                                            }}
                                            applicationStatus={app.status}
                                            whiteCard
                                            plainSkills
                                            keywords={keywords}
                                            onViewDetails={(j) => setSelectedJob(j)}
                                        />
                                    ))}
                                </div>
                            )
                        )}
                        </div>
                    </div>
                </div>
            </div>

            {alertsOrigin && (
                <ExpandingModal title="Job alerts" subtitle="Get notified when a new job matches your search" origin={alertsOrigin} onClose={() => setAlertsOrigin(null)} widthClass="max-w-[34rem]">
                    <JobAlertsPanel />
                </ExpandingModal>
            )}

            {/* Mobile Filter Drawer */}
            {isFilterDrawerOpen && (
                <div className="fixed inset-0 z-[100] lg:hidden">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => setIsFilterDrawerOpen(false)} />
                        <div className="absolute right-0 top-0 bottom-0 w-[280px] bg-surface border-l border-border overflow-y-auto scrollbar-hide z-[101]">
                        <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-surface z-10">
                            <h3 className="font-bold text-ink">Filters</h3>
                            <button onClick={() => setIsFilterDrawerOpen(false)} className="p-2 hover:bg-ink/5 rounded-lg"><ChevronDown className="w-5 h-5 rotate-90 text-ink/60" /></button>
                        </div>
                        <div className="p-4">
                            <FilterSidebar selectedFilters={selectedFilters} onToggleFilter={toggleFilter} onClearFilters={clearAllFilters} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
