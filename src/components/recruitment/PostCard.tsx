import type { RecruitmentRequest } from '@/types';
import { timeAgo } from '@/lib/format';
import { useSkin } from '@/styles/skin';
import { Calendar } from 'lucide-react';

/* The job-post card shared by the Posts tab and the Pipeline tab, so both
   modules list posts with the same UI. Static brand rule, two-cell rule grid
   for Experience/Location, micro-labelled skills, footer with posted-ago and
   applicant count. Deliberately a <button>: every child is a <span>, so the
   focus outline and hit area stay intact. */
export default function PostCard({ post, onOpen }: { post: RecruitmentRequest; onOpen: (post: RecruitmentRequest) => void }) {
    const skin = useSkin();
    const skills = post.skills ? post.skills.split(',').slice(0, 3) : [];

    return (
        <button
            type="button"
            onClick={() => onOpen(post)}
            aria-label={`Open job post: ${post.jobTitle}`}
            className={`group flex h-full cursor-pointer flex-col overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} text-left transition-colors duration-200 ${skin.cardHover} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40`}
        >
            {/* Static brand rule - a structural line, not a reveal animation. */}
            <span aria-hidden="true" className="h-1 w-full shrink-0 bg-brand" />

            <span className="flex flex-1 flex-col p-4 sm:p-5">
                <span className="flex items-start justify-between gap-3">
                    {/* `text-base!` trims the shared cardTitle size (text-lg) by
                        one step - the important suffix is what makes the
                        override win over the token without touching the token. */}
                    <span className={`min-w-0 ${skin.cardTitle} text-base!`}>
                        {post.jobTitle}
                    </span>
                    {post.positionLevel && (
                        <span className={`shrink-0 ${skin.chip}`}>
                            {post.positionLevel}
                        </span>
                    )}
                </span>
                <span className={`mt-1 block ${skin.micro}`}>{post.department}</span>

                {/* Two-cell rule grid - no boxes inside boxes, just dividers. */}
                <span className={`mt-4 grid grid-cols-2 border ${skin.edge}`}>
                    <span className={`border-r ${skin.edge} p-2.5`}>
                        <span className={`block ${skin.micro}`}>Experience</span>
                        <span className={`mt-1 block ${skin.cardValue}`}>{post.yearsExperience}</span>
                    </span>
                    <span className="p-2.5">
                        <span className={`block ${skin.micro}`}>Location</span>
                        <span className={`mt-1 block ${skin.cardValue}`}>{post.location}</span>
                    </span>
                </span>

                <span className="mt-4 flex-1">
                    <span className={`mb-2 block ${skin.micro}`}>Key Skills</span>
                    <span className="flex flex-wrap gap-1.5">
                        {skills.map((skill, i) => (
                            <span key={i} className={skin.tag}>
                                {skill.trim()}
                            </span>
                        ))}
                    </span>
                </span>

                <span className={`mt-4 flex items-center justify-between gap-2 border-t ${skin.edge} pt-3`}>
                    <span className={`flex items-center gap-1.5 ${skin.meta}`}>
                        <Calendar className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                        {timeAgo(post.createdAt)}
                    </span>
                    <span className={skin.count}>
                        {post.applicantCount ?? 0} {post.applicantCount === 1 ? 'Applicant' : 'Applicants'}
                    </span>
                </span>
            </span>
        </button>
    );
}
