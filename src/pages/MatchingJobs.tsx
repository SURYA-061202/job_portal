import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import type { RecruitmentRequest } from '@/types';
import UserHeader from '@/components/layout/UserHeader';
import UserJobCard from '@/components/recruitment/UserJobCard';
import { Award, ChevronLeft, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSkin, FOCUS } from '@/styles/skin';
import { JobListSkeleton } from '@/components/user/SkeletonLoaders';

export default function MatchingJobs() {
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [userData, setUserData] = useState<any>(null);
    const navigate = useNavigate();
    const skin = useSkin();

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                navigate('/', { replace: true });
                return;
            }
            fetchData(user.uid);
        });

        return () => unsubscribe();
    }, [navigate]);

    const fetchData = async (uid: string) => {
        try {
            setLoading(true);
            
            // 1. Fetch User matching scores
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (!userDoc.exists()) {
                toast.error('User profile not found');
                return;
            }
            const uData = userDoc.data();
            setUserData(uData);

            // 2. Fetch all jobs
            const recruitsRef = collection(db, 'recruits');
            const q = query(recruitsRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);

            const allPosts = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as RecruitmentRequest[];

            // 3. Filter jobs with score > 50
            const scores = uData.matchingScores || {};
            const matchedPosts = allPosts.filter(post => (scores[post.id!] || 0) > 50);

            // Sort by score descending
            matchedPosts.sort((a, b) => (scores[b.id!] || 0) - (scores[a.id!] || 0));

            setPosts(matchedPosts);
        } catch (error) {
            console.error('Error fetching matching jobs:', error);
            toast.error('Failed to load matching jobs');
        } finally {
            setLoading(false);
        }
    };

    const handleViewJobDetails = async (job: RecruitmentRequest) => {
        const user = auth.currentUser;
        if (user && job.id) {
            try {
                if (!job.viewedBy?.includes(user.uid)) {
                    await updateDoc(doc(db, 'recruits', job.id), {
                        viewedBy: arrayUnion(user.uid)
                    });
                    
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
        // Navigate to dedicated job detail page
        navigate(`/job/${job.id}`);
    };

    return (
        <div className={`min-h-screen ${skin.canvas} flex flex-col`}>
            <UserHeader />

            <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header Navigation */}
                <div className="mb-8">
                    <button 
                        onClick={() => navigate('/home?tab=profile')}
                        className={`inline-flex items-center gap-2.5 ${skin.secondary} ${FOCUS} group`}
                    >
                        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        Back to Profile
                    </button>
                </div>

                {/* Page Title */}
                <div className="mb-10 text-center sm:text-left">
                    <h1 className={skin.heading}>
                        Your <span className="text-brand">Matching</span> Jobs
                    </h1>
                    <p className="text-ink/60 mt-2 max-w-2xl">
                        We've analyzed your profile and found these roles that perfectly align with your skills and experience.
                    </p>
                </div>

                {loading ? (
                    <JobListSkeleton count={3} />
                ) : posts.length === 0 ? (
                    <div className={`text-center py-20 border border-dashed ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
                        <div className={`${skin.stateIcon} w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4`}>
                            <Award className="w-8 h-8" />
                        </div>
                        <h3 className={`${skin.emptyTitle} mb-2`}>No strong matches yet</h3>
                        <p className={`${skin.body} max-w-sm mx-auto mb-8`}>
                            Complete your profile details or add more skills to find roles tailored to your expertise.
                        </p>
                        <button 
                            onClick={() => navigate('/home?tab=profile')}
                            className={`inline-flex items-center gap-2 cursor-pointer ${skin.cta} ${FOCUS}`}
                        >
                            Update Profile
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        {posts.map((post) => {
                            const score = userData?.matchingScores?.[post.id!] || 0;
                            return (
                                <div key={post.id} className="relative group">
                                    {/* Score Indicator Overlay */}
                                    <div className="absolute top-4 right-4 z-10 hidden md:block">
                                        <div className={`bg-white/80 backdrop-blur-sm border border-brand/20 px-3 py-1.5 ${skin.radius} flex items-center gap-2 shadow-sm`}>
                                            <div className="w-2 h-2 rounded-full bg-brand animate-pulse" />
                                            <span className="text-xs font-bold text-brand">{score}% Match</span>
                                        </div>
                                    </div>

                                    <UserJobCard
                                        recruitment={post}
                                        currentUserId={auth.currentUser?.uid}
                                        onViewDetails={handleViewJobDetails}
                                        hideNewBadge={true}
                                    />
                                    
                                    {/* Mobile Score Badge */}
                                    <div className={`md:hidden mt-2 px-4 py-1.5 bg-brand/10 text-brand ${skin.radius} text-[10px] font-bold border border-brand/20 inline-flex items-center gap-1.5`}>
                                        <Sparkles className="w-3 h-3" />
                                        Tailored Match: {score}%
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
}
