import { useState, useEffect } from 'react';
import { X, MapPin, Briefcase, Clock, Banknote, GraduationCap, Users, CheckCircle2, AlertCircle, Loader2, Send, FileText, Trash2, Bot, Edit } from 'lucide-react';
import type { RecruitmentRequest } from '@/types';
import { supabase } from '@/lib/supabase';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import toast from 'react-hot-toast';

interface RecruitmentDetailsModalProps {
    recruitment: RecruitmentRequest;
    onClose: () => void;
    onApplied?: () => void;
    onViewCandidates?: (postId: string) => void;
    onDelete?: (postId: string) => void;
    onEdit?: (recruitment: RecruitmentRequest) => void;
}

export default function RecruitmentDetailsModal({ recruitment, onClose, onApplied, onViewCandidates, onDelete, onEdit }: RecruitmentDetailsModalProps) {
    const [loading, setLoading] = useState(false);
    const [checkingProfile, setCheckingProfile] = useState(true);
    const [hasApplied, setHasApplied] = useState(false);
    const [userProfile, setUserProfile] = useState<any>(null);

    useEffect(() => {
        checkStatus();
    }, [recruitment.id]);

    const checkStatus = async () => {
        const user = auth.currentUser;
        if (!user) return;

        try {
            // Check if already applied
            const { data } = await supabase
                .from('job_applications')
                .select('*')
                .eq('post_id', recruitment.id)
                .eq('user_id', user.uid)
                .maybeSingle();

            if (data) setHasApplied(true);

            // Fetch user profile for criteria matching
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                setUserProfile(userDoc.data());
            }
        } catch (err) {
            console.error('Error checking status:', err);
        } finally {
            setCheckingProfile(false);
        }
    };

    const handleDelete = async () => {
        if (!recruitment.id) return;
        if (!window.confirm('Are you sure you want to delete this recruitment post? This action cannot be undone.')) return;

        setLoading(true);
        try {
            await deleteDoc(doc(db, 'recruits', recruitment.id));
            toast.success('Recruitment post deleted successfully');
            onClose();
            onDelete?.(recruitment.id);
        } catch (err: any) {
            console.error('Delete error:', err);
            toast.error(`Failed to delete: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const hasNoApplicants = (recruitment.applicantCount === 0 || recruitment.applicantCount === undefined);

    const handleApply = async () => {
        const user = auth.currentUser;
        if (!user) {
            toast.error('Please log in to apply');
            return;
        }

        if (!userProfile?.firstName || !userProfile?.lastName || !userProfile?.mobile) {
            toast.error('Please complete your profile details before applying.');
            return;
        }

        // Specific criteria mismatch popups
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

        setLoading(true);
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
                onApplied?.();
            }
        } catch (err: any) {
            console.error('Apply error:', err);
            toast.error(`Failed to apply: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 duration-500">
                {/* Header - Simple & Sleek */}
                <div className="relative border-b border-gray-100 p-6 flex items-center justify-between bg-white shrink-0">
                    <div className="flex items-baseline gap-2">
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">{recruitment.jobTitle}</h1>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                            {recruitment.applicantCount ?? 0} Applicants
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {onEdit && (
                            <button
                                onClick={() => onEdit(recruitment)}
                                className="p-2 hover:bg-blue-50 rounded-full text-gray-400 hover:text-blue-600 transition-all"
                                title="Edit this post"
                            >
                                <Edit className="w-5 h-5" />
                            </button>
                        )}
                        <button
                            onClick={handleDelete}
                            disabled={loading}
                            title="Delete this post"
                            className="p-2 hover:bg-red-50 rounded-full text-gray-400 hover:text-red-600 transition-all disabled:opacity-50"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 lg:p-10 custom-scrollbar">
                    {/* Metadata Strip - Sleek & Comprehensive */}
                    <div className="flex flex-wrap gap-3 mb-8 pb-8 border-b border-gray-100">
                        <div className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-xs font-bold border border-orange-100">
                            <Briefcase className="w-3.5 h-3.5" />
                            <span className="truncate">{recruitment.department}</span>
                        </div>
                        <div className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold border border-blue-100">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="truncate">{recruitment.location}</span>
                        </div>
                        <div className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs font-medium border border-gray-100">
                            <Clock className="w-3.5 h-3.5" />
                            <span className="truncate">{recruitment.yearsExperience} Exp</span>
                        </div>
                        <div className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold border border-purple-100">
                            <GraduationCap className="w-3.5 h-3.5" />
                            <span className="truncate">{recruitment.qualification}</span>
                        </div>
                        <div className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-100">
                            <Users className="w-3.5 h-3.5" />
                            <span className="truncate">{recruitment.candidatesCount} Openings</span>
                        </div>
                        <div className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-100">
                            <Banknote className="w-3.5 h-3.5" />
                            <span className="truncate">{recruitment.budgetPay}</span>
                        </div>
                    </div>

                    <div className="space-y-10 max-w-3xl">
                        {/* Description */}
                        <section>
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-primary-100 flex items-center justify-center">
                                    <Briefcase className="w-3.5 h-3.5 text-primary-600" />
                                </div>
                                Job Description
                            </h3>
                            <p className="text-gray-600 leading-relaxed whitespace-pre-line text-base">
                                {recruitment.description || 'No detailed description provided.'}
                            </p>
                        </section>

                        {/* Skills */}
                        <section>
                            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                </div>
                                Required Skills
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {recruitment.skills.split(',').map((skill, i) => (
                                    <span key={i} className="px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold border border-gray-200">
                                        {skill.trim()}
                                    </span>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>

                {/* Footer / Action - Tiny & Perfect */}
                <div className="px-8 py-4 bg-white border-t border-gray-100 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 uppercase tracking-wider font-bold">
                        <AlertCircle className="w-3 h-3" />
                        Details shared upon applying
                    </div>

                    <div className="flex items-center gap-3">
                        {recruitment.jdUrl && (
                            <a
                                href={recruitment.jdUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center px-4 py-2 border border-gray-200 bg-white text-gray-600 font-bold text-xs rounded-lg hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
                            >
                                <FileText className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                                Download JD
                            </a>
                        )}

                        {onViewCandidates ? (
                            <>
                                <button
                                    onClick={async () => {
                                        if (!recruitment.id) return;
                                        const confirmRank = window.confirm("This will use AI to process all CVs against the JD. Continue?");
                                        if (!confirmRank) return;
                                        setLoading(true);
                                        try {
                                            // Import dynamically to avoid loading openai on landing pages if not needed
                                            const { rankCandidatesForJob } = await import('@/lib/rankingService');
                                            const res = await rankCandidatesForJob(recruitment.id);
                                            toast.success(`Ranked ${res.count} candidates!`);
                                            onViewCandidates(recruitment.id);
                                        } catch (e: any) {
                                            toast.error(e.message || "Ranking failed");
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    disabled={hasNoApplicants || loading}
                                    className="inline-flex items-center justify-center px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs rounded-lg hover:opacity-95 transition-all shadow-md shadow-purple-500/20 active:scale-95 group disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed mr-2"
                                >
                                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Rank with AI"}
                                    <Bot className="w-3.5 h-3.5 ml-1.5" />
                                </button>
                                <button
                                    onClick={() => recruitment.id && onViewCandidates(recruitment.id)}
                                    disabled={hasNoApplicants}
                                    title={hasNoApplicants ? "No applicants for this post" : ""}
                                    className="inline-flex items-center justify-center px-6 py-2 bg-orange-gradient text-white font-bold text-xs rounded-lg hover:opacity-95 transition-all shadow-md shadow-orange-500/20 active:scale-95 group disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                                >
                                    View Candidates
                                    <Users className="w-3.5 h-3.5 ml-1.5" />
                                </button>
                            </>
                        ) : checkingProfile ? (
                            <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase tracking-wider">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Loading
                            </div>
                        ) : hasApplied ? (
                            <div className="inline-flex items-center px-4 py-2 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-lg border border-emerald-100 shadow-sm">
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                Successfully Applied
                            </div>
                        ) : (
                            <button
                                onClick={handleApply}
                                disabled={loading}
                                className="inline-flex items-center justify-center px-6 py-2 bg-orange-gradient text-white font-bold text-xs rounded-lg hover:opacity-95 transition-all shadow-md shadow-orange-500/20 disabled:opacity-50 active:scale-95 group"
                            >
                                {loading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <>
                                        Apply for this Position
                                        <Send className="w-3.5 h-3.5 ml-1.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
