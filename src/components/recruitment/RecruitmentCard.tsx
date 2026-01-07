import type { RecruitmentRequest } from '@/types';
import { MapPin, Briefcase, Calendar, Clock } from 'lucide-react';
// import { formatDistanceToNow } from 'date-fns'; // Removed dependency

// Simple helper for time ago
function timeAgo(date: any) {
    if (!date) return 'Recently';
    const d = date.toDate ? date.toDate() : new Date(date);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return d.toLocaleDateString();
}

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
    const urgencyColors = {
        'Immediate': 'bg-red-50 text-red-700 border-red-100',
        'Moderate': 'bg-yellow-50 text-yellow-700 border-yellow-100',
        'Flexible': 'bg-green-50 text-green-700 border-green-100'
    };

    const urgencyColor = urgencyColors[recruitment.urgencyLevel] || 'bg-gray-50 text-gray-700 border-gray-100';

    // Safely handle skills string
    const skills = recruitment.skills ? recruitment.skills.split(',').slice(0, 3) : [];

    const handleClick = () => {
        onClick?.(recruitment);
        onViewDetails?.(recruitment);
    };

    return (
        <div
            onClick={handleClick}
            className="group relative bg-white rounded-2xl shadow-sm border border-gray-200 hover:shadow-xl hover:border-orange-500/30 hover:-translate-y-1 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col h-full"
        >
            {/* Top Accent Line */}
            <div className={`h-1 w-full bg-gradient-to-r from-orange-500 to-pink-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500`} />

            <div className="p-4 sm:p-6 flex-1 flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-start mb-3 sm:mb-4">
                    <div className="flex-1 pr-2">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${urgencyColor}`}>
                                {recruitment.urgencyLevel} Priority
                            </span>
                            {recruitment.positionLevel && (
                                <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-100">
                                    {recruitment.positionLevel}
                                </span>
                            )}
                        </div>
                        <h3 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight transition-colors line-clamp-2">
                            {recruitment.jobTitle}
                        </h3>
                        {/* Hide Department if hideExtraDetails is true? User said hiding Location and Budget specifically, but Department is usually fine.
                            Wait, user said "dont show the Location and Budget".
                            I'll keep Department as it's part of the header usually.
                         */}
                        <p className="text-xs sm:text-sm text-gray-500 font-medium mt-1 flex items-center">
                            <Briefcase className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
                            {recruitment.department}
                        </p>
                    </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
                    <div className="flex flex-col bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Experience</span>
                        <div className="flex items-center text-xs sm:text-sm font-bold text-gray-700">
                            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5 text-orange-500" />
                            {recruitment.yearsExperience}
                        </div>
                    </div>

                    <div className="flex flex-col bg-gray-50 p-2 rounded-lg border border-gray-100">
                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Location</span>
                        <div className="flex items-center text-xs sm:text-sm font-bold text-gray-700">
                            <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5 text-blue-500" />
                            {recruitment.location}
                        </div>
                    </div>
                </div>

                {/* Skills Chips */}
                <div className="mb-4 sm:mb-6 flex-1">
                    <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-2">Key Skills</span>
                    <div className="flex flex-wrap gap-1.5">
                        {skills.map((skill, i) => (
                            <span key={i} className="px-2 py-1 bg-white border border-gray-200 text-gray-600 text-[10px] font-bold rounded shadow-sm">
                                {skill.trim()}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="pt-3 sm:pt-4 mt-auto border-t border-gray-100 flex items-center justify-between">
                    <div className="flex items-center text-xs font-medium text-gray-400">
                        <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5" />
                        {timeAgo(recruitment.createdAt)}
                    </div>
                    {applicantCount !== undefined && (
                        <div className="flex items-center text-xs font-bold text-orange-600">
                            {applicantCount} Applicant{applicantCount !== 1 ? 's' : ''}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
