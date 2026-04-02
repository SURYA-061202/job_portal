import { useState, useEffect } from 'react';
import { MapPin, Users, CheckCircle2, Loader2, Send, FileText, ChevronLeft, Edit, Trash2, Monitor, Share2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';
import type { RecruitmentRequest } from '@/types';
import ShareJobModal from './ShareJobModal';

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
    const [showShareModal, setShowShareModal] = useState(false);

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
        <div className="flex flex-col h-full bg-gray-50/20">
            {/* Header / Hero */}
            <div className="sticky top-0 z-20 py-4 sm:py-6 bg-gray-50/80 backdrop-blur-md">
                <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 flex items-start gap-3 sm:gap-4 md:gap-5">
                    {/* Back Button */}
                    <button
                        onClick={onBack}
                        className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-white border border-gray-200 text-gray-500 hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50 rounded-xl transition-all group shadow-sm flex-shrink-0 mt-1"
                        title="Go Back"
                    >
                        <ChevronLeft className="w-4.5 h-4.5 group-hover:-translate-x-0.5 transition-transform" />
                    </button>

                    <div className="flex-1 min-w-0">
                        {/* Title Row */}
                        <div className="flex items-center gap-2 mb-2 sm:mb-2.5">
                            <h1 className="text-xl sm:text-3xl font-black text-gray-900 tracking-tight leading-none">
                                {recruitment.jobTitle}
                            </h1>
                            <button
                                onClick={() => setShowShareModal(true)}
                                className="p-1.5 rounded-full transition-all bg-gradient-to-r from-orange-500 to-pink-600 text-white hover:shadow-lg hover:shadow-orange-500/30 hover:scale-110 active:scale-95 flex-shrink-0"
                                title="Share job"
                            >
                                <Share2 className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        {/* Metadata Row */}
                        <div className="flex items-center gap-3 sm:gap-5 text-[11px] sm:text-sm text-gray-400 font-bold tracking-tight flex-wrap">
                            <span className="flex items-center gap-1.5 line-clamp-1">
                                <MapPin className="w-3.5 h-3.5 text-gray-300" />
                                <span>{recruitment.location || 'Location not specified'}</span>
                            </span>
                            {recruitment.modeOfWork && (
                                <span className="flex items-center gap-1.5 line-clamp-1">
                                    <Monitor className="w-3.5 h-3.5 text-gray-300" />
                                    <span>{recruitment.modeOfWork}</span>
                                </span>
                            )}
                            <span className="flex items-center gap-1.5 font-black line-clamp-1">
                                <CheckCircle2 className={`w-3.5 h-3.5 ${recruitment.urgencyLevel === 'Immediate' ? 'text-red-400' : recruitment.urgencyLevel === 'Moderate' ? 'text-orange-400' : 'text-emerald-400'}`} />
                                <span className={recruitment.urgencyLevel === 'Immediate' ? 'text-red-500' : recruitment.urgencyLevel === 'Moderate' ? 'text-orange-500' : 'text-emerald-500'}>
                                    {recruitment.urgencyLevel} Priority
                                </span>
                            </span>
                        </div>
                    </div>

                    <div className="flex-shrink-0">
                        {isManager ? (
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
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    title="Delete Post"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => onViewCandidates?.(recruitment.id!)}
                                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-pink-600 text-white text-xs font-bold rounded-lg"
                                >
                                    <Users className="w-4 h-4" />
                                    <span>Candidates</span>
                                </button>
                            </div>
                        ) : !hasApplied && !checkingProfile && (
                            <button
                                onClick={handleApply}
                                disabled={actionLoading}
                                className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-gradient-to-r from-orange-500 to-pink-600 text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg shadow-orange-500/20 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50"
                            >
                                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Apply Now <Send className="w-3.5 h-3.5" /></>}
                            </button>
                        )}
                        {!isManager && hasApplied && (
                            <div className="px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-100 flex items-center gap-2">
                                <CheckCircle2 className="w-4 h-4" />
                                Applied
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto w-full">
                <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-8 sm:space-y-10">

                    {/* Key Info Row */}
                    <div className={`grid gap-3 sm:gap-4 ${isManager && (recruitment as any).applicantCount !== undefined ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
                        <InfoItem label="Experience" value={`${recruitment.yearsExperience} Years`} color="bg-blue-50/50 border-blue-100 text-blue-900" labelColor="text-blue-500" />
                        <InfoItem label="Salary" value={recruitment.budgetPay} color="bg-orange-50/50 border-orange-100 text-orange-900" labelColor="text-orange-500" />
                        <InfoItem label="Job Type" value={recruitment.candidateType || 'Full Time'} color="bg-pink-50/50 border-pink-100 text-pink-900" labelColor="text-pink-500" />
                        <InfoItem label="Openings" value={recruitment.candidatesCount ? `${recruitment.candidatesCount}` : 'Not specified'} color="bg-emerald-50/50 border-emerald-100 text-emerald-900" labelColor="text-emerald-500" />
                        {isManager && (recruitment as any).applicantCount !== undefined && (
                            <InfoItem label="Applicants" value={`${(recruitment as any).applicantCount}`} color="bg-orange-50/50 border-orange-100 text-orange-900" labelColor="text-orange-500" />
                        )}
                    </div>

                    {/* Requirements Section */}
                    <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100/50 shadow-sm transition-all hover:shadow-md space-y-4">
                        <h3 className="text-lg font-bold text-gray-900 border-b border-gray-50 pb-3">Requirements</h3>
                        <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
                            Candidates should have a <span className="font-semibold text-gray-900 underline decoration-orange-500/30 decoration-2">{recruitment.qualification}</span> qualification and be from the <span className="font-semibold text-gray-900 underline decoration-pink-500/30 decoration-2">{recruitment.department}</span> department.
                        </p>
                    </div>

                    {/* Description Section */}
                    <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100/50 shadow-sm transition-all hover:shadow-md space-y-4">
                        <h3 className="text-lg font-bold text-gray-900 border-b border-gray-50 pb-3">Job Description</h3>
                        <div className="space-y-4">
                            {recruitment.description ? (
                                recruitment.description
                                    .split('\n')
                                    .filter(line => line.trim().length > 0)
                                    .map((line, i) => (
                                        <div key={i} className="flex gap-3 items-start text-gray-600">
                                            <p className="leading-relaxed text-sm sm:text-base">{line.trim().replace(/^[-*•]\s*/, '')}</p>
                                        </div>
                                    ))
                            ) : (
                                <p className="text-gray-500 italic">No detailed description provided.</p>
                            )}

                            {recruitment.jdUrl && (
                                <div className="pt-6 border-t border-gray-50">
                                    <a
                                        href={recruitment.jdUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2.5 px-6 py-2.5 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-black transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5"
                                    >
                                        <FileText className="w-4 h-4" />
                                        <span>Download Detailed JD</span>
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Skills Section */}
                    <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-100/50 shadow-sm transition-all hover:shadow-md space-y-4">
                        <h3 className="text-lg font-bold text-gray-900 border-b border-gray-50 pb-3">Required Skills</h3>
                        <div className="flex flex-wrap gap-2.5">
                            {recruitment.skills ? recruitment.skills.split(',').map((skill, i) => (
                                <span
                                    key={i}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold border shadow-sm transition-all hover:scale-105 cursor-default ${getSkillColor(i)}`}
                                >
                                    {skill.trim()}
                                </span>
                            )) : <p className="text-gray-500 italic">No specific skills listed.</p>}
                        </div>
                    </div>

                </div>
            </div>

            {/* Share Modal */}
            {showShareModal && (
                <ShareJobModal
                    jobTitle={recruitment.jobTitle}
                    jobId={recruitment.id || ''}
                    onClose={() => setShowShareModal(false)}
                />
            )}
        </div>
    );
}

function InfoItem({ label, value, color, labelColor }: { label: string, value: string, color?: string, labelColor?: string }) {
    return (
        <div className={`flex flex-col items-center justify-center p-4 rounded-2xl border shadow-sm transition-all hover:shadow-md ${color || 'bg-white border-gray-100'}`}>
            <span className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 text-center ${labelColor || 'text-gray-400'}`}>{label}</span>
            <span className="font-bold break-words text-sm text-gray-900 text-center">{value}</span>
        </div>
    );
}

