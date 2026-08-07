import { useState, useEffect } from 'react';
import { ArrowLeft, Mail, Phone, Building2, Shield, Loader2, CheckCircle, XCircle, Clock, Briefcase, Crown } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { createPremiumApprovedNotification, createPremiumRejectedNotification } from '@/lib/notificationHelper';
import toast from 'react-hot-toast';
import type { PremiumRequestStatus } from '@/types';

interface MemberData {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    department: string;
    role: string;
    companyName?: string;
    premiumRequestStatus?: PremiumRequestStatus;
    premiumRequestedAt?: any;
}

interface Post {
    id: string;
    jobTitle: string;
    department: string;
    location: string;
    createdAt: any;
}

interface MemberDetailContentProps {
    memberId: string | null;
    onBack: () => void;
}

export default function MemberDetailContent({ memberId, onBack }: MemberDetailContentProps) {
    const [member, setMember] = useState<MemberData | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingPosts, setLoadingPosts] = useState(true);
    const [approving, setApproving] = useState(false);
    const [rejecting, setRejecting] = useState(false);
    const [requestStatus, setRequestStatus] = useState<PremiumRequestStatus>('none');

    useEffect(() => {
        if (!memberId) return;
        setLoading(true);
        const fetchMember = async () => {
            try {
                const memberDoc = await getDoc(doc(db, 'users', memberId));
                if (memberDoc.exists()) {
                    const data = memberDoc.data() as MemberData;
                    data.id = memberDoc.id;
                    setMember(data);
                    setRequestStatus(data.premiumRequestStatus || 'none');
                }
            } catch (error) {
                console.error('Error fetching member:', error);
                toast.error('Failed to load member details');
            } finally {
                setLoading(false);
            }
        };
        fetchMember();
    }, [memberId]);

    useEffect(() => {
        if (!memberId) return;
        setLoadingPosts(true);
        const fetchPosts = async () => {
            try {
                const q = query(collection(db, 'recruits'), where('recruiterId', '==', memberId));
                const snapshot = await getDocs(q);
                const postsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Post[];
                postsData.sort((a, b) => {
                    const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : (a.createdAt || 0);
                    const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : (b.createdAt || 0);
                    return Number(dateB) - Number(dateA);
                });
                setPosts(postsData);
            } catch (error) {
                console.error('Error fetching posts:', error);
            } finally {
                setLoadingPosts(false);
            }
        };
        fetchPosts();
    }, [memberId]);

    const handleApprove = async () => {
        const admin = auth.currentUser;
        if (!admin || !member) return;
        setApproving(true);
        try {
            await updateDoc(doc(db, 'users', member.id), {
                isPremium: true,
                premiumRequestStatus: 'approved',
                premiumReviewedAt: serverTimestamp(),
                premiumReviewedBy: admin.uid,
            });
            await createPremiumApprovedNotification(member.email, member.firstName);
            setRequestStatus('approved');
            setMember(prev => prev ? { ...prev, premiumRequestStatus: 'approved', isPremium: true } : prev);
            toast.success(`Premium access approved for ${member.firstName}`);
        } catch (error) {
            console.error('Error approving premium:', error);
            toast.error('Failed to approve premium');
        } finally {
            setApproving(false);
        }
    };

    const handleReject = async () => {
        const admin = auth.currentUser;
        if (!admin || !member) return;
        setRejecting(true);
        try {
            await updateDoc(doc(db, 'users', member.id), {
                premiumRequestStatus: 'rejected',
                premiumReviewedAt: serverTimestamp(),
                premiumReviewedBy: admin.uid,
            });
            await createPremiumRejectedNotification(member.email, member.firstName);
            setRequestStatus('rejected');
            setMember(prev => prev ? { ...prev, premiumRequestStatus: 'rejected' } : prev);
            toast.success(`Premium request rejected for ${member.firstName}`);
        } catch (error) {
            console.error('Error rejecting premium:', error);
            toast.error('Failed to reject premium');
        } finally {
            setRejecting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
        );
    }

    if (!member) {
        return (
            <div className="text-center py-12">
                <p className="text-gray-500">Member not found.</p>
                <button onClick={onBack} className="mt-4 text-primary-600 font-medium hover:underline">Go back</button>
            </div>
        );
    }

    return (
        <div className="space-y-6 flex-1 flex flex-col">
            {/* Back Button */}
            <div className="bg-white p-4 rounded-xl border border-gray-200">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Back to Members
                </button>
            </div>

            {/* Profile Card */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-r from-primary-600 to-orange-500 px-6 py-8">
                    <div className="flex items-center gap-5">
                        <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center text-white font-bold text-3xl">
                            {member.firstName?.[0]}{member.lastName?.[0]}
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">{member.firstName} {member.lastName}</h2>
                            <span className="inline-block text-xs bg-white/20 text-white px-3 py-1 rounded-full font-medium mt-1">
                                {member.role?.toUpperCase()}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="p-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-lg">
                            <Mail className="w-5 h-5 text-gray-400 flex-shrink-0" />
                            <div>
                                <p className="text-xs text-gray-400 font-bold">Email</p>
                                <p className="text-sm text-gray-900 truncate">{member.email}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-lg">
                            <Phone className="w-5 h-5 text-gray-400 flex-shrink-0" />
                            <div>
                                <p className="text-xs text-gray-400 font-bold">Phone</p>
                                <p className="text-sm text-gray-900">{member.mobile || 'N/A'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-lg">
                            <Building2 className="w-5 h-5 text-gray-400 flex-shrink-0" />
                            <div>
                                <p className="text-xs text-gray-400 font-bold">Department</p>
                                <p className="text-sm text-gray-900">{member.department || 'N/A'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-gray-50 px-4 py-3 rounded-lg">
                            <Shield className="w-5 h-5 text-gray-400 flex-shrink-0" />
                            <div>
                                <p className="text-xs text-gray-400 font-bold">Role</p>
                                <p className="text-sm text-gray-900 capitalize">{member.role}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Premium Access Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Crown className="w-5 h-5 text-amber-500" />
                    <h3 className="text-lg font-bold text-gray-900">Premium Access</h3>
                </div>

                {requestStatus === 'pending' ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                        <div className="flex items-center justify-between gap-4 mb-2">
                            <div className="flex items-center gap-2">
                                <Clock className="w-5 h-5 text-amber-600 flex-shrink-0" />
                                <p className="text-base font-bold text-amber-800">Premium Request Pending</p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                    onClick={handleApprove}
                                    disabled={approving}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-md hover:bg-green-700 transition-all disabled:opacity-50"
                                >
                                    {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                    Approve
                                </button>
                                <button
                                    onClick={handleReject}
                                    disabled={rejecting}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-md hover:bg-red-700 transition-all disabled:opacity-50"
                                >
                                    {rejecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                    Reject
                                </button>
                            </div>
                        </div>
                        {member.premiumRequestedAt && (
                            <p className="text-sm text-gray-500 ml-7">
                                Requested: {member.premiumRequestedAt?.toDate ? member.premiumRequestedAt.toDate().toLocaleString() : 'Recently'}
                            </p>
                        )}
                    </div>
                ) : requestStatus === 'approved' ? (
                    <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-center gap-4">
                        <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" />
                        <div>
                            <p className="text-base font-bold text-green-800">Premium Active</p>
                            <p className="text-sm text-green-600">This member has premium access and can post unlimited jobs.</p>
                        </div>
                    </div>
                ) : requestStatus === 'rejected' ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-center gap-4">
                        <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                        <div>
                            <p className="text-base font-bold text-red-800">Request Declined</p>
                            <p className="text-sm text-red-600">Premium request was declined. Member is limited to 5 posts.</p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 flex items-center gap-4">
                        <Crown className="w-6 h-6 text-gray-400 flex-shrink-0" />
                        <div>
                            <p className="text-base font-medium text-gray-700">No premium request</p>
                            <p className="text-sm text-gray-500">This member has not requested premium access yet.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Posts Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Briefcase className="w-5 h-5 text-primary-600" />
                        <h3 className="text-lg font-bold text-gray-900">Posted Jobs</h3>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-primary-100 text-primary-700 text-sm font-bold">
                        {posts.length} posts
                    </span>
                </div>

                {loadingPosts ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                    </div>
                ) : posts.length === 0 ? (
                    <div className="bg-gray-50 border border-dashed border-gray-300 rounded-xl p-8 text-center">
                        <Briefcase className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500">No posts yet</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {posts.map(post => (
                            <div key={post.id} className="bg-gray-50 border border-gray-200 rounded-xl p-4 hover:bg-gray-100 transition-colors">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-base font-bold text-gray-900">{post.jobTitle}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-sm text-gray-500">{post.department}</span>
                                            <span className="text-gray-300">|</span>
                                            <span className="text-sm text-gray-500">{post.location}</span>
                                        </div>
                                    </div>
                                    <span className="text-sm text-gray-400 flex-shrink-0 ml-4">
                                        {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
