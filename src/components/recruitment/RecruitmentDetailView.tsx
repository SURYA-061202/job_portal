import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
    Users, CheckCircle2, Loader2, FilePlus2, ChevronLeft, Edit, Trash2, Share2,
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { hasUserApplied, applyForJob, getApplicationStatus } from '@/lib/jobApplications';
import { getApplicationStatusInfo } from '@/lib/applicationStatus';
import popup from '@/components/ui/Popup';
import type { RecruitmentRequest } from '@/types';
import { getPostRounds } from '@/lib/interviewRounds';
import ShareJobModal from './ShareJobModal';
import { usePopup } from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

interface RecruitmentDetailViewProps {
    recruitment: RecruitmentRequest;
    onBack: () => void;
    onViewCandidates?: (postId: string) => void;
    onEdit?: (post: RecruitmentRequest) => void;
    onDelete?: (postId: string) => void;
    /** True on the candidate-facing pages (job detail, jobs list, My
     *  Applications). Those views drop the compensation/opening facts and the
     *  header openings badge, and show Share as a labelled button in the
     *  title row instead. */
    isUserView?: boolean;
}

export default function RecruitmentDetailView({ recruitment: initialData, onBack, onViewCandidates, onEdit, onDelete, isUserView = false }: RecruitmentDetailViewProps) {
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
    const skin = useSkin();

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
            popup.error('Please log in to apply');
            return;
        }

        // TEMPORARILY DISABLED: eligibility checks (experience, skills, etc.)
        // are not enforced while applying - see task note "don't use the
        // condition (temporarily)". Profile completeness is still required so
        // recruiters always receive a reachable candidate.
        if (!userProfile?.firstName || !userProfile?.lastName || !userProfile?.mobile) {
            popup.error('Please complete your profile details before applying.');
            return;
        }

        setActionLoading(true);
        try {
            const result = await applyForJob(recruitment.id, user.uid);

            if (!result.success) {
                popup.error(result.error || 'You have already applied for this position.');
                setHasApplied(true);
                const status = await getApplicationStatus(recruitment.id, user.uid);
                setApplicationStatus(status);
            } else {
                popup.success('Successfully applied!');
                setHasApplied(true);
                setApplicationStatus('applied');
            }
        } catch (err: any) {
            console.error('Apply error:', err);
            popup.error(`Failed to apply: ${err.message}`);
        } finally {
            setActionLoading(false);
        }
    };

    const statusInfo = getApplicationStatusInfo(applicationStatus) ?? { label: 'Applied', className: 'bg-ink/5 text-ink/80 border-ink/20' };

    const rounds = getPostRounds(recruitment);
    const skills = recruitment.skills ? recruitment.skills.split(',').map(s => s.trim()).filter(Boolean) : [];
    // Radius convention: the square skinned chips/tags (department, level,
    // posted, requirements, skills) now get rounded-lg on both views, like
    // the Posts module fields. Count badges and buttons carry it too.
    const r = 'rounded-lg';

    /* Requirements values render as plain emphasis - no border or chip
       chrome on either view. */
    const requirementValue = 'inline-flex items-center font-semibold text-ink';
    /* Panels: grey sections on the common white page, both views. */
    const panelClass = `overflow-hidden border ${skin.edge} ${skin.cardSurface} ${skin.radius}`;
    /* Candidate view reuses the post-card grey: the back button gets a grey
       tile with the button radius, and the skill tags copy the post-card pill
       (padding, size and weight included) so they read identically. */
    const greySurface = isUserView ? `bg-border text-ink ${r}` : null;
    /* Skills tags and interview-round tiles share one grey, both views - the
       same fill the user side uses inside its white body. */
    const greyTag = `${r} bg-border px-2 py-1 text-xs font-medium text-ink/70`;
    const roundPanel = `flex items-center ${skin.radius} p-3 bg-border text-ink`;

    /* At-a-glance facts, rendered as a horizontal strip: label above the bold
       figure, no dividers between cells, swipes on small screens. */
    type Fact = { label: string; value: string };
    const facts: Fact[] = [
        { label: 'Department', value: recruitment.department || 'Not specified' },
        { label: 'Location', value: recruitment.location || 'Not specified' },
    ];
    if (recruitment.modeOfWork) facts.push({ label: 'Work Mode', value: recruitment.modeOfWork });
    facts.push(
        { label: 'Position Level', value: recruitment.positionLevel || 'Not specified' },
        { label: 'Experience', value: `${recruitment.yearsExperience} Years` },
    );
    // Compensation and headcount stay on the recruiter/admin view only.
    if (!isUserView) facts.push({ label: 'Salary', value: recruitment.budgetPay });
    facts.push({ label: 'Job Type', value: recruitment.candidateType || 'Full Time' });
    if (!isUserView) facts.push({ label: 'Openings', value: recruitment.candidatesCount ? `${recruitment.candidatesCount}` : 'Not specified' });
    if (isManager && recruitment.applicantCount !== undefined) {
        facts.push({ label: 'Applicants', value: `${recruitment.applicantCount}` });
    }

    return (
        <div className={`flex flex-col h-full ${skin.canvas}`}>
            {/* Header. On the candidate view there is no header panel and no
                controls row - the back button, title and actions sit straight
                on the page canvas. The recruiter/admin view keeps the
                Posts-tab masthead recipe: hairline edge, surface, radius, wash
                and the controls row. */}
            <div className={`shrink-0 mb-4 z-10 ${isUserView ? '' : `overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash}`}`}>
                {/* Title row */}
                <div className={`flex flex-wrap items-center justify-between gap-3 ${isUserView ? 'py-1' : 'px-4 py-3.5 sm:px-5'}`}>
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            onClick={onBack}
                            className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${greySurface ?? `${skin.iconTile} rounded-lg`} cursor-pointer transition-colors duration-200 hover:bg-ink/10 ${FOCUS}`}
                            title="Go Back"
                            aria-label="Go back to job posts"
                        >
                            <ChevronLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
                        </button>
                        <div className="min-w-0">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <h1 className={`${skin.heading} max-w-full truncate`}>
                                    {recruitment.jobTitle}
                                </h1>
                            </div>
                            {/* Description - starts at the title's left edge. */}
                            {!isUserView && (
                                <p className={`mt-1.5 ${skin.body}`}>
                                    Review the job details, requirements, interview rounds and required skills.
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Actions - candidate view only: Apply / status and the
                        labelled Share. The recruiter/admin actions live on the
                        controls row below the header. */}
                    {isUserView && (
                        <div className="flex shrink-0 items-center gap-2">
                            {!hasApplied && !checkingProfile ? (
                                <button
                                    onClick={handleApply}
                                    disabled={actionLoading}
                                    className={`inline-flex items-center gap-2 sm:px-6 rounded-lg cursor-pointer ${skin.cta} ${skin.ctaLift} ${FOCUS} disabled:opacity-50`}
                                >
                                    {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <>Apply Now <FilePlus2 className="w-4 h-4" aria-hidden="true" /></>}
                                </button>
                            ) : hasApplied ? (
                                <div className={`px-4 py-2 text-xs font-bold rounded-lg border flex items-center gap-2 ${statusInfo.className}`}>
                                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                                    {statusInfo.label}
                                </div>
                            ) : null}
                            <button
                                onClick={() => setShowShareModal(true)}
                                className={`inline-flex h-8 shrink-0 rounded-lg cursor-pointer items-center gap-1.5 bg-ink/70 px-3 text-surface transition-colors duration-200 hover:bg-ink/60 ${FOCUS}`}
                                title="Share job"
                                aria-label="Share this job"
                            >
                                <Share2 className="h-4 w-4" aria-hidden="true" />
                                <span className="text-xs font-bold uppercase tracking-wider">Share</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Controls row below the header - recruiter/admin only: the
                applicants count at the left end, Share / Edit / Delete /
                Candidates at the right end. */}
            {!isUserView && (
                <div className="mb-4 flex shrink-0 flex-wrap items-center justify-between gap-3">
                    <span role="status" aria-atomic="true" className={`inline-flex h-8 min-w-24 shrink-0 items-center justify-center gap-1.5 ${skin.count} rounded-lg`}>
                        {isManager
                            ? `${recruitment.applicantCount ?? 0} ${recruitment.applicantCount === 1 ? 'Applicant' : 'Applicants'}`
                            : `${recruitment.candidatesCount || 0} ${recruitment.candidatesCount === 1 ? 'Opening' : 'Openings'}`}
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            onClick={() => setShowShareModal(true)}
                            className={`inline-flex h-8 items-center gap-1.5 rounded-lg cursor-pointer px-3 ${skin.iconTile} transition-colors duration-200 hover:border-ink/40 hover:text-ink ${FOCUS}`}
                            title="Share job"
                        >
                            <Share2 className="h-4 w-4" aria-hidden="true" />
                            <span className="text-xs font-bold uppercase tracking-wider">Share</span>
                        </button>
                        {isManager ? (
                            <>
                                <button
                                    onClick={() => onEdit?.(recruitment)}
                                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg cursor-pointer px-3 ${skin.iconTile} transition-colors duration-200 hover:border-ink/40 hover:text-ink ${FOCUS}`}
                                    title="Edit Post"
                                >
                                    <Edit className="h-4 w-4" aria-hidden="true" />
                                    <span className="text-xs font-bold uppercase tracking-wider">Edit</span>
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-destructive px-3 text-destructive cursor-pointer transition-colors duration-200 hover:bg-destructive/10 disabled:opacity-50 ${FOCUS}`}
                                    title="Delete Post"
                                >
                                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                                    <span className="text-xs font-bold uppercase tracking-wider">{deleting ? 'Deleting…' : 'Delete'}</span>
                                </button>
                                <button
                                    onClick={() => onViewCandidates?.(recruitment.id!)}
                                    className={`inline-flex items-center gap-2 cursor-pointer rounded-lg ${skin.cta} ${skin.ctaLift} ${FOCUS}`}
                                >
                                    <Users className="w-4 h-4" aria-hidden="true" />
                                    <span>Candidates</span>
                                </button>
                            </>
                        ) : !hasApplied && !checkingProfile ? (
                            <button
                                onClick={handleApply}
                                disabled={actionLoading}
                                className={`inline-flex items-center gap-2 sm:px-6 rounded-lg cursor-pointer ${skin.cta} ${skin.ctaLift} ${FOCUS} disabled:opacity-50`}
                            >
                                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <>Apply Now <FilePlus2 className="w-4 h-4" aria-hidden="true" /></>}
                            </button>
                        ) : hasApplied ? (
                            <div className={`px-4 py-2 text-xs font-bold rounded-lg border flex items-center gap-2 ${statusInfo.className}`}>
                                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                                {statusInfo.label}
                            </div>
                        ) : null}
                    </div>
                </div>
            )}
            {/* Content. The header sits on the page canvas; the white body
                starts below it (both views), with the sections inset a little
                so they read narrower than full bleed. The body's top and
                bottom padding are pinned strips on the panel itself, so they
                stay at the top and bottom of the body bg while the sections
                scroll between them. */}
            <div className={`flex-1 min-h-0 w-full flex flex-col overflow-hidden ${skin.resultsPanel ? `${skin.resultsPanel} ${skin.radius}` : ''}`}>
                <div className="h-6 shrink-0" aria-hidden="true" />
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-3 sm:px-5">
                    <div className="space-y-4 min-h-full">

                    {/* At a glance - this section's own style: uppercase header
                        with a count badge over a full-bleed strip of stat cells,
                        its scrollbar thinned to 6px. No fill of its own and no
                        elevation - the page canvas carries it. */}
                    <div className={panelClass}>
                        <div className="flex items-center gap-3 px-4 pt-3 pb-1 sm:px-6">
                            <h3 className={skin.emptyTitle}>Job Details</h3>
                        </div>
                        <div className="overflow-x-auto scrollbar-hide">
                            <div className="flex snap-x">
                                {facts.map((fact) => (
                                    <div
                                        key={fact.label}
                                        className="flex min-w-[160px] flex-1 snap-start flex-col gap-1 px-4 py-3.5 sm:px-5"
                                    >
                                        <span className={`${skin.meta}`}>{fact.label}</span>
                                        <span className={`${skin.statValue} break-words`}>{fact.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Requirements */}
                    <Section title="Requirements" panelClass={panelClass}>
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm sm:text-base">
                            <span className={skin.body}>Candidates should have a</span>
                            <span className={requirementValue}>{recruitment.qualification}</span>
                            <span className={skin.body}>qualification and be from the</span>
                            <span className={requirementValue}>{recruitment.department}</span>
                            <span className={skin.body}>department.</span>
                        </p>
                    </Section>

                    {/* Job Description */}
                    <Section title="Job Description" panelClass={panelClass}>
                        {recruitment.description ? (
                            <div className="space-y-3">
                                {recruitment.description
                                    .split('\n')
                                    .filter(line => line.trim().length > 0)
                                    .map((line, i) => {
                                        const raw = line.trim();
                                        const isItem = /^[-*•]\s/.test(raw);
                                        return (
                                            <div key={i} className="flex items-start gap-3">
                                                {isItem && <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 bg-brand" />}
                                                <p className={`leading-relaxed ${skin.body}`}>{raw.replace(/^[-*•]\s*/, '')}</p>
                                            </div>
                                        );
                                    })}
                            </div>
                        ) : (
                            <p className={skin.body}>No detailed description provided.</p>
                        )}

                        {recruitment.jdUrl && (
                            <div className={`mt-4 pt-4 border-t ${skin.edge}`}>
                                <a
                                    href={recruitment.jdUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`inline-flex items-center gap-2.5 rounded-lg ${skin.secondary} ${FOCUS}`}
                                >
                                    <span>Download Detailed JD</span>
                                </a>
                            </div>
                        )}
                    </Section>

                    {/* Interview Rounds */}
                    <Section title="Interview Rounds" panelClass={panelClass} count={`${rounds.length} ${rounds.length === 1 ? 'Round' : 'Rounds'}`}>
                        {rounds.length === 0 ? (
                            <p className={skin.body}>No interview rounds for this post.</p>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {rounds.map(round => (
                                    <div key={round.roundNumber} className={roundPanel}>
                                        <div className="min-w-0">
                                            <span className={`block ${skin.micro}`}>Round {round.roundNumber}</span>
                                            <span className={`block break-words ${skin.cardValue}`}>{round.name || 'Not named'}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Section>

                    {/* Required Skills */}
                    <Section title="Required Skills" panelClass={panelClass} count={`${skills.length} ${skills.length === 1 ? 'Skill' : 'Skills'}`}>
                        {skills.length === 0 ? (
                            <p className={skin.body}>No specific skills listed.</p>
                        ) : (
                            <div className="flex flex-wrap gap-1.5">
                                {skills.map((skill, i) => (
                                    <span key={i} className={greyTag}>
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        )}
                    </Section>

                </div>
                </div>
                <div className="h-4 shrink-0" aria-hidden="true" />
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

/** Content panel whose header follows the masthead recipe: uppercase title,
 *  hairline divider, optional inverted count badge. Fill comes from the caller:
 *  a grey panel over the common white page, both views. */
function Section({ title, count, panelClass, children }: { title: string; count?: string; panelClass?: string; children: ReactNode }) {
    const skin = useSkin();
    return (
        <div className={panelClass ?? `overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius}`}>
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1 sm:px-6">
                <h3 className={skin.emptyTitle}>{title}</h3>
                {count && (
                    <span className={`inline-flex shrink-0 items-center gap-1.5 ${skin.count} rounded-lg`}>{count}</span>
                )}
            </div>
            <div className="px-4 pt-1.5 pb-4 sm:px-6 sm:pt-2 sm:pb-5">{children}</div>
        </div>
    );
}


