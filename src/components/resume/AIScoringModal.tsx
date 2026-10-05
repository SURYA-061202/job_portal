import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { RecruitmentRequest } from '@/types';
import { X, Sparkles } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';

interface AIScoringModalProps {
    onClose: () => void;
    onSelectJob: (job: RecruitmentRequest) => void;
    isLoading?: boolean;
}

export default function AIScoringModal({ onClose, onSelectJob, isLoading }: AIScoringModalProps) {
    const [jobs, setJobs] = useState<RecruitmentRequest[]>([]);
    const [loadingJobs, setLoadingJobs] = useState(true);
    const skin = useSkin();

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
            <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95`}>
                <div className={`flex items-center justify-between p-4 border-b ${skin.edge}`}>
                    <h3 className={`${skin.cardTitle} flex items-center gap-2`}>
                        <Sparkles className="w-5 h-5 text-brand" />
                        AI Scoring
                    </h3>
                    <button
                        onClick={onClose}
                        className={`text-ink/60 hover:text-ink p-1 ${skin.radius} hover:bg-ink/5 transition-colors ${FOCUS}`}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4">
                    <p className="text-sm text-ink/70 mb-4">
                        Select a job position to evaluate this candidate against. The AI will analyze the resume and provide a relevance score.
                    </p>

                    {loadingJobs ? (
                        <div className="flex justify-center py-8">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar">
                            {jobs.length === 0 ? (
                                <p className={`text-center py-4 ${skin.body}`}>No active job posts found.</p>
                            ) : (
                                jobs.map((job) => (
                                    <button
                                        key={job.id}
                                        onClick={() => onSelectJob(job)}
                                        disabled={isLoading}
                                        className={`w-full text-left p-3 ${skin.radius} border ${skin.edge} hover:border-brand/60 hover:bg-brand/10 transition-all group ${FOCUS}`}
                                    >
                                        <div className="font-bold text-ink group-hover:text-brand">{job.jobTitle}</div>
                                        <div className={`mt-1 ${skin.meta}`}>{job.department}</div>
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
