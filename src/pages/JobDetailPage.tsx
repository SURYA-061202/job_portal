import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { RecruitmentRequest } from '@/types';
import RecruitmentDetailView from '@/components/recruitment/RecruitmentDetailView';
import UserHeader from '@/components/layout/UserHeader';
import { ContentCardSkeleton } from '@/components/user/SkeletonLoaders';
import { useSkin, FOCUS } from '@/styles/skin';

export default function JobDetailPage() {
    const { jobId } = useParams<{ jobId: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [job, setJob] = useState<RecruitmentRequest | null>(null);
    const [error, setError] = useState<string | null>(null);
    const skin = useSkin();

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (!user) {
                // Not logged in - redirect to home/registration
                navigate('/', { state: { redirectTo: `/job/${jobId}` } });
                return;
            }

            // User is logged in - load the job
            if (!jobId) {
                setError('Invalid job ID');
                setLoading(false);
                return;
            }

            try {
                const jobDoc = await getDoc(doc(db, 'recruits', jobId));

                if (!jobDoc.exists()) {
                    setError('Job not found');
                    setLoading(false);
                    return;
                }

                const jobData = { id: jobDoc.id, ...jobDoc.data() } as RecruitmentRequest;
                setJob(jobData);
                setLoading(false);
            } catch (err) {
                console.error('Error loading job:', err);
                setError('Failed to load job details');
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, [jobId, navigate]);

    if (loading) {
        return (
            <div className={`min-h-screen flex flex-col ${skin.canvas}`}>
                <UserHeader />
                <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4">
                    <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} p-6 space-y-4`}>
                        <div className={`h-7 w-2/3 ${skin.skeleton} animate-pulse rounded-lg`} />
                        <div className="flex flex-wrap gap-3">
                            {[0, 1, 2].map((i) => (
                                <div key={i} className={`h-6 w-24 ${skin.skeleton} animate-pulse rounded-full`} />
                            ))}
                        </div>
                    </div>
                    <ContentCardSkeleton lines={4} />
                    <ContentCardSkeleton lines={3} />
                </main>
            </div>
        );
    }

    if (error || !job) {
        return (
            <div className={`min-h-screen flex flex-col ${skin.canvas}`}>
                <UserHeader />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <h2 className={`${skin.heading} mb-2`}>Job Not Found</h2>
                        <p className={`${skin.body} mb-4`}>{error || 'The job you are looking for does not exist.'}</p>
                        <button
                            onClick={() => navigate('/jobs')}
                            className={`inline-flex items-center gap-2 cursor-pointer ${skin.cta} ${FOCUS}`}
                        >
                            Browse All Jobs
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`min-h-screen flex flex-col ${skin.canvas}`}>
            <UserHeader />
            <RecruitmentDetailView
                recruitment={job}
                onBack={() => navigate(-1)}
            />
        </div>
    );
}
