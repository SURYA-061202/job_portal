import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Briefcase } from 'lucide-react';
import type { Candidate } from '@/types';
import { useSkin, FOCUS } from '@/styles/skin';
import CandidateSearchResults from './CandidateSearchResults';

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
}

const toTitleCase = (s?: string) =>
  (s || '').split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

/**
 * Candidates as cards in two rows. When there are more than fit on screen the
 * cards slide sideways: the arrows move one screenful at a time.
 */
export default function CandidateCarousel({ candidates, loading, onSelectCandidate, emptyMessage, selected, onCloseSelected, canViewContact, onViewPlans }: CandidateCarouselProps) {
  const skin = useSkin();
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
              keywords={[]}
              onSelectCandidate={onSelectCandidate}
              detail
              onClose={onCloseSelected}
              canViewContact={canViewContact}
              onViewPlans={onViewPlans}
            />
          </div>
        )}
        {candidates.filter((c) => c.id !== selected?.id).map((c) => {
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
              className={`snap-start flex min-h-0 min-w-0 cursor-pointer overflow-hidden flex-col border ${skin.edge} bg-surface ${skin.radius} p-4 transition-colors duration-200 hover:border-ink/40 ${FOCUS}`}
            >
              <h3 className={`${skin.cardTitle} truncate`}>{toTitleCase(c.name) || 'Unnamed'}</h3>
              <p className={`mt-2 flex items-center gap-1.5 ${skin.body}`}>
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                <span className="truncate">{toTitleCase(c.role) || 'No role'}</span>
              </p>
              {location && (
                <p className={`mt-1 flex items-center gap-1.5 ${skin.body}`}>
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                  <span className="truncate">{location}</span>
                </p>
              )}

              {skills.length > 0 && (
                <p className="mt-4 line-clamp-2 text-xs leading-7">
                  {skills.map((s, i) => (
                    <span key={`${s}-${i}`} className="mr-1.5 inline-block rounded-lg bg-ink/5 px-2.5 py-0.5 align-middle font-medium leading-5 text-ink/80">{s}</span>
                  ))}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
