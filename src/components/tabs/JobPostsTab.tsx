import { useState, useEffect } from 'react';
import { collection, getDocs, query as fsQuery, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import type { RecruitmentRequest } from '@/types';
import RecruitmentCard from '@/components/recruitment/RecruitmentCard';
import RecruitmentFormModal from '@/components/recruitment/RecruitmentFormModal';
import RecruitmentDetailView from '@/components/recruitment/RecruitmentDetailView';
import toast from 'react-hot-toast';
import { Search, Plus } from 'lucide-react';

export default function JobPostsTab({ onViewCandidates, initialSelectedPostId, userRole, userId, isPremium }: { onViewCandidates?: (postId: string) => void; initialSelectedPostId?: string | null; userRole?: string | null; userId?: string | null; isPremium?: boolean }) {
    const [recruitmentRequests, setRecruitmentRequests] = useState<RecruitmentRequest[]>([]);
    const [editingPost, setEditingPost] = useState<RecruitmentRequest | null>(null);
    const [selectedPost, setSelectedPost] = useState<RecruitmentRequest | null>(null);
    const [isRecruitmentModalOpen, setIsRecruitmentModalOpen] = useState(false);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [isRestoring, setIsRestoring] = useState(!!initialSelectedPostId);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchRecruitmentRequests = async () => {
        try {
            setLoadingPosts(true);

            const recruitsRef = collection(db, 'recruits');
            let q = fsQuery(recruitsRef, orderBy('createdAt', 'desc'));

            if (userRole && userRole !== 'admin' && userId) {
                // If filtering by recruiterId, remove orderBy to avoid index requirements
                q = fsQuery(recruitsRef, where('recruiterId', '==', userId));
            }

            const querySnapshot = await getDocs(q);

            let recruits = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as any[];

            // Sort manually if we didn't sort in the query
            if (userRole && userRole !== 'admin' && userId) {
                recruits = recruits.sort((a, b) => {
                    const dateA = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate() : (a.createdAt || 0);
                    const dateB = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : (b.createdAt || 0);
                    return Number(dateB) - Number(dateA);
                });
            }

            // 2. Fetch all applications from Supabase to count them
            const { data: apps, error: appsError } = await supabase
                .from('job_applications')
                .select('post_id');

            if (appsError) {
                console.error('Error fetching application counts:', appsError);
            }

            // 3. Map counts
            const counts: Record<string, number> = {};
            apps?.forEach(app => {
                counts[app.post_id] = (counts[app.post_id] || 0) + 1;
            });

            // 4. Combine
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
            toast.error('Failed to fetch recruitment requests');
        } finally {
            setLoadingPosts(false);
        }
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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
            </div>
        );
    }

    // Filter recruitment requests based on search term
    const filteredRecruitmentRequests = recruitmentRequests.filter(post =>
        post.jobTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        post.location?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <>
            {selectedPost ? (
                <RecruitmentDetailView
                    recruitment={selectedPost}
                    onBack={() => setSelectedPost(null)}
                    onViewCandidates={(postId) => {
                        setSelectedPost(null);
                        onViewCandidates?.(postId);
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
                <div className="space-y-6 flex-1 flex flex-col">
                    {/* Header Section */}
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            {/* Title and Count */}
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <h2 className="text-xl font-bold text-gray-900">Job Posts</h2>
                                    <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold border border-gray-200">
                                        {recruitmentRequests.length}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500">Manage and track all recruitment requests and job postings</p>
                            </div>

                            {/* Search and Button Controls */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:flex-1 md:flex-initial md:w-auto">
                                <div className="relative flex-1 sm:w-64 md:w-72">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search className="h-4 w-4 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search posts..."
                                        className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 sm:text-sm transition-all duration-200"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={() => {
                                        if (userRole !== 'admin' && !isPremium && recruitmentRequests.length >= 5) {
                                            toast.error("Get Premium to Post further");
                                            return;
                                        }
                                        setIsRecruitmentModalOpen(true);
                                    }}
                                    disabled={userRole !== 'admin' && !isPremium && recruitmentRequests.length >= 5}
                                    className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold active:scale-95 transition-all whitespace-nowrap ${userRole !== 'admin' && !isPremium && recruitmentRequests.length >= 5
                                        ? 'bg-gray-400 cursor-not-allowed text-white'
                                        : 'bg-orange-gradient text-white hover:shadow-lg hover:shadow-orange-500/20'
                                        }`}
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden sm:inline">{userRole !== 'admin' && !isPremium && recruitmentRequests.length >= 5 ? 'Limit Reached' : 'Add Post'}</span>
                                    <span className="sm:hidden">{userRole !== 'admin' && !isPremium && recruitmentRequests.length >= 5 ? 'Limit Reached' : 'Add Post'}</span>
                                </button>
                            </div>
                        </div>
                        {userRole !== 'admin' && !isPremium && recruitmentRequests.length >= 5 && (
                            <div className="mt-4 p-3 bg-orange-50 border border-orange-100 rounded-lg flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600">
                                        <Plus className="w-4 h-4" />
                                    </div>
                                    <p className="text-sm text-orange-800 font-medium">
                                        You've reached your free limit of 5 posts. <span className="font-bold underline cursor-pointer">Get Premium to Post further</span>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                    {/* Posts Grid */}
                    <div className="flex-1">
                        {loadingPosts ? (
                            <div className="flex justify-center items-center h-64">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
                            </div>
                        ) : filteredRecruitmentRequests.length === 0 ? (
                            <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
                                <p className="text-gray-500">No recruitment requests found.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                                {filteredRecruitmentRequests.map((post) => (
                                    <RecruitmentCard
                                        key={post.id}
                                        recruitment={post}
                                        applicantCount={(post as any).applicantCount}
                                        onClick={() => setSelectedPost(post)}
                                        onEdit={() => {
                                            setEditingPost(post);
                                            setIsRecruitmentModalOpen(true);
                                        }}
                                        onDelete={fetchRecruitmentRequests}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modals */}
            <RecruitmentFormModal
                isOpen={isRecruitmentModalOpen}
                onClose={() => {
                    setIsRecruitmentModalOpen(false);
                    setEditingPost(null);
                    fetchRecruitmentRequests();
                }}
                initialData={editingPost}
            />
        </>
    );
}
