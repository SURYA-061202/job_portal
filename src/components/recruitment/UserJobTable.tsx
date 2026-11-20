import { useMemo } from 'react';
import type { RecruitmentRequest } from '@/types';
import { timeAgo } from '@/lib/format';
import { buildHighlightRegex } from '@/lib/candidateSearch';
import { getApplicationStatusInfo } from '@/lib/applicationStatus';
import { describeClosing, getPostLifecycle } from '@/lib/postLifecycle';
import Highlight from '@/components/resume/Highlight';
import FitSkills from '@/components/ui/FitSkills';
import PostStatusBadge from '@/components/recruitment/PostStatusBadge';
import { useSkin, FOCUS } from '@/styles/skin';

export interface UserJobRow {
  post: RecruitmentRequest;
  /** Raw job_applications status; when any row has one, an Application column is shown. */
  applicationStatus?: string;
}

interface UserJobTableProps {
  rows: UserJobRow[];
  onViewDetails: (post: RecruitmentRequest) => void;
  /** Search keywords, highlighted in the text columns. */
  keywords?: string[];
}

/**
 * Jobs as a table for job seekers, in the same style as the recruiter's post
 * table: one row per job, click a row (or View) to open it.
 */
export default function UserJobTable({ rows, onViewDetails, keywords = [] }: UserJobTableProps) {
  const skin = useSkin();
  const regex = useMemo(() => buildHighlightRegex(keywords), [keywords]);
  const hl = (t?: string) => <Highlight text={t ?? ''} regex={regex} />;
  const showApplication = rows.some((r) => r.applicationStatus);

  const columns = ['Job title', 'Location', 'Level', 'Experience', 'Skills', 'Posted', 'Closes', ...(showApplication ? ['Application'] : []), 'View'];
  const centered = new Set(['Application', 'View']);

  const th = `sticky top-0 z-10 whitespace-nowrap border-b border-r last:border-r-0 ${skin.edge} bg-neutral-100 px-3 py-2.5 text-left text-xs font-bold uppercase text-ink`;
  const td = `border-b border-r last:border-r-0 ${skin.edge} px-3 py-2.5 align-middle text-[13px] text-ink/80`;
  const dash = <span className="text-ink/40">-</span>;

  return (
    <div className={`thin-scrollbar max-h-[calc(100vh-7rem)] min-h-0 overflow-auto border ${skin.edge} bg-surface`}>
      <table className="w-full min-w-full border-separate border-spacing-0 text-left">
        <caption className="sr-only">Jobs</caption>
        <thead>
          <tr>
            {columns.map((name) => (
              <th key={name} scope="col" className={`${th} ${centered.has(name) ? 'text-center' : ''}`}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ post, applicationStatus }) => {
            const skills = (post.skills || '').split(',').map((s) => s.trim()).filter(Boolean);
            const lc = getPostLifecycle(post);
            const closing = describeClosing(post);
            const appInfo = getApplicationStatusInfo(applicationStatus);
            return (
              <tr
                key={post.id}
                tabIndex={0}
                onClick={() => onViewDetails(post)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onViewDetails(post);
                  }
                }}
                className={`group cursor-pointer transition-colors duration-200 hover:bg-neutral-200/70 ${FOCUS}`}
              >
                <td className={`${td} max-w-[18rem]`}>
                  <p className="truncate font-medium text-sky-700 underline-offset-2 group-hover:underline" title={post.jobTitle}>{hl(post.jobTitle)}</p>
                  {post.companyName && <p className="truncate text-xs text-ink/60" title={post.companyName}>{hl(post.companyName)}</p>}
                </td>
                <td className={`${td} max-w-[12rem] truncate`} title={post.location}>{post.location ? hl(post.location) : dash}</td>
                <td className={`${td} whitespace-nowrap`}>{post.positionLevel ? hl(post.positionLevel) : dash}</td>
                <td className={`${td} whitespace-nowrap`}>{post.yearsExperience ? `${post.yearsExperience} yrs` : dash}</td>
                <td className={`${td} min-w-[16rem]`}>{skills.length ? <FitSkills skills={skills} render={hl} /> : dash}</td>
                <td className={`${td} whitespace-nowrap`}>{timeAgo(post.postedAt ?? post.createdAt)}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {!lc.open ? <PostStatusBadge post={post} /> : closing ? (
                    <span className={lc.expiringSoon ? 'font-semibold text-amber-700' : undefined}>{closing.replace('Closes ', '')}</span>
                  ) : dash}
                </td>
                {showApplication && (
                  <td className={`${td} whitespace-nowrap text-center`}>
                    {appInfo ? <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[11px] font-bold ${appInfo.className}`}>{appInfo.label}</span> : dash}
                  </td>
                )}
                <td className={`${td} whitespace-nowrap text-center`}>
                  <span className="text-[13px] font-medium text-sky-700 group-hover:underline">View</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
