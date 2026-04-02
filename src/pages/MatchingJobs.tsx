import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import type { RecruitmentRequest } from '@/types';
import UserHeader from '@/components/layout/UserHeader';
import UserJobCard from '@/components/recruitment/UserJobCard';
import { Loader2, Award, ChevronLeft, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

export default function MatchingJobs() {
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [userData, setUserData] = useState<any>(null);
    const navigate = useNavigate();

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
        <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: '"Poppins", sans-serif' }}>
            <UserHeader />

            <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header Navigation */}
                <div className="mb-8">
                    <button 
                        onClick={() => navigate('/home?tab=profile')}
                        className="inline-flex items-center gap-2.5 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:border-orange-200 hover:text-orange-600 hover:bg-orange-50/30 transition-all group shadow-sm"
                    >
                        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        Back to Profile
                    </button>
                </div>

                {/* Page Title */}
                <div className="mb-10 text-center sm:text-left">
                    <h1 className="text-3xl md:text-5xl font-black text-gray-900 tracking-tight leading-tight">
                        Your <span className="text-orange-600">Matching</span> Jobs
                    </h1>
                    <p className="text-gray-500 mt-2 max-w-2xl">
                        We've analyzed your profile and found these roles that perfectly align with your skills and experience.
                    </p>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2rem] border border-gray-100 shadow-sm">
                        <Loader2 className="w-12 h-12 text-orange-500 animate-spin mb-4" />
                        <p className="text-gray-500 font-bold">Analyzing matches...</p>
                    </div>
                ) : posts.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-[2rem] border border-dashed border-gray-300">
                        <div className="bg-gray-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Award className="w-8 h-8 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">No strong matches yet</h3>
                        <p className="text-gray-500 max-w-sm mx-auto mb-8">
                            Complete your profile details or add more skills to find roles tailored to your expertise.
                        </p>
                        <button 
                            onClick={() => navigate('/home?tab=profile')}
                            className="inline-flex items-center px-8 py-3 bg-gray-900 text-white font-bold rounded-2xl hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"
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
                                        <div className="bg-white/80 backdrop-blur-sm border border-emerald-100 px-3 py-1.5 rounded-xl flex items-center gap-2 shadow-sm">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-xs font-bold text-emerald-700">{score}% Match</span>
                                        </div>
                                    </div>

                                    <UserJobCard
                                        recruitment={post}
                                        currentUserId={auth.currentUser?.uid}
                                        onViewDetails={handleViewJobDetails}
                                        hideNewBadge={true}
                                    />
                                    
                                    {/* Mobile Score Badge */}
                                    <div className="md:hidden mt-2 px-4 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-bold border border-emerald-100 inline-flex items-center gap-1.5">
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
