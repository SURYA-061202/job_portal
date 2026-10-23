import { Lock } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';

interface JobLimitNoticeProps {
    /** How many job posts the user's plan shows. */
    limit: number;
    /** How many matching posts are held back. */
    hidden: number;
    planName?: string;
    onViewPlans: () => void;
}

/** Shown under a job list when the user's plan hides some of the posts. */
export default function JobLimitNotice({ limit, hidden, planName, onViewPlans }: JobLimitNoticeProps) {
    const skin = useSkin();
    if (hidden <= 0) return null;
    return (
        <div
            role="status"
            className={`flex flex-wrap items-center justify-between gap-3 border ${skin.edge} bg-muted ${skin.radius} px-4 py-3`}
        >
            <p className={`flex items-center gap-2 ${skin.body}`}>
                <Lock className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                <span>
                    Your {planName || 'Free'} plan shows {limit} job posts. {hidden} more {hidden === 1 ? 'job is' : 'jobs are'} locked.
                </span>
            </p>
            <button type="button" onClick={onViewPlans} className={`cursor-pointer ${skin.cta} ${FOCUS}`}>
                View plans
            </button>
        </div>
    );
}
