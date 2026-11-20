import type { RecruitmentRequest } from '@/types';
import { useMemo, Fragment } from 'react';
import { MapPin, Briefcase, Clock, CalendarClock, CalendarDays } from 'lucide-react';
import { getApplicationStatusInfo } from '@/lib/applicationStatus';
import { useSkin, FOCUS } from '@/styles/skin';
import { buildHighlightRegex } from '@/lib/candidateSearch';
import Highlight from '@/components/resume/Highlight';
import SkillsLine from '@/components/ui/SkillsLine';
import PostStatusBadge from '@/components/recruitment/PostStatusBadge';
import PostLifecycleMenu, { type LifecycleAction } from '@/components/recruitment/PostLifecycleMenu';
import { describeClosing, describeExpiry, getPostLifecycle } from '@/lib/postLifecycle';
import { timeAgo } from '@/lib/format';

interface UserJobCardProps {
    recruitment: RecruitmentRequest;
    currentUserId?: string;
    onViewDetails?: (recruitment: RecruitmentRequest) => void;
    hideNewBadge?: boolean;
    /** Raw job_applications status (e.g. 'shortlisted', 'round2', 'selected'). Shown as a pill when present. */
    applicationStatus?: string;
    /** Recruiter side: shows the applicant count in place of an application status. */
    applicantCount?: number;
    /** White card instead of the page grey. */
    whiteCard?: boolean;
    /** Skills as plain comma-separated text instead of grey chips. */
    plainSkills?: boolean;
    /** Skills as one line of plain text; an "…" at its end opens a hover popover with every skill. */
    skillsPopover?: boolean;
    /** Search keywords to highlight in the card text. */
    keywords?: string[];
    onEdit?: (recruitment: RecruitmentRequest) => void;
    onDelete?: (recruitment: RecruitmentRequest) => Promise<void> | void;
    /** Recruiter side: pause / resume / extend / close / repost, with the status and expiry shown on the card. */
    onLifecycle?: (recruitment: RecruitmentRequest, action: LifecycleAction) => void;
    onDuplicate?: (recruitment: RecruitmentRequest) => void;
}

