import { useState, useEffect } from 'react';
import { Users, CheckCircle2, Loader2, Send, FileText, ChevronLeft, Edit, Trash2, Share2 } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { hasUserApplied, applyForJob, getApplicationStatus } from '@/lib/jobApplications';
import { getApplicationStatusInfo } from '@/lib/applicationStatus';
import toast from 'react-hot-toast';
import type { RecruitmentRequest } from '@/types';
import { getPostRounds } from '@/lib/interviewRounds';
import ShareJobModal from './ShareJobModal';
import { usePopup } from '@/components/ui/Popup';

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
    const [deleting, setDeleting] = useState(false);
    const [checkingProfile, setCheckingProfile] = useState(true);
    const [hasApplied, setHasApplied] = useState(false);
    const [applicationStatus, setApplicationStatus] = useState<string | null>(null);
    const [userProfile, setUserProfile] = useState<any>(null);
    const [isManager, setIsManager] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const { showSuccess, showError } = usePopup();

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

                if (userData.role === 'manager' || userData.role === 'recruiter' || userData.role === 'admin') {
                    setIsManager(true);
                }
            }

            // Check if already applied (only for candidates)
            const applied = await hasUserApplied(recruitment.id!, user.uid);
            if (applied) {
                setHasApplied(true);
                const status = await getApplicationStatus(recruitment.id!, user.uid);
                setApplicationStatus(status);
            }

        } catch (err) {
            console.error('Error checking status:', err);
        } finally {
            setCheckingProfile(false);
        }
    };

    const handleDelete = async () => {
        if (!recruitment.id) return;
        setDeleting(true);
        try {
            await deleteDoc(doc(db, 'recruits', recruitment.id));
            showSuccess('Recruitment post deleted successfully');
            onDelete?.(recruitment.id);
            onBack();
        } catch (err: any) {
            console.error('Delete error:', err);
            showError(`Failed to delete: ${err.message}`);
        } finally {
            setDeleting(false);
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

        const userSkills = userProfile?.skillItems || userProfile?.skills;
        if ((!userSkills || (Array.isArray(userSkills) ? userSkills.length === 0 : !userSkills.trim())) && recruitment.skills) {
            toast.error('Profile Incomplete: Please add your skills to your profile before applying.');
            return;
        }

        setActionLoading(true);
        try {
            const result = await applyForJob(recruitment.id, user.uid);

            if (!result.success) {
                toast.error(result.error || 'You have already applied for this position.');
                setHasApplied(true);
                const status = await getApplicationStatus(recruitment.id, user.uid);
                setApplicationStatus(status);
            } else {
                toast.success('Successfully applied!');
                setHasApplied(true);
                setApplicationStatus('applied');
            }
        } catch (err: any) {
            console.error('Apply error:', err);
            toast.error(`Failed to apply: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const statusInfo = getApplicationStatusInfo(applicationStatus) ?? { label: 'Applied', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' };

    const rounds = getPostRounds(recruitment);

    return (
        <div className="flex flex-col h-full bg-gray-50/20">
            {/* Header */}
            <div className="bg-surface shrink-0 rounded-xl border border-gray-200 mb-4 z-10">
                <div className="px-4 sm:px-6 py-4 sm:py-5 flex items-center gap-3 sm:gap-4">
                    {/* Back Button */}
                    <button
                        onClick={onBack}
                        className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-surface border border-gray-200 text-gray-500 hover:text-brand hover:border-brand/30 hover:bg-brand/10 rounded-xl transition-all group flex-shrink-0"
                        title="Go Back"
                    >
                        <ChevronLeft className="w-4.5 h-4.5 group-hover:-translate-x-0.5 transition-transform" />
                    </button>

                    {/* Title + Share */}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                        <h1 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight leading-none truncate">
                            {recruitment.jobTitle}
                        </h1>
                        <button
                            onClick={() => setShowShareModal(true)}
                            className="p-1.5 rounded-full transition-all bg-brand text-white hover:shadow-lg hover:shadow-brand/30 hover:scale-110 active:scale-95 flex-shrink-0"
                            title="Share job"
                        >
                            <Share2 className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                        {isManager ? (
                            <>
                                <button
                                    onClick={() => onEdit?.(recruitment)}
                                    className="p-2 text-brand hover:bg-brand/10 rounded-lg transition-all"
                                    title="Edit Post"
                                >
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                                    title="Delete Post"
                                >
                                    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                </button>
                                <button
                                    onClick={() => onViewCandidates?.(recruitment.id!)}
                                    className="flex items-center gap-2 px-4 py-2 bg-brand text-white text-xs font-bold rounded-lg"
                                >
                                    <Users className="w-4 h-4" />
                                    <span>Candidates</span>
                                </button>
                            </>
                        ) : !hasApplied && !checkingProfile ? (
                            <button
                                onClick={handleApply}
                                disabled={actionLoading}
                                className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-brand text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg shadow-brand/20 hover:shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50"
                            >
                                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Apply Now <Send className="w-3.5 h-3.5" /></>}
                            </button>
                        ) : !isManager && hasApplied ? (
                            <div className={`px-4 py-2 text-xs font-bold rounded-xl border flex items-center gap-2 ${statusInfo.className}`}>
                                <CheckCircle2 className="w-4 h-4" />
                                {statusInfo.label}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto w-full pb-4">
                <div className="px-4 sm:px-6 py-8 sm:py-10 space-y-8 sm:space-y-10 bg-surface rounded-xl shadow-sm border border-gray-200 min-h-full">

                    {/* Key Info Row */}
                    <div className={`grid gap-3 sm:gap-4 ${isManager && (recruitment as any).applicantCount !== undefined ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
                        <InfoItem label="Location" value={recruitment.location || 'Not specified'} color="border-gray-200 text-gray-900" labelColor="text-gray-500" />
                        {recruitment.modeOfWork && <InfoItem label="Mode of Work" value={recruitment.modeOfWork} color="border-gray-200 text-gray-900" labelColor="text-gray-500" />}
                        <InfoItem label="Priority" value={`${recruitment.urgencyLevel} Priority`} color="border-gray-200 text-gray-900" labelColor="text-gray-500" />
                        <InfoItem label="Experience" value={`${recruitment.yearsExperience} Years`} color="border-gray-200 text-gray-900" labelColor="text-gray-500" />
                        <InfoItem label="Salary" value={recruitment.budgetPay} color="border-gray-200 text-gray-900" labelColor="text-gray-500" />
                        <InfoItem label="Job Type" value={recruitment.candidateType || 'Full Time'} color="border-gray-200 text-gray-900" labelColor="text-gray-500" />
                        <InfoItem label="Openings" value={recruitment.candidatesCount ? `${recruitment.candidatesCount}` : 'Not specified'} color="border-gray-200 text-gray-900" labelColor="text-gray-500" />
                        {isManager && (recruitment as any).applicantCount !== undefined && (
                            <InfoItem label="Applicants" value={`${(recruitment as any).applicantCount}`} color="border-gray-200 text-gray-900" labelColor="text-gray-500" />
                        )}
                    </div>

                    {/* Requirements Section */}
                    <div className="p-6 sm:p-8 border border-gray-100 rounded-2xl space-y-4">
                        <h3 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-3">Requirements</h3>
                        <p className="text-gray-600 leading-relaxed text-sm sm:text-base">
                            Candidates should have a <span className="font-semibold text-gray-900 underline decoration-brand/30 decoration-2">{recruitment.qualification}</span> qualification and be from the <span className="font-semibold text-gray-900 underline decoration-brand/30 decoration-2">{recruitment.department}</span> department.
                        </p>
                    </div>

                    {/* Description Section */}
                    <div className="p-6 sm:p-8 border border-gray-100 rounded-2xl space-y-4">
                        <h3 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-3">Job Description</h3>
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
                                <p className="text-gray-500">No detailed description provided.</p>
                            )}

                            {recruitment.jdUrl && (
                                <div className="pt-6 border-t border-gray-200">
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

                    {/* Interview Rounds Section */}
                    <div className="p-6 sm:p-8 border border-gray-100 rounded-2xl space-y-4">
                        <h3 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-3">Interview Rounds</h3>
                        {rounds.length === 0 ? (
                            <p className="text-gray-500 italic">No interview rounds for this post.</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {rounds.map(round => (
                                    <div key={round.roundNumber} className="flex items-center gap-3 p-3 rounded-xl border border-gray-200">
                                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 text-brand border border-brand/20 flex items-center justify-center text-xs font-bold">
                                            {round.roundNumber}
                                        </span>
                                        <div className="min-w-0">
                                            <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400">Round {round.roundNumber}</span>
                                            <span className="block text-sm font-bold text-gray-900 break-words">{round.name || 'Not named'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Skills Section */}
                    <div className="p-6 sm:p-8 border border-gray-100 rounded-2xl space-y-4">
                        <h3 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-3">Required Skills</h3>
                        <div className="flex flex-wrap gap-2.5">
                            {recruitment.skills ? recruitment.skills.split(',').map((skill, i) => (
                                <span
                                    key={i}
                                    className="px-4 py-2 rounded-xl text-xs font-bold border border-gray-200 text-gray-700 transition-all hover:scale-105 cursor-default"
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
        <div className={`flex flex-col items-center justify-center py-2 px-3 rounded-lg border transition-all ${color || 'bg-surface border-gray-200'}`}>
            <span className={`text-[9px] font-bold uppercase tracking-wider mb-0.5 text-center ${labelColor || 'text-gray-400'}`}>{label}</span>
            <span className="font-bold break-words text-xs text-gray-900 text-center">{value}</span>
        </div>
    );
}


