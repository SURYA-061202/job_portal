import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
    Users, CheckCircle2, Loader2, FilePlus2, ChevronLeft, Edit, Trash2, Share2,
    Building2, Award, Clock,
} from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { hasUserApplied, applyForJob, getApplicationStatus } from '@/lib/jobApplications';
import { getApplicationStatusInfo } from '@/lib/applicationStatus';
import toast from 'react-hot-toast';
import type { RecruitmentRequest } from '@/types';
import { getPostRounds } from '@/lib/interviewRounds';
import { timeAgo } from '@/lib/format';
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
            toast.error('Please log in to apply');
            return;
        }

        // TEMPORARILY DISABLED: eligibility checks (experience, skills, etc.)
        // are not enforced while applying - see task note "don't use the
        // condition (temporarily)". Profile completeness is still required so
        // recruiters always receive a reachable candidate.
        if (!userProfile?.firstName || !userProfile?.lastName || !userProfile?.mobile) {
            toast.error('Please complete your profile details before applying.');
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

    const statusInfo = getApplicationStatusInfo(applicationStatus) ?? { label: 'Applied', className: 'bg-ink/5 text-ink/80 border-ink/20' };

    const rounds = getPostRounds(recruitment);
    const skills = recruitment.skills ? recruitment.skills.split(',').map(s => s.trim()).filter(Boolean) : [];
    // Radius convention: the square skinned chips/tags (department, level,
    // posted, requirements, skills) now get rounded-lg on both views, like
    // the Posts module fields. Count badges and buttons carry it too.
    const r = 'rounded-lg';

    /* Candidate view strips the chip chrome from the Requirements values. */
    const requirementValue = isUserView
        ? 'inline-flex items-center font-semibold text-ink'
        : `inline-flex items-center ${skin.chip} ${r}`;
    /* Panels: white body, grey sections on the candidate view. */
    const panelClass = `overflow-hidden border ${skin.edge} ${isUserView ? 'bg-muted' : skin.surface} ${skin.radius}`;
    /* Candidate view reuses the post-card grey: the back button gets a grey
       tile with the button radius, and the skill tags copy the post-card pill
       (padding, size and weight included) so they read identically. */
    const greySurface = isUserView ? `bg-border text-ink ${r}` : null;
    const greyTag = isUserView ? `${r} bg-border px-2 py-1 text-xs font-medium text-ink/70` : null;
    /* Interview round tiles pick up the same grey on the candidate view. */
    const roundPanel = isUserView
        ? `flex items-center ${skin.radius} p-3 bg-border text-ink`
        : `flex items-center border ${skin.edge} ${skin.radius} p-3`;

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
                <div className={`flex flex-wrap items-center justify-between gap-3 ${isUserView ? 'py-1' : `border-b ${skin.edge} px-4 py-3.5 sm:px-5`}`}>
                    <div className="flex min-w-0 items-center gap-3">
                        <button
                            onClick={onBack}
                            className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${greySurface ?? `${skin.iconTile} ${skin.radius}`} cursor-pointer transition-colors duration-200 hover:bg-ink/10 ${FOCUS}`}
                            title="Go Back"
                            aria-label="Go back to job posts"
                        >
                            <ChevronLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
                        </button>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h1 className={`${skin.heading} max-w-full truncate`}>
                                {recruitment.jobTitle}
                            </h1>
                            {/* No openings count is shown in the header on the
                                candidate view - Share sits after Apply instead. */}
                            {!isUserView && (
                                <span role="status" aria-atomic="true" className={`inline-flex shrink-0 items-center gap-1.5 ${skin.count} rounded-lg`}>
                                    <span
                                        aria-hidden="true"
                                        className={`h-1.5 w-1.5 shrink-0 rounded-full animate-pulse motion-reduce:animate-none ${skin.countDot}`}
                                    />
                                    {isManager
                                        ? `${recruitment.applicantCount ?? 0} ${recruitment.applicantCount === 1 ? 'Applicant' : 'Applicants'}`
                                        : `${recruitment.candidatesCount || 0} ${recruitment.candidatesCount === 1 ? 'Opening' : 'Openings'}`}
                                </span>
                            )}
                        </div>
                    </div>

                        {/* Actions - Apply / status first, Share right after it
                            on the candidate view. */}
                        <div className="flex shrink-0 items-center gap-2">
                            {!isUserView && (
                                <button
                                    onClick={() => setShowShareModal(true)}
                                    className={`inline-flex h-8 w-8 items-center justify-center ${skin.iconTile} ${skin.radius} cursor-pointer transition-colors duration-200 hover:border-brand hover:text-brand ${FOCUS}`}
                                    title="Share job"
                                    aria-label="Share this job"
                                >
                                    <Share2 className="h-4 w-4" aria-hidden="true" />
                                </button>
                            )}
                        {isManager ? (
                            <>
                                <button
                                    onClick={() => onEdit?.(recruitment)}
                                    className={`inline-flex h-8 w-8 items-center justify-center ${skin.iconTile} ${skin.radius} cursor-pointer transition-colors duration-200 hover:border-brand hover:text-brand ${FOCUS}`}
                                    title="Edit Post"
                                    aria-label="Edit this job post"
                                >
                                    <Edit className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                    onClick={handleDelete}
                                    disabled={deleting}
                                    className={`inline-flex h-8 w-8 items-center justify-center border border-destructive text-destructive ${skin.radius} cursor-pointer transition-colors duration-200 hover:bg-destructive/10 disabled:opacity-50 ${FOCUS}`}
                                    title="Delete Post"
                                    aria-label="Delete this job post"
                                >
                                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
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
                        ) : !isManager && hasApplied ? (
                            <div className={`px-4 py-2 text-xs font-bold rounded-lg border flex items-center gap-2 ${statusInfo.className}`}>
                                <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                                {statusInfo.label}
                            </div>
                        ) : null}
                        {isUserView && (
                            <button
                                onClick={() => setShowShareModal(true)}
                                className={`inline-flex h-8 shrink-0 rounded-lg cursor-pointer items-center gap-1.5 bg-brand px-3 text-brand-foreground transition-colors duration-200 hover:bg-brand/90 ${FOCUS}`}
                                title="Share job"
                                aria-label="Share this job"
                            >
                                <Share2 className="h-4 w-4" aria-hidden="true" />
                                <span className="text-xs font-bold uppercase tracking-wider">Share</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Controls row - department, level and posting age. Recruiter
                    header only; the candidate view shows the department beside
                    the title instead. */}
                {!isUserView && (
                    <div className={`flex flex-wrap items-center gap-2 sm:gap-3 px-4 py-3 sm:px-5 ${skin.controlsBg}`}>
                        <span className={`inline-flex max-w-full items-center gap-1.5 ${skin.chip} ${r}`}>
                            <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{recruitment.department}</span>
                        </span>
                        <span className={`inline-flex max-w-full items-center gap-1.5 ${skin.chip} ${r}`}>
                            <Award className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{recruitment.positionLevel}</span>
                        </span>
                        <span className={`inline-flex max-w-full items-center gap-1.5 ${skin.chip} ${r}`}>
                            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">Posted {timeAgo(recruitment.createdAt)}</span>
                        </span>
                    </div>
                )}
            </div>
            {/* Content. The candidate view gets a white body that starts below
                the header contents (those sit on the page canvas), with the
                sections inset a little so they read narrower than full bleed. */}
            <div className={`flex-1 overflow-y-auto w-full pb-4 ${isUserView ? `bg-surface ${r}` : ''}`}>
                <div className={`py-6 space-y-4 min-h-full ${isUserView ? 'px-3 sm:px-5' : ''}`}>

                    {/* At a glance - this section's own style: uppercase header
                        with a count badge over a full-bleed strip of stat cells,
                        its scrollbar thinned to 6px. No fill of its own and no
                        elevation - the page canvas carries it. */}
                    <div className={panelClass}>
                        <div className="flex items-center gap-3 px-4 pt-3 pb-1 sm:px-6">
                            <h3 className={skin.emptyTitle}>Job Details</h3>
                        </div>
                        <div className="overflow-x-auto thin-scroll">
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
                                    <span key={i} className={greyTag ?? `${skin.tag} ${r}`}>
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        )}
                    </Section>

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

/** Content panel whose header follows the masthead recipe: uppercase title,
 *  hairline divider, optional inverted count badge. Fill comes from the caller:
 *  the candidate view passes a grey panel over its white body, the
 *  recruiter/admin view keeps the skin surface. */
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


