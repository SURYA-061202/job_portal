import { useEffect, useRef } from 'react';
import type { Candidate } from '@/types';
import { useSkin, FOCUS } from '@/styles/skin';
import FitSkills from '@/components/ui/FitSkills';
import CandidateSearchResults from './CandidateSearchResults';
import { getApplicationStatusInfo } from '@/lib/applicationStatus';

interface CandidateTableProps {
  candidates: Candidate[];
  loading: boolean;
  onSelectCandidate: (candidate: Candidate) => void;
  emptyMessage?: string;
  /** Candidate whose full profile is open: it takes the left side and the table narrows to the right. */
  selected?: Candidate | null;
  onCloseSelected?: () => void;
  canViewContact?: boolean;
  onViewPlans?: () => void;
  /** Active search keywords, highlighted in the opened profile. */
  keywords?: string[];
  /** Post applicants: show each candidate's pipeline status (Applied, Shortlisted, Interview Round n...). */
  showStatus?: boolean;
  /** Opened profile: Interview Invite action (omit to hide it). */
  onInvite?: (candidate: Candidate) => void;
  isApplied?: (candidate: Candidate) => boolean;
  /** Candidate id -> 0-100 match for the post being viewed. Adds a Match column when given. */
  scores?: Record<string, number>;
}

const toTitleCase = (s?: string) =>
  (s || '').split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

const expLabel = (e?: string) => {
  const t = (e || '').toString().trim();
  if (!t) return '';
  return /^\d+(\.\d+)?$/.test(t) ? `${t} ${Number(t) === 1 ? 'yr' : 'yrs'}` : t;
};

/**
 * Candidates as a table: one row per candidate, a column per detail. Clicking a
 * row opens the profile; the table then narrows to Name / Role / Experience and
 * sits beside it so the recruiter can keep moving through the list.
 */
