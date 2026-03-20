import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import type { RecruitmentRequest } from '@/types';
import RecruitmentDetailView from '@/components/recruitment/RecruitmentDetailView';
import UserHeader from '@/components/layout/UserHeader';

export default function JobDetailPage() {
    const { jobId } = useParams<{ jobId: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [job, setJob] = useState<RecruitmentRequest | null>(null);
    const [error, setError] = useState<string | null>(null);

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
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin text-orange-600 mx-auto mb-4" />
                    <p className="text-gray-600">Loading job details...</p>
                </div>
            </div>
        );
    }

    if (error || !job) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-50">
                <UserHeader />
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Job Not Found</h2>
                        <p className="text-gray-600 mb-4">{error || 'The job you are looking for does not exist.'}</p>
                        <button
                            onClick={() => navigate('/jobs')}
                            className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                        >
                            Browse All Jobs
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <UserHeader />
            <RecruitmentDetailView
                recruitment={job}
                onBack={() => navigate('/jobs')}
            />
        </div>
    );
}
