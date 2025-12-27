'use client';

import { useState, useEffect } from 'react';
import { collection, getDocs, query as fsQuery, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import type { RecruitmentRequest } from '@/types';
import RecruitmentCard from '@/components/recruitment/RecruitmentCard';
import RecruitmentDetailsModal from '@/components/recruitment/RecruitmentDetailsModal';
import RecruitmentFormModal from '@/components/recruitment/RecruitmentFormModal';
import toast from 'react-hot-toast';

export default function JobPostsTab({ onViewCandidates }: { onViewCandidates?: (postId: string) => void }) {
    const [recruitmentRequests, setRecruitmentRequests] = useState<RecruitmentRequest[]>([]);
    const [editingPost, setEditingPost] = useState<RecruitmentRequest | null>(null);
    const [selectedPost, setSelectedPost] = useState<RecruitmentRequest | null>(null);
    const [isRecruitmentModalOpen, setIsRecruitmentModalOpen] = useState(false);
    const [loadingPosts, setLoadingPosts] = useState(false);

    useEffect(() => {
        fetchRecruitmentRequests();
    }, []);

    const fetchRecruitmentRequests = async () => {
        try {
            setLoadingPosts(true);

            // 1. Fetch posts from Firestore
            const recruitsRef = collection(db, 'recruits');
            const q = fsQuery(recruitsRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);

            const recruits = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as any[];

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
        } catch (error) {
            console.error('Error fetching recruitment requests:', error);
            toast.error('Failed to fetch recruitment requests');
        } finally {
            setLoadingPosts(false);
        }
    };

    return (
        <>
            <div className="space-y-6 flex-1 flex flex-col">
                {/* Header with Add Recruitment button */}
                <div className="flex justify-end">
                    <button
                        onClick={() => setIsRecruitmentModalOpen(true)}
                        className="px-4 py-2 bg-orange-gradient text-white rounded-md text-sm font-bold hover:opacity-90 transition-all shadow-md shadow-orange-500/20"
                    >
                        Add Recruitment
                    </button>
                </div>

                {/* Posts Grid */}
                <div className="flex-1">
                    {loadingPosts ? (
                        <div className="flex justify-center items-center h-64">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
                        </div>
                    ) : recruitmentRequests.length === 0 ? (
                        <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
                            <p className="text-gray-500">No recruitment requests found.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {recruitmentRequests.map((post) => (
                                <RecruitmentCard
                                    key={post.id}
                                    recruitment={post}
                                    applicantCount={(post as any).applicantCount}
                                    onViewDetails={(p) => setSelectedPost(p)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

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
            {selectedPost && (
                <RecruitmentDetailsModal
                    recruitment={selectedPost}
                    onClose={() => setSelectedPost(null)}
                    onViewCandidates={onViewCandidates ? (postId) => {
                        setSelectedPost(null);
                        onViewCandidates(postId);
                    } : undefined}
                    onDelete={() => {
                        fetchRecruitmentRequests();
                        setSelectedPost(null);
                    }}
                    onEdit={(post) => {
                        setEditingPost(post);
                        setSelectedPost(null); // Close details modal
                        setIsRecruitmentModalOpen(true); // Open form modal
                    }}
                />
            )}
        </>
    );
}
