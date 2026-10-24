import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import popup from '@/components/ui/Popup';
import PostCard from '@/components/recruitment/PostCard';
import type { RecruitmentRequest } from '@/types';
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
    hiringRole?: string;
}

interface MemberDetailContentProps {
    memberId: string | null;
    onBack: () => void;
}

export default function MemberDetailContent({ memberId, onBack }: MemberDetailContentProps) {
    const [member, setMember] = useState<MemberData | null>(null);
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
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
                popup.error('Failed to load member details');
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
                const postsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as RecruitmentRequest[];
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
        <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-4 flex-1 min-h-0 flex flex-col`}>
            {/* Masthead - back control beside the identity, the email under the
                name and starting at the same edge; no line separator and no
                role chip. The back arrow uses the same rounded-lg as buttons. */}
            <div className={`shrink-0 overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash} px-4 py-3.5 sm:px-5`}>
                <div className="flex min-w-0 items-center gap-3">
                    <button
                        onClick={onBack}
                        className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} rounded-lg cursor-pointer transition-colors duration-200 hover:border-ink/40 hover:text-ink ${FOCUS}`}
                        title="Back to members"
                        aria-label="Back to members"
                    >
                        <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
                    </button>
                    <div className="min-w-0">
                        <h2 className={`${skin.heading} max-w-full truncate`}>{member.firstName} {member.lastName}</h2>
                        <p className={`mt-1.5 ${skin.body}`}>
                            {member.email}
                            {member.mobile && (
                                <>
                                    <span className="mx-2 text-ink/40">•</span>
                                    {member.mobile}
                                </>
                            )}
                        </p>
                        {(member.companyName || member.hiringRole) && (
                            <p className={`mt-1 ${skin.body}`}>
                                {member.companyName}
                                {member.companyName && member.hiringRole && <span className="mx-2 text-ink/40">•</span>}
                                {member.hiringRole && `Hiring: ${member.hiringRole}`}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Posts - white results panel with grey PostCards, the same UI and
                contents as the Posts module. */}
            <div className={`flex-1 min-h-0 flex flex-col border ${skin.edge} ${skin.resultsPanel} ${skin.radius} p-3 md:p-4`}>
                <div className="flex shrink-0 items-center justify-between mb-4">
                    <h3 className={skin.cardTitle}>Posted Jobs</h3>
                    <span className={`inline-flex shrink-0 items-center gap-1.5 ${skin.count} rounded-lg`}>
                        {posts.length} posts
                    </span>
                </div>

                {loadingPosts ? (
                    <div className="flex flex-1 items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-brand" />
                    </div>
                ) : posts.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center">
                        <p className={skin.body}>No posts yet</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {posts.map(post => (
                            <PostCard key={post.id} post={post} onOpen={() => {}} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
