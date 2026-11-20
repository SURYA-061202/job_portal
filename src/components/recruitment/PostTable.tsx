import { useMemo } from 'react';
import type { RecruitmentRequest } from '@/types';
import { timeAgo } from '@/lib/format';
import { buildHighlightRegex } from '@/lib/candidateSearch';
import Highlight from '@/components/resume/Highlight';
import FitSkills from '@/components/ui/FitSkills';
import { useSkin, FOCUS } from '@/styles/skin';
import PostStatusBadge from '@/components/recruitment/PostStatusBadge';
import PostLifecycleMenu, { type LifecycleAction } from '@/components/recruitment/PostLifecycleMenu';
import { describeExpiry, formatDate, getPostLifecycle } from '@/lib/postLifecycle';

interface PostTableProps {
  posts: RecruitmentRequest[];
  onViewDetails: (post: RecruitmentRequest) => void;
  /** Search keywords, highlighted in the text columns. */
  keywords?: string[];
  onEdit?: (post: RecruitmentRequest) => void;
  onDelete?: (post: RecruitmentRequest) => Promise<void> | void;
  /** Pause / resume / extend / close / repost. Without it the row shows status only. */
  onLifecycle?: (post: RecruitmentRequest, action: LifecycleAction) => void;
  onDuplicate?: (post: RecruitmentRequest) => void;
  /** Bulk selection: when given, a checkbox column appears. */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  /** Header checkbox: select (true) or clear (false) every row shown. */
  onToggleAll?: (select: boolean) => void;
}

const COLUMNS = ['Job title', 'Department', 'Location', 'Level', 'Experience', 'Skills', 'Applicants', 'Status', 'Posted', 'Expires', 'View', 'Actions'];
const CENTERED = new Set(['Applicants', 'Status', 'Actions', 'View']);

/**
 * Job posts as a table, in the same style as the Candidates table: one row per
 * post, click a row (or View) to open it. The Actions column is one button
 * that opens Edit, the status actions (pause, extend, close, repost) and Delete.
 */
export default function PostTable({ posts, onViewDetails, keywords = [], onEdit, onDelete, onLifecycle, onDuplicate, selectedIds, onToggleSelect, onToggleAll }: PostTableProps) {
  const skin = useSkin();
  const regex = useMemo(() => buildHighlightRegex(keywords), [keywords]);
  const hl = (t?: string) => <Highlight text={t ?? ''} regex={regex} />;

  const th = `sticky top-0 z-10 whitespace-nowrap border-b border-r last:border-r-0 ${skin.edge} bg-neutral-100 px-3 py-2.5 text-left text-xs font-bold uppercase text-ink`;
  const td = `border-b border-r last:border-r-0 ${skin.edge} px-3 py-2.5 align-middle text-[13px] text-ink/80`;
  const dash = <span className="text-ink/40">-</span>;
  const selectable = !!onToggleSelect && !!onToggleAll && !!selectedIds;
  const pickedCount = posts.filter((p) => selectedIds?.has(p.id ?? '')).length;
  const check = 'h-4 w-4 cursor-pointer accent-ink';

  return (
    <div className={`thin-scrollbar min-h-0 overflow-auto border ${skin.edge} bg-surface`}>
      <table className="w-full min-w-full border-separate border-spacing-0 text-left">
        <caption className="sr-only">Job posts</caption>
        <thead>
          <tr>
            {selectable && (
              <th scope="col" className={`${th} w-10 text-center`}>
                <input
                  type="checkbox"
                  aria-label="Select all posts"
                  className={check}
                  checked={posts.length > 0 && pickedCount === posts.length}
                  ref={(el) => { if (el) el.indeterminate = pickedCount > 0 && pickedCount < posts.length; }}
                  onChange={(e) => onToggleAll!(e.target.checked)}
                />
              </th>
            )}
            {COLUMNS.map((name) => (
              <th key={name} scope="col" className={`${th} ${CENTERED.has(name) ? 'text-center' : ''}`}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => {
            const id = post.id ?? '';
            const skills = (post.skills || '').split(',').map((s) => s.trim()).filter(Boolean);
            return (
              <tr
                key={id}
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
                {selectable && (
                  <td className={`${td} w-10 text-center`} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${post.jobTitle}`}
                      className={check}
                      checked={selectedIds!.has(id)}
                      onChange={() => onToggleSelect!(id)}
                    />
                  </td>
                )}
                <td className={`${td} max-w-[16rem]`}>
                  <p className="truncate font-medium text-sky-700 underline-offset-2 group-hover:underline" title={post.jobTitle}>{hl(post.jobTitle)}</p>
                  {regex && post.companyName && new RegExp(regex.source, 'iu').test(post.companyName) && (
                    <p className="truncate text-xs text-ink/60">{hl(post.companyName)}</p>
                  )}
                </td>
                <td className={`${td} max-w-[12rem] truncate`} title={post.department}>{post.department ? hl(post.department) : dash}</td>
                <td className={`${td} max-w-[12rem] truncate`} title={post.location}>{post.location ? hl(post.location) : dash}</td>
                <td className={`${td} whitespace-nowrap`}>{post.positionLevel ? hl(post.positionLevel) : dash}</td>
                <td className={`${td} whitespace-nowrap`}>{post.yearsExperience ? `${post.yearsExperience} yrs` : dash}</td>
                <td className={`${td} min-w-[16rem]`}>{skills.length ? <FitSkills skills={skills} render={hl} /> : dash}</td>
                <td className={`${td} whitespace-nowrap text-center font-semibold text-ink tabular-nums`}>{post.applicantCount ?? 0}{post.applicationCap ? <span className="font-normal text-ink/50">/{post.applicationCap}</span> : null}</td>
                <td className={`${td} whitespace-nowrap text-center`}><PostStatusBadge post={post} /></td>
                <td className={`${td} whitespace-nowrap`} title={post.postedAt ? `Posted ${formatDate(post.postedAt)}` : undefined}>{timeAgo(post.postedAt ?? post.createdAt)}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {(() => {
                    const lc = getPostLifecycle(post);
                    if (lc.status === 'draft') return <span>{describeExpiry(post)}</span>;
                    if (!lc.expiresAt) return dash;
                    return (
                      <span title={formatDate(lc.expiresAt)} className={lc.expiringSoon ? 'font-semibold text-amber-700' : lc.status === 'expired' ? 'text-rose-700' : undefined}>
                        {lc.status === 'closed' || lc.status === 'paused' ? formatDate(lc.expiresAt) : describeExpiry(post)}
                      </span>
                    );
                  })()}
                </td>
                <td className={`${td} whitespace-nowrap text-center`}>
                  <span className="text-[13px] font-medium text-sky-700 group-hover:underline">View</span>
                </td>
                <td className={`${td} whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center">
                    <PostLifecycleMenu post={post} onAction={onLifecycle} onEdit={onEdit} onDelete={onDelete} onDuplicate={onDuplicate} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
