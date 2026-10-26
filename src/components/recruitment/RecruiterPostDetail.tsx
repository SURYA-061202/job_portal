import {
    ArrowLeft, FileDown, ArrowRight, Building2, MapPin, Laptop, Briefcase,
    Layers, Clock, Wallet, Users, GraduationCap, type LucideIcon,
} from 'lucide-react';
import type { RecruitmentRequest } from '@/types';
import { getPostRounds } from '@/lib/interviewRounds';
import { useSkin, FOCUS } from '@/styles/skin';

interface RecruiterPostDetailProps {
    recruitment: RecruitmentRequest;
    onBack: () => void;
    onViewCandidates: (postId: string) => void;
}

/**
 * Post details for recruiters and admins. No header panel - the top bar
 * already names the section. A square back button before the title, with the applicants
 * button, then the sections one below another: details, about, interview process and skills.
 */
export default function RecruiterPostDetail({ recruitment, onBack, onViewCandidates }: RecruiterPostDetailProps) {
    const skin = useSkin();

    const rounds = getPostRounds(recruitment);
    const skills = recruitment.skills ? recruitment.skills.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const applicants = recruitment.applicantCount ?? 0;

    const card = `border ${skin.edge} bg-surface ${skin.radius}`;
    const na = 'Not specified';

    const facts: { icon: LucideIcon; label: string; value: string }[] = [
        { icon: Building2, label: 'Department', value: recruitment.department || na },
        { icon: MapPin, label: 'Location', value: recruitment.location || na },
        { icon: Laptop, label: 'Work mode', value: recruitment.modeOfWork || na },
        { icon: Briefcase, label: 'Job type', value: recruitment.candidateType || 'Full Time' },
        { icon: Layers, label: 'Position level', value: recruitment.positionLevel || na },
        { icon: Clock, label: 'Experience', value: recruitment.yearsExperience ? `${recruitment.yearsExperience} years` : na },
        { icon: Wallet, label: 'Salary', value: recruitment.budgetPay || na },
        { icon: Users, label: 'Openings', value: recruitment.candidatesCount ? `${recruitment.candidatesCount}` : na },
        { icon: GraduationCap, label: 'Qualification', value: recruitment.qualification || na },
    ];

    return (
        <div className={`flex h-full min-h-0 flex-col ${skin.canvas}`}>
            {/* Title and the applicants action */}
            <div className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label="Back to posts"
                        title="Back to posts"
                        className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border ${skin.edge} bg-surface text-ink/70 shadow-sm transition-colors duration-200 hover:border-ink/40 hover:text-ink ${FOCUS}`}
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <h1 className="min-w-0 text-2xl font-bold leading-tight text-ink sm:text-3xl">{recruitment.jobTitle}</h1>
                </div>
                <button
                    type="button"
                    onClick={() => onViewCandidates(recruitment.id!)}
                    className={`group inline-flex cursor-pointer items-center gap-2 rounded-lg ${skin.cta} ${skin.ctaLift} ${FOCUS}`}
                >
                    <Users className="h-4 w-4" aria-hidden="true" />
                    {applicants} {applicants === 1 ? 'applicant' : 'applicants'}
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
            </div>

            <div className="scrollbar-hide min-h-0 flex-1 overflow-y-auto">
                <div className="space-y-6 pb-6">
                    <div className="space-y-6">
                            <section aria-labelledby="post-details" className={`${card} p-5 sm:p-6`}>
                            <h2 id="post-details" className={skin.cardTitle}>Job details</h2>
                            <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                                {facts.map((f) => (
                                    <div key={f.label} className="flex items-center gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink/5 text-ink/70">
                                            <f.icon className="h-5 w-5" aria-hidden="true" />
                                        </span>
                                        <div className="min-w-0">
                                            <dt className={skin.meta}>{f.label}</dt>
                                            <dd className="break-words text-sm font-semibold text-ink">{f.value}</dd>
                                        </div>
                                    </div>
                                ))}
                            </dl>
                        </section>

                            <section className={`${card} p-5 sm:p-6`}>
                                <h2 className={skin.cardTitle}>About the role</h2>
                                <div className="mt-3 space-y-3">
                                    {recruitment.description ? (
                                        recruitment.description
                                            .split('\n')
                                            .filter((line) => line.trim().length > 0)
                                            .map((line, i) => {
                                                const raw = line.trim();
                                                const isItem = /^[-*•]\s/.test(raw);
                                                return (
                                                    <div key={i} className="flex items-start gap-3">
                                                        {isItem && <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink/60" />}
                                                        <p className={`leading-relaxed ${skin.body}`}>{raw.replace(/^[-*•]\s*/, '')}</p>
                                                    </div>
                                                );
                                            })
                                    ) : (
                                        <p className={skin.body}>No detailed description provided.</p>
                                    )}
                                </div>
                                {recruitment.jdUrl && (
                                    <a
                                        href={recruitment.jdUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={`mt-4 inline-flex items-center gap-2 text-sm font-semibold text-ink underline underline-offset-2 ${FOCUS}`}
                                    >
                                        <FileDown className="h-4 w-4" aria-hidden="true" />
                                        Download detailed JD
                                    </a>
                                )}
                            </section>

                            <section className={`${card} p-5 sm:p-6`}>
                                <div className="flex items-center justify-between gap-3">
                                    <h2 className={skin.cardTitle}>Interview process</h2>
                                    <span className="text-xs font-medium text-ink/50">{rounds.length} {rounds.length === 1 ? 'round' : 'rounds'}</span>
                                </div>
                                {rounds.length === 0 ? (
                                    <p className={`mt-3 ${skin.body}`}>No interview rounds for this post.</p>
                                ) : (
                                    <ol className="mt-4">
                                        {rounds.map((round, i) => (
                                            <li key={round.roundNumber} className="relative flex gap-4 pb-5 last:pb-0">
                                                {i < rounds.length - 1 && <span aria-hidden="true" className="absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px bg-ink/15" />}
                                                <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-surface">
                                                    {round.roundNumber}
                                                </span>
                                                <div className="min-w-0 pt-1">
                                                    <p className="break-words text-sm font-semibold text-ink">{round.name || 'Not named'}</p>
                                                    <p className={skin.meta}>Round {round.roundNumber}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </section>

                            <section className={`${card} p-5 sm:p-6`}>
                                <h2 className={skin.cardTitle}>Required skills</h2>
                                {skills.length === 0 ? (
                                    <p className={`mt-3 ${skin.body}`}>No specific skills listed.</p>
                                ) : (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {skills.map((skill, i) => (
                                            <span key={`${skill}-${i}`} className="rounded-lg bg-ink/5 px-3 py-1 text-xs font-medium text-ink/80">{skill}</span>
                                        ))}
                                    </div>
                                )}
                            </section>
                    </div>
                </div>
            </div>
        </div>
    );
}
