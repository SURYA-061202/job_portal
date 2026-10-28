import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Briefcase, Clock, ArrowRight } from 'lucide-react';
import type { Candidate } from '@/types';
import { useSkin, FOCUS } from '@/styles/skin';
import CandidateSearchResults from './CandidateSearchResults';
import { getApplicationStatusInfo } from '@/lib/applicationStatus';

interface CandidateCarouselProps {
  candidates: Candidate[];
  loading: boolean;
  onSelectCandidate: (candidate: Candidate) => void;
  emptyMessage?: string;
  /** Candidate whose full profile takes the first 2x2 cells of the grid. */
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
}

const toTitleCase = (s?: string) =>
  (s || '').split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

const expLabel = (e?: string) => {
  const t = (e || '').toString().trim();
  if (!t) return '';
  return /^\d+(\.\d+)?$/.test(t) ? `${t} ${Number(t) === 1 ? 'yr' : 'yrs'}` : t;
};

/** Columns on screen at the current width; mirrors the auto-cols breakpoints of the track. */
function useColumns() {
  const calc = () => {
    if (typeof window === 'undefined') return 4;
    const w = window.innerWidth;
    return w >= 1280 ? 4 : w >= 1024 ? 3 : w >= 640 ? 2 : 1;
  };
  const [cols, setCols] = useState(calc);
  useEffect(() => {
    const onResize = () => setCols(calc());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return cols;
}

/**
 * Candidates as cards in two rows. When there are more than fit on screen the
 * cards slide sideways: the arrows move one screenful at a time.
 */
export default function CandidateCarousel({ candidates, loading, onSelectCandidate, emptyMessage, selected, onCloseSelected, canViewContact, onViewPlans, keywords = [], showStatus = false, onInvite, isApplied }: CandidateCarouselProps) {
  const skin = useSkin();
  const cols = useColumns();
  const trackRef = useRef<HTMLDivElement>(null);
  const selectedId = selected?.id;
  useEffect(() => {
    if (selectedId) trackRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  }, [selectedId]);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateArrows();
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    return () => ro.disconnect();
  }, [candidates, loading, updateArrows]);

  const slide = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="grid grid-rows-2 grid-flow-col gap-4 auto-cols-[100%] sm:auto-cols-[calc((100%-1rem)/2)] lg:auto-cols-[calc((100%-2rem)/3)] xl:auto-cols-[calc((100%-3rem)/4)] overflow-hidden">
        <span className="sr-only">Loading candidates…</span>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className={`h-40 animate-pulse border ${skin.edge} bg-surface ${skin.radius}`} />
        ))}
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className={`flex min-h-[240px] items-center justify-center border ${skin.edge} ${skin.cardSurface} ${skin.radius} p-12 text-center`}>
        <p className={skin.body}>{emptyMessage || 'No candidates yet.'}</p>
      </div>
    );
  }

  const arrowClass = `absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border ${skin.edge} bg-surface text-ink shadow-md transition-opacity duration-200 hover:border-ink/40 cursor-pointer ${FOCUS} disabled:pointer-events-none disabled:opacity-0`;

  return (
    <div className="relative flex-1 min-h-0">
      <button type="button" onClick={() => slide(-1)} disabled={!canPrev} aria-label="Previous candidates" className={`${arrowClass} -left-3`}>
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <button type="button" onClick={() => slide(1)} disabled={!canNext} aria-label="Next candidates" className={`${arrowClass} -right-3`}>
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>

      <div
        ref={trackRef}
        onScroll={updateArrows}
        className="grid h-full grid-rows-[repeat(2,minmax(0,1fr))] grid-flow-col gap-4 auto-cols-[100%] sm:auto-cols-[calc((100%-1rem)/2)] lg:auto-cols-[calc((100%-2rem)/3)] xl:auto-cols-[calc((100%-3rem)/4)] overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide"
      >
        {selected && (
          <div className="snap-start row-span-2 min-h-0 min-w-0 sm:col-span-2">
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
        )}
        {(() => {
          // The track fills column by column (two rows). Reorder each screenful so the
          // cards read left to right across the first row, then the second row.
          const list = candidates.filter((c) => c.id !== selected?.id);
          if (selected) return list;
          const page = cols * 2;
          const out: (Candidate | null)[] = [];
          for (let start = 0; start < list.length; start += page) {
            const slots: (Candidate | null)[] = new Array(page).fill(null);
            list.slice(start, start + page).forEach((c, i) => {
              slots[(i % cols) * 2 + Math.floor(i / cols)] = c;
            });
            let last = slots.length - 1;
            while (last >= 0 && slots[last] === null) last--;
            out.push(...slots.slice(0, last + 1));
          }
          return out;
        })().map((c, idx) => {
          if (!c) return <div key={`gap-${idx}`} aria-hidden="true" />;
          const skills = Array.isArray(c.skills) ? c.skills : [];
          const location = typeof c.profileExtras?.location === 'string' ? c.profileExtras.location.trim() : '';
          return (
            <article
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelectCandidate(c)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectCandidate(c);
                }
              }}
              className={`snap-start flex min-h-0 min-w-0 cursor-pointer overflow-hidden flex-col border ${skin.edge} bg-surface ${skin.radius} p-4 transition-all duration-200 hover:border-ink/40 hover:shadow-md ${FOCUS}`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className={`${skin.cardTitle} truncate`}>{toTitleCase(c.name) || 'Unnamed'}</h3>
                {showStatus && (() => {
                  const info = getApplicationStatusInfo(c.status || 'applied');
                  return info ? (
                    <span className={`shrink-0 whitespace-nowrap rounded-lg border px-2 py-0.5 text-[10px] font-bold ${info.label === 'Selected' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-orange-300 bg-orange-50 text-orange-700'}`}>{info.label}</span>
                  ) : null;
                })()}
              </div>
              <p className={`mt-2 flex items-center gap-1.5 ${skin.body}`}>
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                <span className="truncate">{toTitleCase(c.role) || 'No role'}</span>
              </p>
              {expLabel(c.experience) && (
                <p className={`mt-1 flex items-center gap-1.5 ${skin.body}`}>
                  <Clock className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                  <span className="truncate">{expLabel(c.experience)}</span>
                </p>
              )}
              {location && (
                <p className={`mt-1 flex items-center gap-1.5 ${skin.body}`}>
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                  <span className="truncate">{location}</span>
                </p>
              )}

              {skills.length > 0 && (
                <p className="mt-3 line-clamp-2 text-[11px] leading-6">
                  {skills.map((s, i) => (
                    <span key={`${s}-${i}`} className="mr-1 inline-block rounded-md bg-ink/5 px-2 align-middle text-[11px] font-medium leading-[18px] text-ink/80">{s}</span>
                  ))}
                </p>
              )}

              <div className="mt-auto flex items-center justify-between pt-2.5 text-xs">
                <span className="text-ink/50">{skills.length} {skills.length === 1 ? 'skill' : 'skills'}</span>
                <span className="inline-flex items-center gap-1 font-semibold text-ink">
                  View profile <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