export default function CandidateTable({ candidates, loading, onSelectCandidate, emptyMessage, selected, onCloseSelected, canViewContact, onViewPlans, keywords = [], showStatus = false, onInvite, isApplied, scores }: CandidateTableProps) {
  const skin = useSkin();
  const compact = !!selected;
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedId = selected?.id;

  // Opening a profile brings the list back to the top so the highlighted row is in view.
  useEffect(() => {
    if (selectedId) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [selectedId]);

  const th = `sticky top-0 z-10 whitespace-nowrap border-b border-r last:border-r-0 ${skin.edge} bg-neutral-100 px-3 py-2.5 text-left text-xs font-bold uppercase text-ink`;
  const td = `border-b border-r last:border-r-0 ${skin.edge} px-3 py-2.5 align-middle text-[13px] text-ink/80`;

  const showScore = !!scores;
  const columns = compact
    ? ['Name', 'Role', 'Experience', ...(showScore ? ['Match'] : [])]
    : ['Name', 'Role', 'Experience', 'Location', 'Skills', ...(showScore ? ['Match'] : []), ...(showStatus ? ['Status'] : []), 'View profile'];
  const scoreBadge = (id: string) => {
    const n = scores?.[id] ?? 0;
    const tone = n >= 70 ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : n >= 40 ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-ink/20 bg-ink/5 text-ink/60';
    return <span className={`inline-block min-w-[3rem] rounded-md border px-2 py-0.5 text-center text-xs font-bold tabular-nums ${tone}`}>{n}%</span>;
  };

  let body: React.ReactNode;
  if (loading) {
    body = Array.from({ length: 8 }).map((_, i) => (
      <tr key={i} aria-hidden="true">
        {columns.map((_c, j) => (
          <td key={j} className="px-3 py-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-ink/10" />
          </td>
        ))}
      </tr>
    ));
  } else if (candidates.length === 0) {
    body = (
      <tr>
        <td colSpan={columns.length} className={`px-3 py-16 text-center ${skin.body}`}>
          {emptyMessage || 'No candidates yet.'}
        </td>
      </tr>
    );
  } else {
    body = candidates.map((c) => {
      const skills = Array.isArray(c.skills) ? c.skills.map((s) => String(s).trim()).filter(Boolean) : [];
      const location = typeof c.profileExtras?.location === 'string' ? c.profileExtras.location.trim() : '';
      const isSelected = c.id === selectedId;
      const info = showStatus ? getApplicationStatusInfo(c.status || 'applied') : null;
      return (
        <tr
          key={c.id}
          tabIndex={0}
          aria-current={isSelected ? 'true' : undefined}
          onClick={() => onSelectCandidate(c)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectCandidate(c);
            }
          }}
          className={`group cursor-pointer transition-colors duration-200 hover:bg-neutral-200/70 ${isSelected ? 'bg-neutral-200/70' : ''} ${FOCUS}`}
        >
          <td className={`${td} max-w-[14rem] truncate font-medium text-sky-700 underline-offset-2 group-hover:underline`} title={toTitleCase(c.name)}>
            {toTitleCase(c.name) || 'Unnamed'}
          </td>
          <td className={`${td} max-w-[14rem] truncate`} title={toTitleCase(c.role)}>
            {toTitleCase(c.role) || <span className="text-ink/40">No role</span>}
          </td>
          <td className={`${td} whitespace-nowrap`}>{expLabel(c.experience) || <span className="text-ink/40">-</span>}</td>
          {compact && showScore && <td className={`${td} whitespace-nowrap`}>{scoreBadge(c.id)}</td>}
          {!compact && (
            <>
              <td className={`${td} max-w-[14rem] truncate`} title={location}>
                {location || <span className="text-ink/40">-</span>}
              </td>
              <td className={`${td} min-w-[16rem]`}>
                {skills.length === 0 ? (
                  <span className="text-ink/40">-</span>
                ) : (
                  <FitSkills skills={skills} />
                )}
              </td>
              {showScore && <td className={`${td} whitespace-nowrap`}>{scoreBadge(c.id)}</td>}
              {showStatus && (
                <td className={`${td} whitespace-nowrap`}>
                  {info && (
                    <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold ${info.label === 'Selected' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-orange-300 bg-orange-50 text-orange-700'}`}>{info.label}</span>
                  )}
                </td>
              )}
              <td className={`${td} whitespace-nowrap text-center`}>
                <span className="text-[13px] font-medium text-sky-700 group-hover:underline">View</span>
              </td>
            </>
          )}
        </tr>
      );
    });
  }

  const table = (
    <div
      ref={scrollRef}
      className={`thin-scrollbar ${selected ? 'h-full' : ''} min-h-0 overflow-auto border ${skin.edge} bg-surface`}
    >
      <table className="w-full min-w-full border-separate border-spacing-0 text-left" aria-busy={loading}>
        <caption className="sr-only">Candidates</caption>
        <thead>
          <tr>
            {columns.map((name, i) => (
              <th key={`${name}-${i}`} scope="col" className={`${th} ${name === 'View profile' ? 'text-center' : ''}`}>
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  );

  if (!selected) {
    // Hugs the rows; only scrolls once the list is taller than the available space.
    return <div className="flex min-h-0 flex-col">{table}</div>;
  }

  return (
    <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:overflow-hidden">
      <div className="min-h-[28rem] min-w-0 lg:min-h-0">
        <CandidateSearchResults
          results={[{ candidate: selected, matched: [], score: 0 }]}
          keywords={keywords}
          onSelectCandidate={onSelectCandidate}
          detail
          onClose={onCloseSelected}
          canViewContact={canViewContact}
          onViewPlans={onViewPlans}
          showStatus={showStatus}
          onInvite={onInvite}
          isApplied={isApplied}
        />
      </div>
      <div className="min-h-[20rem] min-w-0 lg:min-h-0">{table}</div>
    </div>
  );
}
