import { useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Trash2, X } from 'lucide-react';
import type { RecruitmentRequest } from '@/types';
import { timeAgo } from '@/lib/format';
import { buildHighlightRegex } from '@/lib/candidateSearch';
import Highlight from '@/components/resume/Highlight';
import FitSkills from '@/components/ui/FitSkills';
import { useSkin, FOCUS } from '@/styles/skin';

interface PostTableProps {
  posts: RecruitmentRequest[];
  onViewDetails: (post: RecruitmentRequest) => void;
  /** Search keywords, highlighted in the text columns. */
  keywords?: string[];
  onEdit?: (post: RecruitmentRequest) => void;
  onDelete?: (post: RecruitmentRequest) => Promise<void> | void;
}

const COLUMNS = ['Job title', 'Department', 'Location', 'Level', 'Experience', 'Skills', 'Applicants', 'Posted', 'Actions', 'View'];
const CENTERED = new Set(['Applicants', 'Actions', 'View']);

/**
 * Job posts as a table, in the same style as the Candidates table: one row per
 * post, click a row (or View) to open it. Edit and delete (with an inline
 * confirm) sit in the Actions column.
 */
export default function PostTable({ posts, onViewDetails, keywords = [], onEdit, onDelete }: PostTableProps) {
  const skin = useSkin();
  const regex = useMemo(() => buildHighlightRegex(keywords), [keywords]);
  const hl = (t?: string) => <Highlight text={t ?? ''} regex={regex} />;
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const th = `sticky top-0 z-10 whitespace-nowrap border-b border-r last:border-r-0 ${skin.edge} bg-neutral-100 px-3 py-2.5 text-left text-xs font-bold uppercase text-ink`;
  const td = `border-b border-r last:border-r-0 ${skin.edge} px-3 py-2.5 align-middle text-[13px] text-ink/80`;
  const icon = `flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink/60 transition-colors duration-200 hover:bg-ink/10 hover:text-ink disabled:opacity-50 ${FOCUS}`;
  const dash = <span className="text-ink/40">-</span>;

  return (
    <div className={`thin-scrollbar min-h-0 overflow-auto border ${skin.edge} bg-surface`}>
      <table className="w-full min-w-full border-separate border-spacing-0 text-left">
        <caption className="sr-only">Job posts</caption>
        <thead>
          <tr>
            {COLUMNS.map((name) => (
              <th key={name} scope="col" className={`${th} ${CENTERED.has(name) ? 'text-center' : ''}`}>{name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => {
            const id = post.id ?? '';
            const skills = (post.skills || '').split(',').map((s) => s.trim()).filter(Boolean);
            const confirming = confirmingId === id;
            const deleting = deletingId === id;
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
                <td className={`${td} whitespace-nowrap text-center font-semibold text-ink tabular-nums`}>{post.applicantCount ?? 0}</td>
                <td className={`${td} whitespace-nowrap`}>{timeAgo(post.createdAt)}</td>
                <td className={`${td} whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-center gap-0.5">
                    {onEdit && !confirming && (
                      <button type="button" onClick={() => onEdit(post)} className={icon} title="Edit post" aria-label={`Edit ${post.jobTitle}`}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                    {onDelete && (confirming ? (
                      <>
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={async () => {
                            setDeletingId(id);
                            try { await onDelete(post); } finally { setDeletingId(null); setConfirmingId(null); }
                          }}
                          className={`${icon} text-destructive hover:text-destructive`}
                          title="Confirm delete"
                          aria-label="Confirm delete"
                        >
                          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                        </button>
                        <button type="button" disabled={deleting} onClick={() => setConfirmingId(null)} className={icon} title="Cancel" aria-label="Cancel delete">
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmingId(id)} className={`${icon} hover:text-destructive`} title="Delete post" aria-label={`Delete ${post.jobTitle}`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                </td>
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
