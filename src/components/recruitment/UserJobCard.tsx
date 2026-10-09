import type { RecruitmentRequest } from '@/types';
import { MapPin, Briefcase, Clock, IndianRupee } from 'lucide-react';
import { getApplicationStatusInfo } from '@/lib/applicationStatus';
import { useSkin, FOCUS } from '@/styles/skin';

interface UserJobCardProps {
    recruitment: RecruitmentRequest;
    currentUserId?: string;
    onViewDetails?: (recruitment: RecruitmentRequest) => void;
    hideNewBadge?: boolean;
    /** Raw job_applications status (e.g. 'shortlisted', 'round2', 'selected'). Shown as a pill when present. */
    applicationStatus?: string;
}

export default function UserJobCard({ recruitment, currentUserId, onViewDetails, hideNewBadge, applicationStatus }: UserJobCardProps) {
    const isNew = !hideNewBadge && currentUserId && !recruitment.viewedBy?.includes(currentUserId);
    const statusInfo = getApplicationStatusInfo(applicationStatus);
    const skin = useSkin();

    return (
        <div className={`border ${skin.edge} ${skin.canvas} rounded-lg p-4 md:p-6 flex flex-col md:flex-row gap-4 md:gap-6 relative group transition-colors duration-200 ${skin.cardHover}`}>
            {/* New Badge */}
            {isNew && (
                <div className="absolute -top-2 -left-2 z-10">
                    <span className="flex h-6 items-center px-2.5 rounded-full bg-ink text-surface text-[10px] font-bold shadow-lg shadow-ink/20 animate-bounce cursor-default">
                        New
                    </span>
                </div>
            )}

            {/* Content Section */}
            <div className="flex-1">
                <div className="mb-3 flex items-start justify-between gap-2">
                    <h3 className="text-base md:text-xl font-bold leading-tight text-ink transition-colors duration-200">
                        {recruitment.jobTitle}
                    </h3>
                    {statusInfo && (
                        <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[9px] md:text-[11px] font-bold border ${statusInfo.className}`}>
                            {statusInfo.label}
                        </span>
                    )}
                </div>

                {/* Key facts - plain text, no pills */}
                <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3 text-ink/70">
                    <div className="flex items-center gap-1.5 text-xs md:text-sm font-medium">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {recruitment.location}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs md:text-sm font-medium">
                        <Briefcase className="w-3 h-3 shrink-0" />
                        {recruitment.positionLevel || 'Full Time'}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs md:text-sm font-medium">
                        <Clock className="w-3 h-3 shrink-0" />
                        {recruitment.yearsExperience} Years
                    </div>
                    <div className="flex items-center gap-1.5 text-xs md:text-sm font-medium">
                        <IndianRupee className="w-3 h-3 shrink-0" />
                        {recruitment.budgetPay || 'As per norms'}
                    </div>
                </div>

                {/* Job description */}
                {recruitment.description && (
                    <p className="mb-4 text-xs md:text-sm leading-relaxed text-ink/60 line-clamp-2">
                        {recruitment.description}
                    </p>
                )}

                {/* Skills & Action */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`mr-1 ${skin.micro}`}>Skills:</span>
                        {recruitment.skills?.split(',').slice(0, 3).map((skill, i) => (
                            <span key={i} className="rounded-lg bg-border px-2 py-1 text-xs font-medium text-ink/70">
                                {skill.trim()}
                            </span>
                        ))}
                    </div>

                    <button
                        onClick={() => onViewDetails?.(recruitment)}
                        className={`w-full sm:w-auto px-4 md:px-6 py-1.5 md:py-2 bg-ink text-surface border border-ink font-bold rounded-lg hover:bg-ink/85 active:scale-95 transition-all text-[10px] md:text-xs ${FOCUS}`}
                    >
                        View
                    </button>
                </div>
            </div>
        </div>
    );
}
