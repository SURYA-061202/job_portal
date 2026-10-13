import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RecruitmentRequest } from '@/types';
import { timeAgo } from '@/lib/format';
import { useSkin, FOCUS } from '@/styles/skin';
import { Calendar, Briefcase, MapPin, IndianRupee, X } from 'lucide-react';

/* The job-post card shared by the Posts tab and the Pipeline tab, so both
   modules list posts with the same UI. Title reserves two lines (empty second
   line when short), experience/salary/location as icon meta with no boxes,
   skills as
   comma-separated text clamped to two lines - an "…" chip appears at the line
   end when it overflows and opens the full list in a modal. Footer has
   posted-ago and applicant count. Root is role="button" rather than <button>
   so the skills "…" chip can be a real nested <button>; keyboard activation
   is handled manually. */
export default function PostCard({ post, onOpen, count, countLabel }: {
    post: RecruitmentRequest;
    onOpen: (post: RecruitmentRequest) => void;
    /** Footer badge value — defaults to the post's applicant count. */
    count?: number;
    /** Footer badge noun — defaults to Applicant/Applicants. */
    countLabel?: string;
}) {
    const skin = useSkin();
    const [showAllSkills, setShowAllSkills] = useState(false);
    const [skillsClamped, setSkillsClamped] = useState(false);
    const skillsRef = useRef<HTMLSpanElement>(null);

    const footerCount = count ?? post.applicantCount ?? 0;
    const footerLabel = countLabel ?? (post.applicantCount === 1 ? 'Applicant' : 'Applicants');

    const allSkills = post.skills
        ? post.skills.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    const skillsText = allSkills.join(', ');

    // Two-line clamp is CSS-only; measure to know whether the "…" chip is needed.
    useLayoutEffect(() => {
        const el = skillsRef.current;
        if (el) setSkillsClamped(el.scrollHeight > el.clientHeight + 1);
    }, [skillsText]);

    return (
        <>
            <div
                role="button"
                tabIndex={0}
                onClick={() => onOpen(post)}
                onKeyDown={(e) => {
                    // Ignore keys bubbling up from the nested "…" chip.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpen(post);
                    }
                }}
                aria-label={`Open job post: ${post.jobTitle}`}
                className={`group flex h-full cursor-pointer flex-col overflow-hidden border ${skin.edge} ${skin.cardSurface} ${skin.radius} text-left transition-colors duration-200 ${skin.cardHover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40`}
            >
                <span className="flex flex-1 flex-col p-4 sm:p-5">
                    {/* `text-base!` trims the shared cardTitle size (text-lg) by
                        one step; line-clamp-2 + the 2.5em min-height (two lines
                        at leading-tight) reserve the second line even when the
                        title is short. */}
                    <span className={`min-w-0 line-clamp-2 min-h-[2.5em] ${skin.cardTitle} text-base!`}>
                        {post.jobTitle}
                    </span>
                    <span className={`mt-1 block ${skin.micro}`}>{post.department}</span>

                    {/* Experience, salary and location as bare icon meta - no
                        boxes; icons inherit their field's text colour. */}
                    <span className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                        <span className={`flex items-center gap-1.5 ${skin.cardValue} font-semibold!`}>
                            <Briefcase className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            {post.yearsExperience} yrs exp
                        </span>
                        {post.budgetPay && (
                            <span className={`flex items-center gap-1.5 ${skin.cardValue} font-semibold!`}>
                                <IndianRupee className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                {post.budgetPay}
                            </span>
                        )}
                        {post.location && (
                            <span className={`flex items-center gap-1.5 ${skin.cardValue} font-semibold!`}>
                                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                {post.location}
                            </span>
                        )}
                    </span>

                    <span className="mt-4 flex-1">
                        <span className={`mb-2 block ${skin.micro} font-bold!`}>Key Skills</span>
                        <span className="relative block">
                            <span ref={skillsRef} className={`line-clamp-2 ${skin.body}`}>
                                {skillsText}
                            </span>
                            {skillsClamped && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowAllSkills(true);
                                    }}
                                    aria-label="Show all skills"
                                    title="Show all skills"
                                    className={`absolute bottom-0 right-0 cursor-pointer pl-2 font-bold ${skin.body} ${skin.cardSurface} ${FOCUS}`}
                                >
                                    &hellip;
                                </button>
                            )}
                        </span>
                    </span>

                    <span className="mt-4 flex items-center justify-between gap-2">
                        <span className={`flex items-center gap-1.5 ${skin.meta}`}>
                            <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                            {timeAgo(post.createdAt)}
                        </span>
                        <span className={`${skin.count} rounded-lg`}>
                            {footerCount} {footerLabel}
                        </span>
                    </span>
                </span>
            </div>

            {showAllSkills && createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={() => setShowAllSkills(false)}
                >
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={`All skills for ${post.jobTitle}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`w-full max-w-md border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}
                    >
                        <div className={`flex items-start justify-between gap-3 border-b ${skin.edge} px-5 py-4`}>
                            <div className="min-w-0">
                                <h3 className={skin.emptyTitle}>Key Skills</h3>
                                <p className={`mt-1 truncate ${skin.meta}`}>{post.jobTitle}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAllSkills(false)}
                                aria-label="Close skills"
                                className={`shrink-0 cursor-pointer rounded-lg p-1 ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 p-5">
                            {allSkills.map((skill, i) => (
                                <span key={i} className={`${skin.tag} rounded-lg`}>
                                    {skill}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
