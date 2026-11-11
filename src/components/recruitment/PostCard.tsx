import type { RecruitmentRequest } from '@/types';
import { timeAgo } from '@/lib/format';
import { useSkin } from '@/styles/skin';
import { Calendar, Briefcase, MapPin, IndianRupee } from 'lucide-react';
import SkillsLine from '@/components/ui/SkillsLine';

/* The job-post card shared by the Posts tab and the Pipeline tab, so both
   modules list posts with the same UI. Title reserves two lines (empty second
   line when short), experience/salary/location as icon meta with no boxes,
   skills as
   comma-separated text held to one line - an "…" appears at the line end when
   it overflows and a hover popover lists every skill. Footer has
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
    const footerCount = count ?? post.applicantCount ?? 0;
    const footerLabel = countLabel ?? (post.applicantCount === 1 ? 'Applicant' : 'Applicants');

    const allSkills = post.skills
        ? post.skills.split(',').map(s => s.trim()).filter(Boolean)
        : [];

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
                        {allSkills.length > 0 && (
                            <SkillsLine
                                skills={allSkills}
                                lines={1}
                                label="Skills"
                                className=""
                                textClass={`${skin.body} leading-5!`}
                                maskClass={skin.cardSurface}
                            />
                        )}
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

        </>
    );
}
