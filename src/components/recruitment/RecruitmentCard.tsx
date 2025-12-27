import type { RecruitmentRequest } from '@/types';
import { MapPin, Briefcase, Users, Calendar, Clock, DollarSign, GraduationCap, ChevronRight } from 'lucide-react';

interface RecruitmentCardProps {
    recruitment: RecruitmentRequest;
    onViewDetails?: (recruitment: RecruitmentRequest) => void;
    applicantCount?: number;
}

export default function RecruitmentCard({ recruitment, onViewDetails, applicantCount }: RecruitmentCardProps) {
    const formatDate = (date: any) => {
        if (!date) return 'N/A';
        const d = date.toDate ? date.toDate() : new Date(date);
        return d.toLocaleDateString();
    };



    return (
        <div
            onClick={() => onViewDetails?.(recruitment)}
            className="bg-white rounded-xl shadow-sm border border-gray-200 hover:border-orange-500 hover:shadow-md transition-all duration-300 overflow-hidden group cursor-pointer"
        >
            <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-primary-600 transition-colors">
                            {recruitment.jobTitle}
                        </h3>
                    </div>
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-gradient text-white shadow-sm shrink-0 ml-2">
                        {applicantCount ?? recruitment.applicantCount ?? 0} Applicants
                    </span>
                </div>

                <div className="grid grid-cols-2 gap-y-3 gap-x-4 mb-4">
                    <div className="flex items-center text-sm text-gray-600">
                        <MapPin className="w-4 h-4 mr-2 text-blue-500" />
                        <span className="truncate">{recruitment.location}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <Briefcase className="w-4 h-4 mr-2 text-orange-500" />
                        <span className="truncate">{recruitment.candidateType}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <Clock className="w-4 h-4 mr-2 text-gray-400" />
                        <span className="truncate">{recruitment.yearsExperience} Exp</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <Users className="w-4 h-4 mr-2 text-indigo-500" />
                        <span className="truncate">{recruitment.candidatesCount} Required</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <DollarSign className="w-4 h-4 mr-2 text-emerald-500" />
                        <span className="truncate">{recruitment.budgetPay}</span>
                    </div>
                    <div className="flex items-center text-sm text-gray-600">
                        <GraduationCap className="w-4 h-4 mr-2 text-purple-500" />
                        <span className="truncate">{recruitment.qualification}</span>
                    </div>
                </div>

                <div className="pt-4 flex justify-between items-center text-xs font-medium">
                    <div className="flex items-center text-gray-400">
                        <Calendar className="w-3.5 h-3.5 mr-1" />
                        Posted: {formatDate(recruitment.createdAt)}
                    </div>
                    <button
                        onClick={() => onViewDetails?.(recruitment)}
                        className="text-primary-600 hover:text-primary-700 font-bold flex items-center transition-colors"
                    >
                        View Details
                        <ChevronRight className="w-3 h-3 ml-0.5" />
                    </button>
                    {/* <span className="text-gray-400">By: {recruitment.requestedBy}</span> */}
                </div>
            </div>


        </div>
    );
}
