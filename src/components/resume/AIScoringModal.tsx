import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RecruitmentRequest } from '@/types';
import { X, Sparkles } from 'lucide-react';

interface AIScoringModalProps {
    onClose: () => void;
    onSelectJob: (job: RecruitmentRequest) => void;
    isLoading?: boolean;
}

export default function AIScoringModal({ onClose, onSelectJob, isLoading }: AIScoringModalProps) {
    const [jobs, setJobs] = useState<RecruitmentRequest[]>([]);
    const [loadingJobs, setLoadingJobs] = useState(true);

    useEffect(() => {
        const fetchJobs = async () => {
            try {
                const q = query(collection(db, 'recruits'), orderBy('createdAt', 'desc'));
                const snapshot = await getDocs(q);
                const fetchedJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecruitmentRequest));
                setJobs(fetchedJobs);
            } catch (error) {
                console.error('Error fetching jobs:', error);
            } finally {
                setLoadingJobs(false);
            }
        };
        fetchJobs();
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-orange-600" />
                        AI Scoring
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4">
                    <p className="text-sm text-gray-600 mb-4">
                        Select a job position to evaluate this candidate against. The AI will analyze the resume and provide a relevance score.
                    </p>

                    {loadingJobs ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                            {jobs.length === 0 ? (
                                <p className="text-center text-gray-500 py-4">No active job posts found.</p>
                            ) : (
                                jobs.map((job) => (
                                    <button
                                        key={job.id}
                                        onClick={() => onSelectJob(job)}
                                        disabled={isLoading}
                                        className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-orange-300 hover:bg-orange-50 transition-all group"
                                    >
                                        <div className="font-medium text-gray-900 group-hover:text-orange-700">{job.jobTitle}</div>
                                        <div className="text-xs text-gray-500 mt-1">{job.department}</div>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
