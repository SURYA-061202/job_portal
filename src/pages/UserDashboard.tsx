import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getUserApplications, getApplicantCounts } from '@/lib/jobApplications';
import type { RecruitmentRequest } from '@/types';
import UserHeader from '@/components/layout/UserHeader';

import RecruitmentDetailView from '@/components/recruitment/RecruitmentDetailView';
import UserJobCard from '@/components/recruitment/UserJobCard';
import FilterSidebar from '@/components/recruitment/FilterSidebar';
import { Search, History, MapPin, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSkin, FOCUS } from '@/styles/skin';
import { JobListSkeleton } from '@/components/user/SkeletonLoaders';

export default function UserDashboard() {
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
    const [applications, setApplications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [locationTerm, setLocationTerm] = useState('');
    const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
        jobType: [],
        experience: [],
        salary: [],
        department: []
    });
    const [sortBy, setSortBy] = useState<'recent' | 'oldest'>('recent');
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'jobs' | 'applications'>('jobs');
    const [applicantCounts, setApplicantCounts] = useState<Record<string, number>>({});
    const [selectedJob, setSelectedJob] = useState<RecruitmentRequest | null>(null);
    const skin = useSkin();

    const navigate = useNavigate();
    const location = useLocation();

    // Sync state with URL
    useEffect(() => {
        if (location.pathname === '/my-applications') {
            setActiveTab('applications');
        } else {
            setActiveTab('jobs');
        }
        setSelectedJob(null); // Reset detail view on tab switch
    }, [location.pathname]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                navigate('/', { replace: true });
                return;
            }

            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    if (userData.role === 'manager' || userData.role === 'recruiter' || userData.role === 'admin') {
                        navigate('/dashboard', { replace: true });
                        return;
                    }
                }
            } catch (error) {
                console.error('Error checking role in UserDashboard:', error);
            }
            if (activeTab === 'jobs') fetchPosts();
            else fetchApplications();
        });

        return () => unsubscribe();
    }, [navigate, activeTab]);

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

            const postsData = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as RecruitmentRequest[];

            const counts = await getApplicantCounts();
            setApplicantCounts(counts);

            const merged = postsData.map(post => ({
                ...post,
                applicantCount: counts[post.id!] || 0
            }));

            setPosts(merged);
        } catch (error) {
            console.error('Error fetching posts from Firestore:', error);
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
            jobType: [],
            experience: [],
            salary: [],
            department: []
        });
    };

    const handleViewJobDetails = async (job: RecruitmentRequest) => {
        const user = auth.currentUser;
        if (user && job.id) {
            try {
                // If user hasn't viewed this job, add them to viewedBy
                if (!job.viewedBy?.includes(user.uid)) {
                    await updateDoc(doc(db, 'recruits', job.id), {
                        viewedBy: arrayUnion(user.uid)
                    });
                    
                    // Update local state to clear "New" badge immediately
                    setPosts(prev => prev.map(p => 
                        p.id === job.id 
                            ? { ...p, viewedBy: [...(p.viewedBy || []), user.uid] } 
                            : p
                    ));
                }
            } catch (error) {
                console.error('Error updating view status:', error);
            }
        }
        setSelectedJob(job);
    };

    // Filter posts: Match search AND sidebar filters AND exclude applied posts
    const filteredPosts = posts.filter(post => {
        // 1. Search Logic
        const matchesSearch =
            post.jobTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
            post.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
            post.skills.toLowerCase().includes(searchTerm.toLowerCase()) ||
            post.companyName?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesLocation = post.location.toLowerCase().includes(locationTerm.toLowerCase());

        // 2. Sidebar Filter Logic
        const matchesJobType = selectedFilters.jobType.length === 0 ||
            selectedFilters.jobType.includes(post.candidateType || 'Permanent');


        // Experience Level: exact match against the positionLevel the Add Post
        // form stores (Entry | Junior | Mid | Senior | Manager).
        const matchesExp = selectedFilters.experience.length === 0 ||
            selectedFilters.experience.includes(String(post.positionLevel || ''));

        // Salary filter logic - parse budgetPay string and match ranges
        const matchesSalary = selectedFilters.salary.length === 0 ||
            selectedFilters.salary.some(sal => {
                const budget = post.budgetPay?.toLowerCase() || '';
                // Extract numbers from budget string (e.g., "10-15 LPA" or "₹10,00,000")
                const budgetNumbers = budget.match(/\d+/g);
                if (!budgetNumbers || budgetNumbers.length === 0) return false;

                const budgetValue = parseInt(budgetNumbers[0]);

                // Match against salary ranges
                if (sal === "0-5 LPA" && budgetValue >= 0 && budgetValue <= 5) return true;
                if (sal === "5-10 LPA" && budgetValue > 5 && budgetValue <= 10) return true;
                if (sal === "10-20 LPA" && budgetValue > 10 && budgetValue <= 20) return true;
                if (sal === "20+ LPA" && budgetValue > 20) return true;

                return false;
            });

        // Department filter logic
        const matchesDepartment = selectedFilters.department.length === 0 ||
            selectedFilters.department.includes(post.department);

        // 3. Application Exclusion
        const isApplied = applications.some(app => app.post_id === post.id);

        return matchesSearch && matchesLocation && matchesJobType && matchesExp && matchesSalary && matchesDepartment && !isApplied;
    }).sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return sortBy === 'recent'
            ? dateB.getTime() - dateA.getTime()
            : dateA.getTime() - dateB.getTime();
    });

    // Extract unique departments from all posts for department filter
    const uniqueDepartments = Array.from(new Set(posts.map(post => post.department).filter(Boolean))).sort();

    if (selectedJob) {
        return (
            <div className={`min-h-screen ${skin.canvas} flex flex-col`}>
                <UserHeader />
                <div className="flex-1 w-full px-6 lg:px-12 py-8 h-full">
                    <RecruitmentDetailView
                        recruitment={selectedJob}
                        onBack={() => setSelectedJob(null)}
                    />
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen ${skin.canvas} flex flex-col`}>
            <UserHeader />

            <main className="flex-1 w-full px-4 sm:px-6 lg:px-12 py-6 sm:py-8 relative overflow-hidden">
                {/* Header Title Section */}
                <div className="text-center mb-6 md:mb-8 relative z-10">
                    <h1 className={`${skin.heading} mb-2`}>
                        Find Your Dream Job at <span className="text-brand">IndianInfra</span>
                    </h1>
                    <p className="text-ink/60 text-xs md:text-base font-medium max-w-2xl mx-auto opacity-80 px-4">
                        Explore core infrastructure and technology roles across India's top companies
                    </p>
                </div>

                {/* Search Bar - Premium Centered Version */}
                <div className="flex justify-center mb-12 relative z-10 px-4">
                    <div className={`w-full max-w-4xl border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} p-1 flex flex-col md:flex-row items-center gap-2`}>
                        {/* Job Search Field */}
                        <div className="relative flex-1 w-full group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40 group-focus-within:text-brand transition-colors" />
                            <input
                                type="text"
                                placeholder="Job title, keywords, or company"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className={`w-full font-inter pl-11 pr-4 py-2 ${skin.field} ${FOCUS}`}
                            />
                        </div>

                        {/* Divider - Only on Desktop */}
                        <div className="hidden md:block h-8 w-px bg-border" />

                        {/* Location Field */}
                        <div className="relative flex-[0.7] w-full group ">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-ink/40 group-focus-within:text-brand transition-colors" />
                            <input
                                type="text"
                                placeholder="City or state"
                                value={locationTerm}
                                onChange={(e) => setLocationTerm(e.target.value)}
                                className={`w-full font-inter pl-11 pr-4 py-2 ${skin.field} ${FOCUS}`}
                            />
                        </div>

                        {/* Search Button */}
                        <button
                            className={`w-full md:w-auto whitespace-nowrap inline-flex items-center gap-2 cursor-pointer ${skin.cta} ${FOCUS}`}
                        >
                            Search Jobs
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 relative z-10">
                    {/* Left Sidebar - Filters */}
                    <aside className="hidden lg:block lg:col-span-1">
                        <FilterSidebar
                            selectedFilters={selectedFilters}
                            onToggleFilter={toggleFilter}
                            onClearFilters={clearAllFilters}
                        />
                    </aside>

                    {/* Right Content - Job List */}
                    <div className="lg:col-span-3 flex flex-col">
                        {/* Sticky Header with Title and Sort */}
                        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-2 sticky top-0 ${skin.surface} py-4 z-10`}>
                            <div className="flex items-center justify-between w-full sm:w-auto">
                                <h2 className={skin.cardTitle}>
                                    {activeTab === 'jobs' ? 'Latest Jobs' : 'Applied Jobs'} <span className="text-ink/60">({activeTab === 'jobs' ? filteredPosts.length : applications.length})</span>
                                </h2>
                                {/* Mobile Filter Toggle */}
                                <button
                                    onClick={() => setIsFilterDrawerOpen(true)}
                                    className={`lg:hidden flex items-center gap-2 px-3 py-1.5 border ${skin.edge} ${skin.surface} ${skin.radius} text-[10px] font-bold text-ink/80 shadow-sm ${FOCUS}`}
                                >
                                    <Search className="w-3 h-3" />
                                    Filters
                                </button>
                            </div>
                            <div className="flex items-center gap-3 self-end sm:self-auto">
                                {/* Department Filter */}
                                <div className="relative group">
                                    <button className={`flex items-center gap-2 ${skin.secondary} ${FOCUS}`}>
                                        {selectedFilters.department.length > 0
                                            ? `${selectedFilters.department.length} Dept${selectedFilters.department.length > 1 ? 's' : ''}`
                                            : 'Department'}
                                        <ChevronDown className="w-3 h-3 md:w-4 md:h-4 text-ink/60" />
                                    </button>
                                    <div className={`absolute right-0 mt-2 w-48 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} max-h-60 overflow-y-auto z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200`}>
                                        {uniqueDepartments.length > 0 ? (
                                            <>
                                                {selectedFilters.department.length > 0 && (
                                                    <div className={`sticky top-0 ${skin.surface} border-b ${skin.edge} px-4 py-2 flex items-center justify-between z-10`}>
                                                        <span className="text-xs font-bold text-ink/80">Departments</span>
                                                        <button
                                                            onClick={() => setSelectedFilters(prev => ({ ...prev, department: [] }))}
                                                            className={`px-2 py-1 text-xs font-bold text-destructive hover:text-destructive hover:bg-destructive/10 ${skin.radius} transition-all ${FOCUS}`}
                                                            title="Clear departments"
                                                        >
                                                            Clear
                                                        </button>
                                                    </div>
                                                )}
                                                <div className="py-1">
                                                    {uniqueDepartments.map((dept) => (
                                                        <label
                                                            key={dept}
                                                            className={`flex items-center px-4 py-2 cursor-pointer transition-colors ${selectedFilters.department.includes(dept)
                                                                ? 'text-brand bg-brand/10'
                                                                : `text-ink/60 ${skin.rowHover}`
                                                                }`}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedFilters.department.includes(dept)}
                                                                onChange={() => toggleFilter('department', dept)}
                                                                className={`w-4 h-4 text-brand ${skin.edge} rounded ${FOCUS}`}
                                                            />
                                                            <span className="ml-2 text-xs font-bold">{dept}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="px-4 py-2 text-xs text-ink/60">No departments</div>
                                        )}
                                    </div>
                                </div>

                                {/* Sort Dropdown */}
                                <div className="relative group">
                                    <button className={`flex items-center gap-2 ${skin.secondary} ${FOCUS}`}>
                                        {sortBy === 'recent' ? 'Most Recent' : 'Oldest First'}
                                        <ChevronDown className="w-3 h-3 md:w-4 md:h-4 text-ink/60" />
                                    </button>
                                    <div className={`absolute right-0 mt-2 w-40 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} py-1 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200`}>
                                        <button
                                            onClick={() => setSortBy('recent')}
                                            className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${sortBy === 'recent' ? 'text-brand bg-brand/10' : `text-ink/60 ${skin.rowHover}`}`}
                                        >
                                            Most Recent
                                        </button>
                                        <button
                                            onClick={() => setSortBy('oldest')}
                                            className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${sortBy === 'oldest' ? 'text-brand bg-brand/10' : `text-ink/60 ${skin.rowHover}`}`}
                                        >
                                            Oldest First
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Scrollable Job Cards Container - Hidden Scrollbar */}
                        <div className="overflow-y-auto scrollbar-hide" style={{ maxHeight: 'calc(101vh)' }}>
                            {loading ? (
                                <JobListSkeleton count={3} />
                            ) : activeTab === 'jobs' ? (
                                filteredPosts.length === 0 ? (
                                    <div className={`text-center py-20 border border-dashed ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
                                        <div className={`${skin.stateIcon} w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4`}>
                                            <Search className="w-8 h-8" />
                                        </div>
                                        <h3 className={`${skin.emptyTitle} mb-2`}>No jobs found</h3>
                                        <p className={`${skin.body} max-w-sm mx-auto`}>
                                            Try adjusting your keywords or filters.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-6">
                                        {filteredPosts.map((post) => (
                                            <UserJobCard
                                                key={post.id}
                                                recruitment={post}
                                                currentUserId={auth.currentUser?.uid}
                                                onViewDetails={handleViewJobDetails}
                                            />
                                        ))}
                                    </div>
                                )
                            ) : (
                                applications.length === 0 ? (
                                    <div className={`text-center py-20 border border-dashed ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
                                        <div className={`${skin.stateIcon} w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4`}>
                                            <History className="w-8 h-8 text-brand" />
                                        </div>
                                        <h3 className={`${skin.emptyTitle} mb-2`}>No applications yet</h3>
                                        <p className={`${skin.body} max-w-sm mx-auto mb-6`}>
                                            You haven't applied for any jobs yet. Browse available jobs to get started!
                                        </p>
                                        <button
                                            onClick={() => navigate('/jobs')}
                                            className={`inline-flex items-center gap-2 cursor-pointer ${skin.cta} ${FOCUS}`}
                                        >
                                            Browse Jobs
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-6">
                                        {applications.map((app) => (
                                            <UserJobCard
                                                key={app.id}
                                                recruitment={{
                                                    id: app.recruitment_requests.id,
                                                    jobTitle: app.recruitment_requests.jobTitle,
                                                    urgencyLevel: app.recruitment_requests.urgencyLevel,
                                                    department: app.recruitment_requests.department,
                                                    candidateType: app.recruitment_requests.candidateType,
                                                    positionLevel: app.recruitment_requests.positionLevel,
                                                    yearsExperience: app.recruitment_requests.yearsExperience,
                                                    location: app.recruitment_requests.location,
                                                    candidatesCount: app.recruitment_requests.candidatesCount,
                                                    qualification: app.recruitment_requests.qualification,
                                                    skills: app.recruitment_requests.skills,
                                                    description: app.recruitment_requests.description,
                                                    jdUrl: app.recruitment_requests.jdUrl,
                                                    budgetPay: app.recruitment_requests.budgetPay,
                                                    salaryBreakup: app.recruitment_requests.salaryBreakup,
                                                    recruiterName: app.recruitment_requests.recruiterName,
                                                    companyName: app.recruitment_requests.companyName,
                                                    createdAt: app.recruitment_requests.createdAt,
                                                    applicantCount: applicantCounts[app.recruitment_requests.id] || 0
                                                } as any}
                                                applicationStatus={app.status}
                                                onViewDetails={handleViewJobDetails}
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
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                            onClick={() => setIsFilterDrawerOpen(false)}
                        />
                        {/* Drawer */}
                        <div className={`absolute right-0 top-0 bottom-0 w-[280px] ${skin.canvas} shadow-2xl overflow-y-auto animate-slide-left`}>
                            <div className={`p-4 ${skin.surface} border-b ${skin.edge} flex items-center justify-between sticky top-0 z-10`}>
                                <h3 className="font-bold text-ink">Filters</h3>
                                <button
                                    onClick={() => setIsFilterDrawerOpen(false)}
                                    className={`p-2 cursor-pointer hover:bg-ink/5 ${skin.radius} transition-colors ${FOCUS}`}
                                >
                                    <ChevronDown className="w-5 h-5 rotate-90" />
                                </button>
                            </div>
                            <div className="p-4">
                                <FilterSidebar
                                    selectedFilters={selectedFilters}
                                    onToggleFilter={toggleFilter}
                                            onClearFilters={clearAllFilters}
                                />
                            </div>
                        </div>
                    </div>
                )}


            </main>
        </div>
    );
}
