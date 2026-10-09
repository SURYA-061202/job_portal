import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { useSkin, FOCUS } from '@/styles/skin';

interface MemberData {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    department: string;
    role: string;
    companyName?: string;
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
    const skin = useSkin();

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

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-brand" />
            </div>
        );
    }

    if (!member) {
        return (
            <div className="text-center py-12">
                <p className={skin.body}>Member not found.</p>
                <button onClick={onBack} className={`mt-4 text-brand font-medium hover:underline ${FOCUS}`}>Go back</button>
            </div>
        );
    }

    return (
        <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-6 flex-1 min-h-0 flex flex-col`}>
            {/* Masthead — same recipe as other detail pages: brand-washed title row
                (back icon button + name + role chip) over an email/phone description row. */}
            <div className={`shrink-0 overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash}`}>
                <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${skin.edge} px-4 py-3.5 sm:px-5`}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <button
                            onClick={onBack}
                            className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} rounded-lg cursor-pointer transition-colors duration-200 hover:border-brand hover:text-brand ${FOCUS}`}
                            title="Back to members"
                            aria-label="Back to members"
                        >
                            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
                        </button>
                        <h2 className={`${skin.heading} max-w-full truncate`}>{member.firstName} {member.lastName}</h2>
                        <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-lg border border-brand/20 bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
                            {member.role?.toUpperCase()}
                        </span>
                    </div>
                </div>
                <div className="px-4 py-2.5 sm:px-5">
                    <p className={skin.body}>
                        {member.email}
                        {member.mobile && (
                            <>
                                <span className="mx-2 text-ink/40">•</span>
                                {member.mobile}
                            </>
                        )}
                    </p>
                </div>
            </div>

            {/* Posts Section */}
            <div className={`flex-1 flex flex-col border ${skin.edge} ${skin.surface} ${skin.radius} p-6`}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className={skin.cardTitle}>Posted Jobs</h3>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 ${skin.count} rounded-lg`}>
                        <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 shrink-0 rounded-full animate-pulse motion-reduce:animate-none ${skin.countDot}`}
                        />
                        {posts.length} posts
                    </span>
                </div>

                {loadingPosts ? (
                    <div className="flex flex-1 items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-brand" />
                    </div>
                ) : posts.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center">
                        <p className={skin.emptyTitle}>No posts yet</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {posts.map(post => (
                            <div key={post.id} className="rounded-lg p-4 hover:bg-ink/5 transition-colors duration-200">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-base font-bold text-ink">{post.jobTitle}</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-sm text-brand">{post.department}</span>
                                            <span className="text-brand/30">|</span>
                                            <span className="text-sm text-brand">{post.location}</span>
                                        </div>
                                    </div>
                                    <span className={`flex-shrink-0 ml-4 ${skin.meta}`}>
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
