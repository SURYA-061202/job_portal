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
        <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} p-4 md:p-6 flex flex-col md:flex-row gap-4 md:gap-6 relative group transition-colors duration-200 ${skin.cardHover}`}>
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
                    <h3 className={`${skin.cardTitle} md:text-xl`}>
                        {recruitment.jobTitle}
                    </h3>
                    {statusInfo && (
                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[9px] md:text-[11px] font-bold border ${statusInfo.className}`}>
                            {statusInfo.label}
                        </span>
                    )}
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2 md:gap-3 mb-4">
                    <div className={`flex items-center gap-1 md:px-3 md:py-1 ${skin.chip}`}>
                        <MapPin className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {recruitment.location}
                    </div>
                    <div className={`flex items-center gap-1 md:px-3 md:py-1 ${skin.chip}`}>
                        <Briefcase className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {recruitment.positionLevel || 'Full Time'}
                    </div>
                    <div className={`flex items-center gap-1 md:px-3 md:py-1 ${skin.chip}`}>
                        <Clock className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {recruitment.yearsExperience} Years
                    </div>
                    <div className={`flex items-center gap-1 md:px-3 md:py-1 ${skin.chip}`}>
                        <IndianRupee className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {recruitment.budgetPay || 'As per norms'}
                    </div>
                </div>

                {/* Skills & Action */}
                <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 border-t ${skin.edge} pt-4`}>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`mr-1 ${skin.micro}`}>Skills:</span>
                        {recruitment.skills?.split(',').slice(0, 3).map((skill, i) => (
                            <span key={i} className={skin.tag}>
                                {skill.trim()}
                            </span>
                        ))}
                    </div>

                    <button
                        onClick={() => onViewDetails?.(recruitment)}
                        className={`w-full sm:w-auto px-4 md:px-6 py-1.5 md:py-2 bg-brand text-brand-foreground font-bold hover:bg-brand/90 active:scale-95 transition-all text-[10px] md:text-xs ${FOCUS}`}
                    >
                        View
                    </button>
                </div>
            </div>
        </div>
    );
}
