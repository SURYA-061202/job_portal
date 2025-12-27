import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
import { supabase } from '@/lib/supabase';
import type { RecruitmentRequest } from '@/types';
import UserHeader from '@/components/layout/UserHeader';
import RecruitmentCard from '@/components/recruitment/RecruitmentCard';
import { Search, Loader2, History } from 'lucide-react';
import toast from 'react-hot-toast';
import RecruitmentDetailsModal from '@/components/recruitment/RecruitmentDetailsModal';

export default function UserDashboard() {
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
    const [applications, setApplications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'jobs' | 'applications'>('jobs');
    const [selectedJob, setSelectedJob] = useState<RecruitmentRequest | null>(null);
    const [applicantCounts, setApplicantCounts] = useState<Record<string, number>>({});

    const navigate = useNavigate();
    const location = useLocation();

    // Sync state with URL
    useEffect(() => {
        if (location.pathname === '/my-applications') {
            setActiveTab('applications');
        } else {
            setActiveTab('jobs');
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

    const searchLower = searchTerm.toLowerCase();

    // Filter posts
    // Filter posts: Match search AND exclude applied posts
    const filteredPosts = posts.filter(post => {
        const matchesSearch =
            post.jobTitle.toLowerCase().includes(searchLower) ||
            post.department.toLowerCase().includes(searchLower) ||
            post.skills.toLowerCase().includes(searchLower);

        // Exclude if this post ID exists in the user's applications
        const isApplied = applications.some(app => app.post_id === post.id);

        return matchesSearch && !isApplied;
    });

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <UserHeader />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">

                {/* Search Bar - Centered Version */}
                <div className="flex justify-center mb-10">
                    <div className="relative w-full max-w-xl">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search by job title, department, or skills..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all outline-none text-gray-700 shadow-sm"
                        />
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredPosts.map((post) => (
                                <RecruitmentCard
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {applications.map((app) => (
                                <RecruitmentCard
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

                {selectedJob && (
                    <RecruitmentDetailsModal
                        recruitment={selectedJob}
                        onClose={() => setSelectedJob(null)}
                        onApplied={() => {
                            setSelectedJob(null);
                            setActiveTab('applications');
                            fetchApplications();
                        }}
                        onDelete={() => {
                            fetchPosts();
                            setSelectedJob(null);
                        }}
                    />
                )}
            </main>

            {/* Simple Footer */}
            <footer className="bg-white border-t border-gray-200 py-8">
                <div className="max-w-7xl mx-auto px-4 text-center">
                    <p className="text-gray-500 text-sm">© 2025 Job Portal. All rights reserved.</p>
                </div>
            </footer>
        </div>
    );
}
