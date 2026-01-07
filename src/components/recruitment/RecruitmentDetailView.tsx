import { useState, useEffect } from 'react';
import { MapPin, Briefcase, Users, CheckCircle2, Loader2, Send, FileText, ChevronLeft, Edit, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import type { RecruitmentRequest } from '@/types';

interface RecruitmentDetailViewProps {
    recruitment: RecruitmentRequest;
    onBack: () => void;
    onViewCandidates?: (postId: string) => void;
    onEdit?: (post: RecruitmentRequest) => void;
    onDelete?: (postId: string) => void;
}

export default function RecruitmentDetailView({ recruitment: initialData, onBack, onViewCandidates, onEdit, onDelete }: RecruitmentDetailViewProps) {
    const [recruitment, setRecruitment] = useState<RecruitmentRequest>(initialData);
    const [actionLoading, setActionLoading] = useState(false);
    const [checkingProfile, setCheckingProfile] = useState(true);
    const [hasApplied, setHasApplied] = useState(false);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);

    useEffect(() => {
        setRecruitment(initialData);
    }, [initialData]);

    useEffect(() => {
        checkStatus();
    }, [recruitment.id]);

    const checkStatus = async () => {
        const user = auth.currentUser;
        if (!user) {
            setCheckingProfile(false);
            return;
        }

        try {
            // Check User Role
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                setUserProfile(userData);

                if (userData.role === 'manager' || userData.role === 'recruiter') {
                    setIsManager(true);
                }
            }

            // Check if already applied (only for candidates)
            const { data } = await supabase
                .from('job_applications')
                .select('*')
                .eq('post_id', recruitment.id)
                .eq('user_id', user.uid)
                .maybeSingle();

            if (data) setHasApplied(true);

        } catch (err) {
            console.error('Error checking status:', err);
        } finally {
            setCheckingProfile(false);
        }
    };

    const handleDelete = async () => {
        if (!recruitment.id) return;
        if (!window.confirm('Are you sure you want to delete this recruitment post? This action cannot be undone.')) return;

        setActionLoading(true);
        try {
            await deleteDoc(doc(db, 'recruits', recruitment.id));
            toast.success('Recruitment post deleted successfully');
            onDelete?.(recruitment.id);
            onBack();
        } catch (err: any) {
            console.error('Delete error:', err);
            toast.error(`Failed to delete: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const handleApply = async () => {
        if (!recruitment.id) return;
        const user = auth.currentUser;
        if (!user) {
            toast.error('Please log in to apply');
            return;
        }

        if (!userProfile?.firstName || !userProfile?.lastName || !userProfile?.mobile) {
            toast.error('Please complete your profile details before applying.');
            return;
        }

        const reqExp = parseInt(recruitment.yearsExperience);
        const userExp = userProfile?.yearsOfExperience ? parseInt(userProfile.yearsOfExperience) : 0;

        if (userExp < reqExp) {
            toast.error(`Experience Mismatch: This position requires ${reqExp} years, but your profile shows ${userExp} years.`);
            return;
        }

        if (recruitment.department && userProfile?.department && recruitment.department !== userProfile.department) {
            toast.error(`Department Mismatch: This job is for ${recruitment.department}, but your profile department is ${userProfile.department}.`);
            return;
        }

        if (!userProfile?.skills && recruitment.skills) {
            toast.error('Profile Incomplete: Please add your skills to your profile before applying.');
            return;
        }

        setActionLoading(true);
        try {
            const { error } = await supabase
                .from('job_applications')
                .insert({
                    post_id: recruitment.id,
                    user_id: user.uid,
                    status: 'applied'
                });

            if (error) {
                if (error.code === '23505') {
                    toast.error('You have already applied for this position.');
                } else {
                    throw error;
                }
            } else {
                toast.success('Successfully applied!');
                setHasApplied(true);
            }
        } catch (err: any) {
            console.error('Apply error:', err);
            toast.error(`Failed to apply: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const getSkillColor = (index: number) => {
        const colors = [
            'bg-blue-50 text-blue-700 border-blue-100',
            'bg-purple-50 text-purple-700 border-purple-100',
            'bg-pink-50 text-pink-700 border-pink-100',
            'bg-orange-50 text-orange-700 border-orange-100',
            'bg-emerald-50 text-emerald-700 border-emerald-100',
            'bg-indigo-50 text-indigo-700 border-indigo-100',
        ];
        return colors[index % colors.length];
    };

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header / Hero */}
            <div className="bg-white border-b border-gray-100 sticky top-0 z-20 px-4 sm:px-6 py-3 sm:py-4">
                <div className="flex flex-col gap-3 sm:gap-4 w-full">
                    {/* Back & Title Row with Actions */}
                    <div className="flex items-start gap-3 sm:gap-5">
                        <button
                            onClick={onBack}
                            className="p-1.5 sm:p-2 rounded-full transition-all text-gray-400 hover:text-orange-600 hover:bg-orange-50 flex-shrink-0 mt-1"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                                <h1 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight tracking-tight truncate">{recruitment.jobTitle}</h1>
                                {!isManager && hasApplied && !checkingProfile && (
                                    <span className="px-2 sm:px-3 py-1 bg-emerald-50 text-emerald-700 text-xs sm:text-sm font-bold rounded-lg border border-emerald-100 flex items-center gap-1.5 shrink-0">
                                        <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                        <span className="hidden sm:inline">Applied</span>
                                        <span className="sm:hidden">✓</span>
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 sm:gap-4 text-xs text-gray-500 mt-1 font-medium flex-wrap">
                                <span className="flex items-center gap-1.5 text-gray-600">
                                    <Briefcase className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400" />
                                    <span className="truncate">{recruitment.department}</span>
                                </span>
                                <span className="w-1 h-1 rounded-full bg-gray-300 hidden sm:block" />
                                <span className="flex items-center gap-1.5 text-gray-600">
                                    <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-gray-400" />
                                    <span className="truncate">{recruitment.location || 'Location not specified'}</span>
                                </span>
                            </div>
                        </div>

                        {/* Action Buttons - Inline with Title */}
                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                            {isManager ? (
                                <>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => onEdit?.(recruitment)}
                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                            title="Edit Post"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={handleDelete}
                                            disabled={actionLoading}
                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                                            title="Delete Post"
                                        >
                                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <div className="h-6 w-px bg-gray-200 hidden sm:block" />
                                    <button
                                        onClick={() => onViewCandidates?.(recruitment.id!)}
                                        disabled={!((recruitment as any).applicantCount > 0)}
                                        className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-600 text-white text-xs sm:text-sm font-bold rounded-lg hover:shadow-lg hover:shadow-orange-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
                                        title={!((recruitment as any).applicantCount > 0) ? "No applicants yet" : "View Candidates"}
                                    >
                                        <Users className="w-4 h-4" />
                                        <span className="hidden sm:inline">View Candidates</span>
                                        <span className="sm:hidden">Candidates</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    {checkingProfile ? (
                                        <button disabled className="px-3 sm:px-5 py-2 bg-gray-100 text-gray-400 text-xs sm:text-sm font-bold rounded-lg flex items-center gap-2">
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            <span className="hidden sm:inline">Checking...</span>
                                        </button>
                                    ) : !hasApplied ? (
                                        <button
                                            onClick={handleApply}
                                            disabled={actionLoading}
                                            className="flex items-center gap-1.5 sm:gap-2 px-4 sm:px-6 py-2 bg-gradient-to-r from-orange-500 to-pink-600 text-white text-xs sm:text-sm font-bold rounded-lg shadow-lg shadow-orange-500/30 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:grayscale"
                                        >
                                            {actionLoading ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <>
                                                    Apply Now
                                                    <Send className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                                </>
                                            )}
                                        </button>
                                    ) : null}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto w-full bg-gray-50/30">
                <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">

                    {/* Key Info Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                        <InfoItem label="Experience" value={`${recruitment.yearsExperience} Years`} color="bg-blue-50/50 border-blue-100 text-blue-900" labelColor="text-blue-500" />
                        <InfoItem label="Qualification" value={recruitment.qualification} color="bg-purple-50/50 border-purple-100 text-purple-900" labelColor="text-purple-500" />
                        <InfoItem label="Salary" value={recruitment.budgetPay} color="bg-orange-50/50 border-orange-100 text-orange-900" labelColor="text-orange-500" />
                        <InfoItem label="Job Type" value={recruitment.candidateType || 'Full Time'} color="bg-pink-50/50 border-pink-100 text-pink-900" labelColor="text-pink-500" />
                        <InfoItem label="Mode of Work" value={recruitment.modeOfWork || 'Office'} color="bg-indigo-50/50 border-indigo-100 text-indigo-900" labelColor="text-indigo-500" />
                        <InfoItem label="Openings" value={recruitment.candidatesCount ? `${recruitment.candidatesCount}` : 'Not specified'} color="bg-emerald-50/50 border-emerald-100 text-emerald-900" labelColor="text-emerald-500" />
                        {(recruitment as any).applicantCount !== undefined && (
                            <InfoItem label="Applicants" value={`${(recruitment as any).applicantCount}`} color="bg-orange-50/50 border-orange-100 text-orange-900" labelColor="text-orange-500" />
                        )}
                    </div>

                    {/* Description Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-gradient-to-br from-orange-100 to-orange-50 rounded-full border border-orange-100/50 shadow-sm">
                                <FileText className="w-4 h-4 text-orange-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Job Description</h3>
                        </div>

                        <div className="bg-white rounded-xl p-6 border border-gray-100/50 shadow-sm">
                            <div className="space-y-3">
                                {recruitment.description ? (
                                    recruitment.description
                                        .split('\n')
                                        .filter(line => line.trim().length > 0)
                                        .map((line, i) => (
                                            <div key={i} className="flex gap-3 items-start text-gray-600">
                                                <span className="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-gray-100 text-gray-900 text-xs font-bold mt-0.5 border border-gray-200">
                                                    {i + 1}
                                                </span>
                                                <p className="leading-relaxed">{line.trim().replace(/^[-*•]\s*/, '')}</p>
                                            </div>
                                        ))
                                ) : (
                                    <p className="text-gray-500 italic">No detailed description provided.</p>
                                )}
                            </div>
                            {recruitment.jdUrl && (
                                <div className="pt-5 mt-5 border-t border-gray-100">
                                    <a
                                        href={recruitment.jdUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black transition-colors shadow-lg shadow-gray-200"
                                    >
                                        <FileText className="w-4 h-4" />
                                        Download Detailed JD
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Skills Section */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-gradient-to-br from-orange-100 to-orange-50 rounded-full border border-orange-100/50 shadow-sm">
                                <CheckCircle2 className="w-4 h-4 text-orange-600" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900">Required Skills</h3>
                        </div>

                        <div className="bg-white rounded-xl p-6 border border-gray-100/50 shadow-sm">
                            <div className="flex flex-wrap gap-2.5">
                                {recruitment.skills ? recruitment.skills.split(',').map((skill, i) => (
                                    <span
                                        key={i}
                                        className={`px-3.5 py-1.5 rounded-lg text-sm font-bold border shadow-sm transition-transform hover:scale-105 cursor-default ${getSkillColor(i)}`}
                                    >
                                        {skill.trim()}
                                    </span>
                                )) : <p className="text-gray-500 italic">No specific skills listed.</p>}
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}

function InfoItem({ label, value, color, labelColor }: { label: string, value: string, color?: string, labelColor?: string }) {
    return (
        <div className={`flex flex-col p-3 rounded-2xl border shadow-sm transition-all hover:shadow-md ${color || 'bg-white border-gray-100'}`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${labelColor || 'text-gray-400'}`}>{label}</span>
            <span className="font-bold break-words text-sm text-gray-900">{value}</span>
        </div>
    );
}
