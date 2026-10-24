import { MapPin, Briefcase } from 'lucide-react';
import type { Candidate } from '@/types';
import { useSkin, FOCUS } from '@/styles/skin';

const toTitleCase = (s?: string) =>
  (s || '').split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

interface CandidateSideListProps {
  candidates: Candidate[];
  onSelectCandidate: (candidate: Candidate) => void;
}

/** Compact vertical list of the other candidates, shown beside an opened candidate. */
export default function CandidateSideList({ candidates, onSelectCandidate }: CandidateSideListProps) {
  const skin = useSkin();
  return (
    <aside aria-label="Other candidates" className="flex min-h-0 flex-col">
      <h2 className={`mb-3 shrink-0 ${skin.cardTitle}`}>Other candidates</h2>
      <ul className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
        {candidates.length === 0 && <li className={skin.body}>No other candidates.</li>}
        {candidates.map((c) => {
          const location = typeof c.profileExtras?.location === 'string' ? c.profileExtras.location.trim() : '';
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelectCandidate(c)}
                className={`block w-full cursor-pointer border ${skin.edge} bg-surface ${skin.radius} p-3 text-left transition-colors duration-200 hover:border-ink/40 ${FOCUS}`}
              >
                <p className={`${skin.cardTitle} truncate`}>{toTitleCase(c.name) || 'Unnamed'}</p>
                <p className={`mt-1.5 flex items-center gap-1.5 ${skin.body}`}>
                  <Briefcase className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                  <span className="truncate">{toTitleCase(c.role) || 'No role'}</span>
                </p>
                {location && (
                  <p className={`mt-1 flex items-center gap-1.5 ${skin.body}`}>
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                    <span className="truncate">{location}</span>
                  </p>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
