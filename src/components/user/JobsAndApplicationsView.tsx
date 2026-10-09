import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { getUserApplications, getApplicantCounts } from '@/lib/jobApplications';
import type { RecruitmentRequest } from '@/types';
import RecruitmentDetailView from '@/components/recruitment/RecruitmentDetailView';
import UserJobCard from '@/components/recruitment/UserJobCard';
import FilterSidebar from '@/components/recruitment/FilterSidebar';
import { JobListSkeleton } from '@/components/user/SkeletonLoaders';
import { Search, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

interface JobsAndApplicationsViewProps {
    activeTab: 'jobs' | 'applications';
    /** Kept for callers; the filter sidebar no longer shows a profile prompt. */
    onCompleteProfile?: () => void;
}

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

    useEffect(() => {
        setSelectedJob(null);
    }, [activeTab]);

    useEffect(() => {
        if (!auth.currentUser) return;
        if (activeTab === 'jobs') fetchPosts();
        else fetchApplications();
    }, [activeTab]);

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

            const counts = await getApplicantCounts();
            setApplicantCounts(counts);

        } catch (error: any) {
            console.error('Error fetching applications:', error);
            toast.error('Failed to load applications. ' + (error?.message || ''));
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

            const counts = await getApplicantCounts();
            setApplicantCounts(counts);

            const merged = postsData.map(post => ({
                ...post,
                applicantCount: counts[post.id!] || 0
            }));

            setPosts(merged);
        } catch (error) {
            console.error('Error fetching posts:', error);
            toast.error('Failed to load job posts');
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

        const term = searchTerm.trim().toLowerCase();
        const matchesSearch = !term || [post.jobTitle, post.department, post.skills, post.companyName]
            .some(field => String(field || '').toLowerCase().includes(term));

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

        return matchesSearch && matchesJobType && matchesExp && matchesSalary && matchesDepartment && matchesLocation;
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

    const filteredPosts = posts
        // Jobs already applied to live on the Applications tab instead.
        .filter(post => matchesFilters(post) && !applications.some(app => app.post_id === post.id))
        .sort((a, b) => newestFirst(a.createdAt, b.createdAt));

    // The Applications tab honours the same filters; it used to render the raw list.
    const filteredApplications = applications
        .filter(app => matchesFilters(app.recruitment_requests))
        .sort((a, b) => newestFirst(a.created_at || a.recruitment_requests?.createdAt, b.created_at || b.recruitment_requests?.createdAt));


    if (selectedJob) {
        return (
            <div className="min-h-[500px]">
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
                        <div className="w-full bg-surface border border-border rounded-lg p-1.5 flex items-center gap-2 transition-all duration-300 focus-within:border-ink">
                            <div className="relative flex-1 w-full group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-ink/40 group-focus-within:text-brand transition-colors" />
                                <input
                                    type="text"
                                    placeholder="Job title, keywords, or company"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full font-inter pl-12 pr-4 py-3 bg-transparent rounded-lg focus:outline-none text-ink text-sm md:text-base placeholder:text-ink/40"
                                />
                            </div>
                            <button
                                className="w-full md:w-auto px-6 py-2.5 border border-ink bg-ink text-surface rounded-lg font-semibold text-sm hover:bg-ink/80 hover:border-ink/80 hover:scale-[1.02] active:scale-95 transition-all"
                            >
                                Search
                            </button>
                        </div>
                    </div>
                    {/* Mobile-only filter trigger; on desktop the sidebar covers filtering */}
                    <div className="flex justify-end mb-3 lg:hidden">
                        <button
                            onClick={() => setIsFilterDrawerOpen(true)}
                            className="flex items-center gap-2 px-3 py-1.5 border border-border bg-surface rounded-lg text-xs font-bold text-ink/80"
                        >
                            <Search className="w-3 h-3" /> Filters
                        </button>
                    </div>

                    {/* White panel holding the cards, height matched to the filter sidebar */}
                    <div className="bg-surface border border-border rounded-lg p-3 md:p-4 overflow-y-auto scrollbar-hide max-h-[calc(100vh-7rem)]">
                        {loading ? (
                            <JobListSkeleton count={3} />
                        ) : activeTab === 'jobs' ? (
                            filteredPosts.length === 0 ? (
                                <div className="text-center py-20 bg-muted rounded-lg border border-dashed border-border">
                                    <h3 className="text-lg font-bold text-ink mb-2">No jobs matched your criteria</h3>
                                    <p className="text-ink/60 max-w-sm mx-auto">Adjust filters or search terms.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {filteredPosts.map((post) => (
                                        <UserJobCard key={post.id} recruitment={post} onViewDetails={setSelectedJob} />
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
                                            onViewDetails={(j) => setSelectedJob(j)}
                                        />
                                    ))}
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>

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
