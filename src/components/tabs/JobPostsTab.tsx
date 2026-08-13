import { useState, useEffect } from 'react';
import { collection, getDocs, query as fsQuery, orderBy, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getApplicantCounts } from '@/lib/jobApplications';
import type { RecruitmentRequest } from '@/types';
import RecruitmentCard from '@/components/recruitment/RecruitmentCard';
import RecruitmentFormModal from '@/components/recruitment/RecruitmentFormModal';
import RecruitmentDetailView from '@/components/recruitment/RecruitmentDetailView';
import toast from 'react-hot-toast';
import { Search, Plus } from 'lucide-react';

export default function JobPostsTab({ onViewCandidates, initialSelectedPostId, userId }: { onViewCandidates?: (postId: string, postTitle?: string) => void; initialSelectedPostId?: string | null; userRole?: string | null; userId?: string | null; isPremium?: boolean }) {
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

            if (userId) {
                // Every user (recruiter or admin) only sees the posts they created.
                // If filtering by recruiterId, remove orderBy to avoid index requirements
                q = fsQuery(recruitsRef, where('recruiterId', '==', userId));
            }

            const querySnapshot = await getDocs(q);

            let recruits = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as any[];

            // Sort manually if we didn't sort in the query
            if (userId) {
                recruits = recruits.sort((a, b) => {
                    const dateA = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate() : (a.createdAt || 0);
                    const dateB = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : (b.createdAt || 0);
                    return Number(dateB) - Number(dateA);
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
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
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
        <div className="-m-4 md:-m-6 p-4 md:p-6 bg-surface flex-1 min-h-0 flex flex-col overflow-hidden">
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
                    {/* Header Section - static, does not scroll */}
                    <div className="bg-surface p-4 rounded-lg border border-gray-200 mb-6 flex-shrink-0">
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
                                        <Search className="h-4 w-4 text-brand" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search posts..."
                                        className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-400 focus:outline-none focus:bg-surface focus:ring-2 focus:ring-brand/20 focus:border-brand sm:text-sm transition-all duration-200"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <button
                                    onClick={() => setIsRecruitmentModalOpen(true)}
                                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-bold active:scale-95 transition-all whitespace-nowrap bg-brand-gradient text-white hover:shadow-lg hover:shadow-brand/20"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden sm:inline">Add Post</span>
                                    <span className="sm:hidden">Add Post</span>
                                </button>
                            </div>
                        </div>
                    </div>
                    {/* Posts Grid - the only scrollable region. The mb-6 on the header
                        above sits outside this box, so that gap is never scrolled into. */}
                    <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 -mx-1 pb-2">
                        {loadingPosts ? (
                            <div className="flex justify-center items-center h-64">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
                            </div>
                        ) : filteredRecruitmentRequests.length === 0 ? (
                            <div className="text-center py-12 bg-surface rounded-lg border border-dashed border-gray-300">
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
        </div>
    );
}