export default function UserJobCard({ recruitment, currentUserId, onViewDetails, hideNewBadge, applicationStatus, applicantCount, whiteCard, plainSkills, skillsPopover, keywords, onEdit, onDelete, onLifecycle, onDuplicate }: UserJobCardProps) {
    const regex = useMemo(() => buildHighlightRegex(keywords ?? []), [keywords]);
    const hl = (t?: string) => <Highlight text={t ?? ''} regex={regex} />;
    const isNew = !hideNewBadge && currentUserId && !recruitment.viewedBy?.includes(currentUserId);
    const statusInfo = getApplicationStatusInfo(applicationStatus);
    const pillInfo = applicantCount !== undefined
        ? { label: `${applicantCount}${recruitment.applicationCap ? `/${recruitment.applicationCap}` : ''} ${applicantCount === 1 && !recruitment.applicationCap ? 'applicant' : 'applicants'}`, className: 'bg-ink/5 text-ink/80 border-ink/20' }
        : statusInfo && statusInfo.className.includes('brand')
            ? { label: statusInfo.label, className: 'bg-ink/5 text-ink/80 border-ink/20' }
            : statusInfo;
    const skin = useSkin();
    // Recruiters always see the status; job seekers only when the post has stopped taking applications
    // (e.g. one they applied to that has since closed).
    const lifecycle = getPostLifecycle(recruitment);
    const showStatus = !!onLifecycle || !lifecycle.open;

    // Skills that match the search come first, so a hit is never hidden past the third chip.
    const shownSkills = plainSkills ? 6 : 3;
    const { skillChips, skillTotal, orderedSkills } = useMemo(() => {
        const all = (recruitment.skills || '').split(',').map(s => s.trim()).filter(Boolean);
        if (!regex) return { skillChips: all.slice(0, shownSkills), skillTotal: all.length, orderedSkills: all };
        const hit = new RegExp(regex.source, 'iu');
        const ordered = [...all.filter(s => hit.test(s)), ...all.filter(s => !hit.test(s))];
        return { skillChips: ordered.slice(0, shownSkills), skillTotal: all.length, orderedSkills: ordered };
    }, [recruitment.skills, regex, shownSkills]);
    // The company is not on the card, so it only appears when the search matched it.
    const companyHit = !!regex && !!recruitment.companyName && new RegExp(regex.source, 'iu').test(recruitment.companyName);

    return (
        <div className={`border ${skin.edge} ${whiteCard ? 'bg-surface' : skin.canvas} rounded-lg p-4 md:p-6 flex flex-col md:flex-row gap-4 md:gap-6 relative group transition-colors duration-200 ${skin.cardHover}`}>
            {/* New Badge */}
            {isNew && (
                <div className="absolute -top-2 -left-2 z-10">
                    <span className="flex h-6 items-center px-2.5 rounded-full bg-ink/70 text-surface text-[10px] font-bold shadow-lg shadow-ink/20 animate-bounce cursor-default">
                        New
                    </span>
                </div>
            )}

            {/* Content Section */}
            <div className="flex-1">
                <div className="mb-3 flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <h3 className="text-base md:text-xl font-bold leading-tight text-ink transition-colors duration-200">
                            {hl(recruitment.jobTitle)}
                        </h3>
                    </div>
                    {/* Right end: the actions button, then status, then the applicant count. */}
                    <div className="flex shrink-0 items-center gap-2">
                        {(onEdit || onDelete || onLifecycle || onDuplicate) && (
                            <PostLifecycleMenu post={recruitment} onAction={onLifecycle} onEdit={onEdit} onDelete={onDelete} onDuplicate={onDuplicate} />
                        )}
                        {showStatus && <PostStatusBadge post={recruitment} className="py-1 md:text-xs" />}
                        {pillInfo && (
                            <span className={`shrink-0 px-2.5 py-1 rounded-lg text-[9px] md:text-[11px] font-bold border ${pillInfo.className}`}>
                                {pillInfo.label}
                            </span>
                        )}
                    </div>
                </div>

                {companyHit && <p className="mb-2 text-xs font-medium text-ink/60 md:text-sm">{hl(recruitment.companyName)}</p>}

                {/* Key facts - plain text, no pills */}
                <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 text-ink/70 md:justify-start md:grid-cols-[11rem_6rem_6.5rem_10.5rem_minmax(0,1fr)]">
                    <div className="flex min-w-0 items-center gap-1.5 text-xs md:text-sm font-medium">
                        <MapPin className="w-3 h-3 shrink-0" />
                        {hl(recruitment.location)}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-xs md:text-sm font-medium">
                        <Briefcase className="w-3 h-3 shrink-0" />
                        {hl(recruitment.positionLevel || 'Full Time')}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-xs md:text-sm font-medium">
                        <Clock className="w-3 h-3 shrink-0" />
                        {recruitment.yearsExperience} Years
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-xs md:text-sm font-medium">
                        <CalendarDays className="w-3 h-3 shrink-0" />
                        Posted {timeAgo(recruitment.postedAt ?? recruitment.createdAt)}
                    </div>
                    {/* Recruiters see the full expiry wording; job seekers see how long they have to apply. */}
                    {/* Always rendered, even when empty, so the columns keep their place. */}
                    <div className={`flex min-w-0 items-center gap-1.5 text-xs md:text-sm font-medium ${lifecycle.expiringSoon ? 'font-bold text-amber-700' : ''}`}>
                        {(onLifecycle ? describeExpiry(recruitment) : describeClosing(recruitment)) && (
                            <>
                                <CalendarClock className="w-3 h-3 shrink-0" />
                                <span className="truncate">{onLifecycle ? describeExpiry(recruitment) : describeClosing(recruitment)}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Job description */}
                {recruitment.description && (
                    <p className="mb-4 text-xs md:text-sm leading-relaxed text-ink/60 line-clamp-2">
                        {hl(recruitment.description)}
                    </p>
                )}

                {/* Skills & Action */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                    {skillsPopover ? (
                        <div className="w-full min-w-0 flex-1">
                            {orderedSkills.length > 0 && (
                                <SkillsLine
                                    skills={orderedSkills}
                                    lines={1}
                                    className=""
                                    textClass="text-xs font-medium leading-5 text-ink/70 md:text-sm"
                                    maskClass={whiteCard ? 'bg-surface' : skin.canvas}
                                    render={hl}
                                />
                            )}
                        </div>
                    ) : (
                    <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`mr-1 ${skin.micro}`}>Skills:</span>
                            {plainSkills ? (
                                <span className="text-xs font-medium text-ink/70 md:text-sm">
                                    {skillChips.map((skill, i) => <Fragment key={i}>{i > 0 && ', '}{hl(skill)}</Fragment>)}
                                    {skillTotal > skillChips.length && <span className="ml-1.5 font-bold text-ink">+{skillTotal - skillChips.length}</span>}
                                </span>
                            ) : skillChips.map((skill, i) => (
                                <span key={i} className="rounded-lg bg-border px-2 py-1 text-xs font-medium text-ink/70">
                                    {hl(skill)}
                                </span>
                            ))}
                        </div>
    
                    )}

                    <button
                        onClick={() => onViewDetails?.(recruitment)}
                        className={`w-full sm:w-auto px-4 md:px-6 py-1.5 md:py-2 bg-ink/70 text-surface border border-ink/70 font-bold rounded-lg hover:bg-ink/60 active:scale-95 transition-all text-[10px] md:text-xs ${FOCUS}`}
                    >
                        View
                    </button>
                </div>
            </div>
        </div>
    );
}
