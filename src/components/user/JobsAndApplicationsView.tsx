import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { supabase } from '@/lib/supabase';
import type { RecruitmentRequest } from '@/types';
import RecruitmentDetailView from '@/components/recruitment/RecruitmentDetailView';
import UserJobCard from '@/components/recruitment/UserJobCard';
import FilterSidebar from '@/components/recruitment/FilterSidebar';
import { Search, Loader2, History, MapPin, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

interface JobsAndApplicationsViewProps {
    activeTab: 'jobs' | 'applications';
    onCompleteProfile: () => void;
}

export default function JobsAndApplicationsView({ activeTab, onCompleteProfile }: JobsAndApplicationsViewProps) {
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
                    return null;
                } catch (err) {
                    console.error('Error fetching post details:', err);
                    return null;
                }
            }));

            setApplications(detailedApplications.filter(Boolean));

            const { data: countData } = await supabase.from('job_applications').select('post_id');
            const counts: Record<string, number> = {};
            countData?.forEach(app => {
                if (app.post_id) {
                    counts[app.post_id] = (counts[app.post_id] || 0) + 1;
                }
            });
            setApplicantCounts(counts);

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

            const postsData = querySnapshot.docs.map(docSnap => ({
                id: docSnap.id,
                ...docSnap.data()
            })) as RecruitmentRequest[];

            const { data: apps } = await supabase.from('job_applications').select('post_id');
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
            jobType: [], experience: [], salary: [], department: []
        });
    };

    const filteredPosts = posts.filter(post => {
        const matchesSearch =
            post.jobTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
            post.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
            post.skills.toLowerCase().includes(searchTerm.toLowerCase()) ||
            post.companyName?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesLocation = post.location.toLowerCase().includes(locationTerm.toLowerCase());

        const matchesJobType = selectedFilters.jobType.length === 0 ||
            selectedFilters.jobType.includes(post.candidateType || 'Permanent');

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
            selectedFilters.department.includes(post.department);

        const isApplied = applications.some(app => app.post_id === post.id);

        return matchesSearch && matchesLocation && matchesJobType && matchesExp && matchesSalary && matchesDepartment && !isApplied;
    }).sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return sortBy === 'recent' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
    });


    if (selectedJob) {
        return (
            <div className="min-h-[500px]">
                <RecruitmentDetailView
                    recruitment={selectedJob}
                    onBack={() => setSelectedJob(null)}
                />
            </div>
        );
    }

    return (
        <div className="px-4 py-1 sm:px-6 sm:py-2 lg:px-8 lg:py-3">
            {/* Search Bar */}
            <div className="flex justify-center mb-10">
                <div className="w-full max-w-4xl bg-white border border-gray-100 rounded-2xl p-1.5 flex flex-col md:flex-row items-center gap-2 shadow-xl shadow-gray-200/40 transition-all duration-300 focus-within:shadow-orange-500/10 focus-within:border-orange-200">
                    <div className="relative flex-1 w-full group">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 group-focus-within:text-orange-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="Job title, keywords, or company"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full font-inter pl-12 pr-4 py-3 bg-transparent rounded-xl focus:outline-none text-gray-700 text-sm md:text-base placeholder:text-gray-400/60"
                        />
                    </div>
                    <div className="hidden md:block h-10 w-px bg-gray-100" />
                    <div className="relative flex-[0.7] w-full group">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400 group-focus-within:text-orange-500 transition-colors" />
                        <input
                            type="text"
                            placeholder="City or state"
                            value={locationTerm}
                            onChange={(e) => setLocationTerm(e.target.value)}
                            className="w-full font-inter pl-12 pr-4 py-3 bg-transparent rounded-xl focus:outline-none text-gray-700 text-sm md:text-base placeholder:text-gray-400/60"
                        />
                    </div>
                    <button 
                        className="w-full md:w-auto px-8 py-3 bg-orange-gradient text-white rounded-xl font-bold text-sm hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-orange-500/20"
                    >
                        Search
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Left Sidebar - Filters */}
                <aside className="hidden lg:block lg:col-span-1 border-r border-gray-100 pr-4">
                    <FilterSidebar
                        selectedFilters={selectedFilters}
                        onToggleFilter={toggleFilter}
                        onCompleteProfile={onCompleteProfile}
                        onClearFilters={clearAllFilters}
                    />
                </aside>

                {/* Right Content - Job List */}
                <div className="lg:col-span-3 flex flex-col">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div className="flex items-center justify-between w-full sm:w-auto">
                            <h2 className="text-lg md:text-xl font-bold text-gray-900">
                                {activeTab === 'jobs' ? 'Available Jobs' : 'Your Applications'} <span className="text-orange-600">({activeTab === 'jobs' ? filteredPosts.length : applications.length})</span>
                            </h2>
                            <button
                                onClick={() => setIsFilterDrawerOpen(true)}
                                className="lg:hidden flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-700"
                            >
                                <Search className="w-3 h-3" /> Filters
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            {/* Sort Dropdown */}
                            <div className="relative group z-10">
                                <button className="flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 bg-white border border-gray-200 rounded-xl text-xs sm:text-sm font-bold text-gray-700 hover:border-gray-300 transition-all">
                                    {sortBy === 'recent' ? 'Most Recent' : 'Oldest First'}
                                    <ChevronDown className="w-3 h-3 md:w-4 md:h-4 text-gray-400" />
                                </button>
                                <div className="absolute right-0 mt-2 w-40 bg-white rounded-xl border border-gray-100 py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                                    <button onClick={() => setSortBy('recent')} className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${sortBy === 'recent' ? 'text-orange-600 bg-orange-50' : 'text-gray-600 hover:bg-gray-50'}`}>Most Recent</button>
                                    <button onClick={() => setSortBy('oldest')} className={`w-full text-left px-4 py-2 text-xs font-bold transition-colors ${sortBy === 'oldest' ? 'text-orange-600 bg-orange-50' : 'text-gray-600 hover:bg-gray-50'}`}>Oldest First</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-y-auto pr-2" style={{ maxHeight: '800px' }}>
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
                            </div>
                        ) : activeTab === 'jobs' ? (
                            filteredPosts.length === 0 ? (
                                <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                    <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
                                        <Search className="w-8 h-8 text-gray-400" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">No jobs matched your criteria</h3>
                                    <p className="text-gray-500 max-w-sm mx-auto">Adjust filters or search terms.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {filteredPosts.map((post) => (
                                        <UserJobCard key={post.id} recruitment={post} onViewDetails={setSelectedJob} />
                                    ))}
                                </div>
                            )
                        ) : (
                            applications.length === 0 ? (
                                <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                    <div className="bg-orange-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <History className="w-8 h-8 text-orange-500" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">No applications yet</h3>
                                    <p className="text-gray-500 max-w-sm mx-auto mb-6">You haven't applied for any jobs yet.</p>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
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
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsFilterDrawerOpen(false)} />
                    <div className="absolute right-0 top-0 bottom-0 w-[280px] bg-white border-l border-gray-200 overflow-y-auto z-[101]">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                            <h3 className="font-bold text-gray-900">Filters</h3>
                            <button onClick={() => setIsFilterDrawerOpen(false)} className="p-2 hover:bg-gray-100 rounded-full"><ChevronDown className="w-5 h-5 rotate-90" /></button>
                        </div>
                        <div className="p-4">
                            <FilterSidebar selectedFilters={selectedFilters} onToggleFilter={toggleFilter} onCompleteProfile={onCompleteProfile} onClearFilters={clearAllFilters} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
