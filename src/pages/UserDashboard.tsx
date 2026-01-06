import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { supabase } from '@/lib/supabase';
import type { RecruitmentRequest } from '@/types';
import UserHeader from '@/components/layout/UserHeader';

import RecruitmentDetailView from '@/components/recruitment/RecruitmentDetailView';
import UserJobCard from '@/components/recruitment/UserJobCard';
import FilterSidebar from '@/components/recruitment/FilterSidebar';
import { Search, Loader2, History, MapPin, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

export default function UserDashboard() {
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
    const [applications, setApplications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [locationTerm, setLocationTerm] = useState('');
    const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({
        jobType: [],
        experience: [],
        salary: []
    });
    const [sortBy, setSortBy] = useState<'recent' | 'oldest'>('recent');
    const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'jobs' | 'applications'>('jobs');
    const [applicantCounts, setApplicantCounts] = useState<Record<string, number>>({});
    const [selectedJob, setSelectedJob] = useState<RecruitmentRequest | null>(null);

    const navigate = useNavigate();
    const location = useLocation();

    // Sync state with URL
    useEffect(() => {
        if (location.pathname === '/my-applications') {
            setActiveTab('applications');
        } else {
            setActiveTab('jobs');
            // If we are just visiting /jobs, ensure we are not locked in a view?
            // Actually, if we support deep linking, we'd check ID here. But for now, no.
        }
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
                    if (userData.role === 'manager' || userData.role === 'recruiter') {
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
            // 1. Fetch applications from Supabase
            const { data: apps, error } = await supabase
                .from('job_applications')
                .select('*')
                .eq('user_id', user.uid)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (!apps) {
                setApplications([]);
                return;
            }

            // 2. Fetch corresponding job posts from Firestore
            const detailedApplications = await Promise.all(apps.map(async (app) => {
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
                    return null; // Post might have been deleted
                } catch (err) {
                    console.error('Error fetching post details:', err);
                    return null;
                }
            }));

            // Filter out nulls (deleted posts)
            setApplications(detailedApplications.filter(Boolean));

            // Also fetch counts for cards
            const { data: countData } = await supabase
                .from('job_applications')
                .select('post_id');

            const counts: Record<string, number> = {};
            countData?.forEach(app => {
                if (app.post_id) {
                    counts[app.post_id] = (counts[app.post_id] || 0) + 1;
                }
            });
            setApplicantCounts(counts);

            // We'll use this in the render mapping
            setPosts(prev => prev.map(p => ({ ...p, applicantCount: counts[p.id!] || 0 })));

        } catch (error) {
            console.error('Error fetching applications:', error);
            toast.error('Failed to load applications');
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

            // Fetch application counts from Supabase
            const { data: apps, error: appsError } = await supabase
                .from('job_applications')
                .select('post_id');

            if (appsError) {
                console.error('Error fetching application counts:', appsError);
            }

            const counts: Record<string, number> = {};
            apps?.forEach(app => {
                if (app.post_id) {
                    counts[app.post_id] = (counts[app.post_id] || 0) + 1;
                }
            });
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

    // Filter posts: Match search AND sidebar filters AND exclude applied posts
    const filteredPosts = posts.filter(post => {
        // 1. Search Logic
        const matchesSearch =
            post.jobTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
            post.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
            post.skills.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesLocation = post.location.toLowerCase().includes(locationTerm.toLowerCase());

        // 2. Sidebar Filter Logic
        const matchesJobType = selectedFilters.jobType.length === 0 || 
            selectedFilters.jobType.includes(post.positionLevel || 'Full Time'); // Map positionLevel to Job Type

        const matchesExperience = selectedFilters.experience.length === 0 || 
            selectedFilters.experience.some(exp => post.yearsExperience.toString().includes(exp.split(' ')[0]));
            // This is a rough match. Better would be exact categories.
            // For now: "Entry Level" matches any low number, etc.
            // Let's refine the experience matching:
            const isInExpRange = (exp: string) => {
                const years = parseInt(post.yearsExperience) || 0;
                if (exp === "Entry Level") return years <= 2;
                if (exp === "Mid Level") return years > 2 && years <= 5;
                if (exp === "Senior Level") return years > 5 && years <= 10;
                if (exp === "Director") return years > 10;
                return true;
            };
        const matchesExp = selectedFilters.experience.length === 0 || selectedFilters.experience.some(isInExpRange);

        const matchesSalary = selectedFilters.salary.length === 0 || 
            selectedFilters.salary.some(sal => {
                const budget = post.budgetPay?.toLowerCase() || '';
                // Check if budget string contains the selected range label (e.g., "10-20 LPA")
                return budget.includes(sal.toLowerCase()) || budget.includes(sal.split(' ')[0]);
            });

        // 3. Application Exclusion
        const isApplied = applications.some(app => app.post_id === post.id);

        return matchesSearch && matchesLocation && matchesJobType && matchesExp && matchesSalary && !isApplied;
    }).sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return sortBy === 'recent' 
            ? dateB.getTime() - dateA.getTime() 
            : dateA.getTime() - dateB.getTime();
    });

    if (selectedJob) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col">
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
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <UserHeader />

            <main className="flex-1 w-full px-6 lg:px-12 py-8 relative overflow-hidden">
                {/* Gradient Background with Dotted Patterns */}
                <div className="absolute inset-0 pointer-events-none">
                    {/* Soft gradient overlay - top to bottom */}
                    <div
                        className="absolute inset-0 opacity-30"
                        style={{
                            background: 'linear-gradient(135deg, rgba(249, 250, 251, 0.5) 0%, rgba(229, 231, 235, 0.3) 50%, rgba(249, 250, 251, 0.5) 100%)',
                        }}
                    />

                    {/* Dotted halftone pattern - top right */}
                    <div
                        className="absolute top-0 right-0 w-80 h-80 opacity-50"
                        style={{
                            backgroundImage: `radial-gradient(circle, rgba(209, 213, 219, 0.8) 1.5px, transparent 1.5px)`,
                            backgroundSize: '10px 10px',
                            maskImage: 'radial-gradient(ellipse at top right, black 0%, transparent 70%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at top right, black 0%, transparent 70%)',
                        }}
                    />

                    {/* Dotted halftone pattern - bottom left */}
                    <div
                        className="absolute bottom-0 left-0 w-80 h-80 opacity-50"
                        style={{
                            backgroundImage: `radial-gradient(circle, rgba(209, 213, 219, 0.8) 1.5px, transparent 1.5px)`,
                            backgroundSize: '10px 10px',
                            maskImage: 'radial-gradient(ellipse at bottom left, black 0%, transparent 70%)',
                            WebkitMaskImage: 'radial-gradient(ellipse at bottom left, black 0%, transparent 70%)',
                        }}
                    />

                    {/* Subtle wave accent */}
                    <div
                        className="absolute top-1/4 left-0 w-full h-64 opacity-20"
                        style={{
                            background: 'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(229, 231, 235, 0.6) 0%, transparent 70%)',
                        }}
                    />
                </div>

                {/* Header Title Section */}
                <div className="text-center mb-6 md:mb-8 relative z-10">
                    <h1 className="text-2xl md:text-4xl font-outfit font-bold text-gray-900 mb-2 tracking-tight">
                        Find Your Dream Job at <span className="bg-gradient-to-r from-orange-600 to-rose-500 bg-clip-text text-transparent">Indian Infra</span>
                    </h1>
                    <p className="text-gray-500 text-xs md:text-base font-medium max-w-2xl mx-auto opacity-80 px-4">
                        Explore core infrastructure and technology roles across India's top companies
                    </p>
                </div>

                {/* Search Bar - Premium Centered Version */}
                <div className="flex justify-center mb-12 relative z-10 px-4">
                    <div className="w-full max-w-4xl bg-white/70 backdrop-blur-xl border border-white/40 rounded-xl p-1 shadow-[0_15px_35px_rgba(0,0,0,0.03)] flex flex-col md:flex-row items-center gap-2">
                        {/* Job Search Field */}
                        <div className="relative flex-1 w-full group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-orange-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="Job title, keywords, or company"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full font-inter pl-11 pr-4 py-2 bg-transparent rounded-xl focus:outline-none text-gray-700 text-sm md:text-base placeholder:text-gray-400/70"
                            />
                        </div>

                        {/* Divider - Only on Desktop */}
                        <div className="hidden md:block h-8 w-px bg-gray-200/80" />

                        {/* Location Field */}
                        <div className="relative flex-[0.7] w-full group ">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-orange-500 transition-colors" />
                            <input
                                type="text"
                                placeholder="City or state"
                                value={locationTerm}
                                onChange={(e) => setLocationTerm(e.target.value)}
                                className="w-full font-inter pl-11 pr-4 py-2 bg-transparent rounded-xl focus:outline-none text-gray-700 text-sm md:text-base placeholder:text-gray-400/70"
                            />
                        </div>

                        {/* Search Button */}
                        <button 
                            className="w-full md:w-auto px-7 py-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white font-bold rounded-xl hover:shadow-[0_8px_16px_rgba(234,88,12,0.15)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300 text-sm md:text-base whitespace-nowrap"
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
                        />
                    </aside>

                    {/* Right Content - Job List */}
                    <div className="lg:col-span-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8">
                            <div className="flex items-center justify-between w-full sm:w-auto">
                                <h2 className="text-lg md:text-2xl font-bold text-gray-900">
                                    Latest Jobs <span className="text-orange-600">({filteredPosts.length})</span>
                                </h2>
                                {/* Mobile Filter Toggle */}
                                <button 
                                    onClick={() => setIsFilterDrawerOpen(true)}
                                    className="lg:hidden flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-[10px] font-bold text-gray-700 shadow-sm"
                                >
                                    <Search className="w-3 h-3" />
                                    Filters
                                </button>
                            </div>
                            <div className="flex items-center gap-3 self-end sm:self-auto">
                                <span className="text-[10px] md:text-sm font-medium text-gray-500">Sort by:</span>
                                <div className="relative group">
                                    <button className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-white border border-gray-100 rounded-xl text-[10px] md:text-sm font-bold text-gray-700 shadow-sm hover:border-gray-200 transition-all">
                                        {sortBy === 'recent' ? 'Most Recent' : 'Oldest First'}
                                        <ChevronDown className="w-3 h-3 md:w-4 md:h-4 text-gray-400" />
                                    </button>
                                    <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                                        <button 
                                            onClick={() => setSortBy('recent')}
                                            className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${sortBy === 'recent' ? 'text-orange-600 bg-orange-50' : 'text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            Most Recent
                                        </button>
                                        <button 
                                            onClick={() => setSortBy('oldest')}
                                            className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${sortBy === 'oldest' ? 'text-orange-600 bg-orange-50' : 'text-gray-600 hover:bg-gray-50'}`}
                                        >
                                            Oldest First
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <Loader2 className="w-12 h-12 text-primary-600 animate-spin mb-4" />
                                <p className="text-gray-500 font-medium">Loading content...</p>
                            </div>
                        ) : activeTab === 'jobs' ? (
                            filteredPosts.length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                                    <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <Search className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">No jobs found</h3>
                                    <p className="text-gray-500 max-w-sm mx-auto">
                                        Try adjusting your keywords or filters.
                                    </p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-6">
                                    {filteredPosts.map((post) => (
                                        <UserJobCard
                                            key={post.id}
                                            recruitment={post}
                                            onViewDetails={(j) => setSelectedJob(j)}
                                        />
                                    ))}
                                </div>
                            )
                        ) : (
                            applications.length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
                                    <div className="bg-orange-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <History className="w-8 h-8 text-orange-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">No applications yet</h3>
                                    <p className="text-gray-500 max-w-sm mx-auto mb-6">
                                        You haven't applied for any jobs yet. Browse available jobs to get started!
                                    </p>
                                    <button
                                        onClick={() => setActiveTab('jobs')}
                                        className="inline-flex items-center px-6 py-2.5 bg-primary-600 text-white font-bold rounded-xl hover:bg-primary-700 transition-all"
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
                                                requestedBy: app.recruitment_requests.requestedBy,
                                                createdAt: app.recruitment_requests.createdAt,
                                                applicantCount: applicantCounts[app.recruitment_requests.id] || 0
                                            } as any}
                                            onViewDetails={(j) => setSelectedJob(j)}
                                        />
                                    ))}
                                </div>
                            )
                        )}
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
                        <div className="absolute right-0 top-0 bottom-0 w-[280px] bg-gray-50 shadow-2xl overflow-y-auto animate-slide-left">
                            <div className="p-4 bg-white border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
                                <h3 className="font-bold text-gray-900">Filters</h3>
                                <button 
                                    onClick={() => setIsFilterDrawerOpen(false)}
                                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                >
                                    <ChevronDown className="w-5 h-5 rotate-90" />
                                </button>
                            </div>
                            <div className="p-4">
                                <FilterSidebar 
                                    selectedFilters={selectedFilters}
                                    onToggleFilter={toggleFilter}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Scrolling Text Banner - Inside Main Section */}
                <div className="flex justify-center py-2 mt-24 relative z-10">
                    <div className="bg-white/40 backdrop-blur-sm border border-white/50 rounded-2xl py-3 px-8 overflow-hidden max-w-4xl shadow-sm">
                        <div className="animate-scroll whitespace-nowrap flex items-center">
                            <span className="inline-block text-gray-600 text-sm font-bold font-inter px-8 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                Complete your profile: Add Skills • Projects • Certificates • Experience
                            </span>
                            <span className="inline-block text-gray-600 text-sm font-bold font-inter px-8 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary-600 animate-pulse" />
                                Boost your chances: Update Resume • Portfolio • Achievements
                            </span>
                             <span className="inline-block text-gray-600 text-sm font-bold font-inter px-8 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                Get noticed faster: Add Skills • Projects • Professional Summary
                            </span>
                            {/* Duplicates for smooth loop */}
                            <span className="inline-block text-gray-600 text-sm font-bold font-inter px-8 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                Complete your profile: Add Skills • Projects • Certificates • Experience
                            </span>
                            <span className="inline-block text-gray-600 text-sm font-bold font-inter px-8 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary-600 animate-pulse" />
                                Boost your chances: Update Resume • Portfolio • Achievements
                            </span>
                             <span className="inline-block text-gray-600 text-sm font-semibold px-8 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                                Get noticed faster: Add Skills • Projects • Professional Summary
                            </span>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
