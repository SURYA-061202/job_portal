import type { RecruitmentRequest } from '@/types';
import { MapPin, Briefcase, Clock, IndianRupee } from 'lucide-react';
import { getApplicationStatusInfo } from '@/lib/applicationStatus';

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

    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-6 flex flex-col md:flex-row gap-4 md:gap-6 hover:border-gray-300 transition-all duration-300 relative group">
            {/* New Badge */}
            {isNew && (
                <div className="absolute -top-2 -left-2 z-10">
                    <span className="flex h-6 items-center px-2.5 rounded-full bg-gray-900 text-white text-[10px] font-bold shadow-lg shadow-gray-900/20 animate-bounce cursor-default">
                        New
                    </span>
                </div>
            )}

            {/* Content Section */}
            <div className="flex-1">
                <div className="mb-3 flex items-start justify-between gap-2">
                    <h3 className="text-base md:text-xl font-bold text-gray-900">
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
                    <div className="flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 bg-gray-50/50 text-gray-700 rounded-full text-[9px] md:text-xs font-bold border border-gray-100">
                        <MapPin className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {recruitment.location}
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 bg-gray-50/50 text-gray-700 rounded-full text-[9px] md:text-xs font-bold border border-gray-100">
                        <Briefcase className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {recruitment.positionLevel || 'Full Time'}
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 bg-gray-50/50 text-gray-700 rounded-full text-[9px] md:text-xs font-bold border border-gray-100">
                        <Clock className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {recruitment.yearsExperience} Years
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 bg-gray-50/50 text-gray-700 rounded-full text-[9px] md:text-xs font-bold border border-gray-100">
                        <IndianRupee className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {recruitment.budgetPay || 'As per norms'}
                    </div>
                </div>

                {/* Skills & Action */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-50 pt-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] md:text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-1">Skills:</span>
                        {recruitment.skills?.split(',').slice(0, 3).map((skill, i) => (
                            <span key={i} className="px-2 py-0.5 bg-gray-50/50 border border-gray-100 text-gray-500 text-[9px] md:text-[10px] font-bold rounded-lg uppercase tracking-wider">
                                {skill.trim()}
                            </span>
                        ))}
                    </div>

                    <button
                        onClick={() => onViewDetails?.(recruitment)}
                        className="w-full sm:w-auto px-4 md:px-6 py-1.5 md:py-2 bg-brand/10 text-brand border border-brand/30 font-bold rounded-xl hover:bg-brand/20 hover:border-brand/40 active:scale-95 transition-all text-[10px] md:text-xs"
                    >
                        View
                    </button>
                </div>
            </div>
        </div>
    );
}
