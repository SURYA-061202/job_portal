import type { RecruitmentRequest } from '@/types';
import { Calendar } from 'lucide-react';
import { timeAgo } from '@/lib/format';
import { useSkin, FOCUS } from '@/styles/skin';

interface RecruitmentCardProps {
    recruitment: RecruitmentRequest;
    onClick?: (recruitment: RecruitmentRequest) => void;
    onViewDetails?: (recruitment: RecruitmentRequest) => void;
    onEdit?: () => void;
    onDelete?: () => void;
    applicantCount?: number;
    hideExtraDetails?: boolean;
}

export default function RecruitmentCard({ recruitment, onClick, onViewDetails, applicantCount }: RecruitmentCardProps) {
    const skin = useSkin();
    // Safely handle skills string
    const skills = recruitment.skills ? recruitment.skills.split(',').slice(0, 3) : [];

    const handleClick = () => {
        onClick?.(recruitment);
        onViewDetails?.(recruitment);
    };

    return (
        <div
            onClick={handleClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Open job post: ${recruitment.jobTitle}`}
            className={`group relative border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} cursor-pointer overflow-hidden flex flex-col h-full transition-colors duration-200 ${skin.cardHover} ${FOCUS}`}
        >
            {/* Top Accent Line */}
            <div className={`h-1 w-full bg-brand transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-200`} />

            <div className="p-4 sm:p-6 flex-1 flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-start mb-3 sm:mb-4">
                    <div className="flex-1 pr-2">
                        <div className="flex justify-between items-center gap-4">
                            <h3 className={`${skin.cardTitle} sm:text-xl line-clamp-2 flex-1`}>
                                {recruitment.jobTitle}
                            </h3>
                            {recruitment.positionLevel && (
                                <span className={`flex-shrink-0 inline-flex items-center ${skin.chip}`}>
                                    {recruitment.positionLevel}
                                </span>
                            )}
                        </div>

                        <p className={`${skin.meta} sm:text-sm mt-1`}>
                            {recruitment.department}
                        </p>
                    </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
                    <div className={`flex flex-col p-2 border ${skin.edge} ${skin.canvas} ${skin.radius}`}>
                        <span className={`mb-0.5 ${skin.micro}`}>Experience</span>
                        <div className={`flex items-center break-words ${skin.cardValue}`}>
                            {recruitment.yearsExperience}
                        </div>
                    </div>

                    <div className={`flex flex-col p-2 border ${skin.edge} ${skin.canvas} ${skin.radius}`}>
                        <span className={`mb-0.5 ${skin.micro}`}>Location</span>
                        <div className={`flex items-center break-words ${skin.cardValue}`}>
                            {recruitment.location}
                        </div>
                    </div>
                </div>

                {/* Skills Chips */}
                <div className="mb-4 sm:mb-6 flex-1">
                    <span className={`block mb-2 ${skin.micro}`}>Key Skills</span>
                    <div className="flex flex-wrap gap-1.5">
                        {skills.map((skill, i) => (
                            <span key={i} className={skin.tag}>
                                {skill.trim()}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className={`pt-3 sm:pt-4 mt-auto border-t ${skin.edge} flex items-center justify-between gap-2`}>
                    <div className={`flex items-center ${skin.meta}`}>
                        <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5 text-brand" aria-hidden="true" />
                        {timeAgo(recruitment.createdAt)}
                    </div>
                    {applicantCount !== undefined && (
                        <div className={`flex items-center ${skin.count}`}>
                            {applicantCount} Applicant{applicantCount !== 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
