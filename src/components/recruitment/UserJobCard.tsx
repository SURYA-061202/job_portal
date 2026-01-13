import type { RecruitmentRequest } from '@/types';
import { MapPin, Briefcase, Clock, IndianRupee, Bookmark } from 'lucide-react';

interface UserJobCardProps {
    recruitment: RecruitmentRequest;
    onViewDetails?: (recruitment: RecruitmentRequest) => void;
}

export default function UserJobCard({ recruitment, onViewDetails }: UserJobCardProps) {
    const companyName = recruitment.jobTitle || "Indian Infra";

    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-6 flex flex-col md:flex-row gap-4 md:gap-6 hover:border-orange-200 transition-all duration-300 relative group">
            {/* Bookmark Icon */}
            <button className="absolute top-4 right-4 md:top-6 md:right-6 p-2 text-gray-400 hover:text-orange-500 transition-colors">
                <Bookmark className="w-4 h-4 md:w-5 md:h-5" />
            </button>

            {/* Content Section */}
            <div className="flex-1">
                <div className="mb-3">
                    <h3 className="text-base md:text-xl font-bold text-gray-900 mb-0.5 md:mb-1">
                        {recruitment.jobTitle}
                    </h3>

                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-2 md:gap-3 mb-4">
                    <div className="flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 bg-orange-50 text-orange-700 rounded-full text-[9px] md:text-xs font-bold border border-orange-100/50">
                        <MapPin className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {recruitment.location}
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 bg-emerald-50 text-emerald-700 rounded-full text-[9px] md:text-xs font-bold border border-emerald-100/50">
                        <Briefcase className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {recruitment.positionLevel || 'Full Time'}
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 bg-blue-50 text-blue-700 rounded-full text-[9px] md:text-xs font-bold border border-blue-100/50">
                        <Clock className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {recruitment.yearsExperience} Years
                    </div>
                    <div className="flex items-center gap-1 px-2 py-0.5 md:px-3 md:py-1 bg-purple-50 text-purple-700 rounded-full text-[9px] md:text-xs font-bold border border-purple-100/50">
                        <IndianRupee className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {recruitment.budgetPay || 'As per norms'}
                    </div>
                </div>

                {/* Description */}
                <p className="text-gray-400 text-[10px] md:text-sm line-clamp-2 mb-4 leading-relaxed">
                    {recruitment.description || `Join ${companyName} for a rewarding career in ${recruitment.department}. We are looking for talented ${recruitment.jobTitle} professionals with ${recruitment.yearsExperience} years of experience.`}
                </p>

                {/* Skills & Action */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-50 pt-4">
                    <div className="flex flex-wrap gap-1.5">
                        {recruitment.skills?.split(',').slice(0, 3).map((skill, i) => (
                            <span key={i} className="px-2 py-0.5 bg-gray-50 border border-gray-100 text-gray-500 text-[9px] md:text-[10px] font-bold rounded-lg uppercase tracking-wider">
                                {skill.trim()}
                            </span>
                        ))}
                    </div>

                    <button
                        onClick={() => onViewDetails?.(recruitment)}
                        className="w-full sm:w-auto px-4 md:px-6 py-1.5 md:py-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/20 active:scale-95 transition-all text-[10px] md:text-xs"
                    >
                        View
                    </button>
                </div>
            </div>
        </div>
    );
}
