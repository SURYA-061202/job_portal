import { useMemo } from 'react';
import { MapPin, Briefcase, Clock, ArrowRight, UserX } from 'lucide-react';
import type { Candidate } from '@/types';
import { useSkin, FOCUS } from '@/styles/skin';
import { candidateMatchesSearch } from '@/lib/candidateMatch';
import SkillsLine from '@/components/ui/SkillsLine';

const toTitleCase = (s?: string) =>
    (s || '').split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

const expLabel = (e?: string) => {
    const t = (e || '').toString().trim();
    if (!t) return '';
    return /^[\d.]+$/.test(t) ? `${t} ${Number(t) === 1 ? 'yr' : 'yrs'}` : t;
};

/** Role as the Candidates cards show it: profile role, else the role they were invited for. */
const roleLabel = (c: Candidate): string =>
    (c.role || '').trim() || c.interviewDetails?.role?.trim() || '';

interface StageCandidateGridProps {
    candidates: Candidate[];
    loading: boolean;
    search: string;
    onSelect?: (candidate: Candidate) => void;
    emptyText: string;
}

/** Candidates at a stage as a grid of white cards (Shortlisted, Interview, Selected). */
export default function StageCandidateGrid({ candidates, loading, search, onSelect, emptyText }: StageCandidateGridProps) {
    const skin = useSkin();

    const shown = useMemo(
        () => candidates.filter((c) => candidateMatchesSearch(c, search)),
        [candidates, search]
    );

    if (loading) {
        return (
            <div role="status" aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                <span className="sr-only">Loading candidates…</span>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} aria-hidden="true" className={`animate-pulse border ${skin.edge} bg-surface ${skin.radius} p-4`}>
                        <div className={`h-5 w-1/2 ${skin.skeleton}`} />
                        <div className={`mt-3 h-3 w-2/3 ${skin.skeleton}`} />
                        <div className={`mt-2 h-3 w-1/3 ${skin.skeleton}`} />
                        <div className={`mt-2 h-3 w-1/4 ${skin.skeleton}`} />
                        <div className={`mt-6 h-3 w-4/5 ${skin.skeleton}`} />
                        <div className={`mt-3 h-3 w-1/3 ${skin.skeleton}`} />
                    </div>
                ))}
            </div>
        );
    }

    if (shown.length === 0) {
        return (
            <div className={`flex flex-col items-center justify-center border ${skin.edge} bg-surface ${skin.radius} px-6 py-16 text-center`}>
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink/5 text-ink/50" aria-hidden="true">
                    <UserX className="h-6 w-6" />
                </span>
                <h3 className={skin.emptyTitle}>{search && candidates.length > 0 ? 'No matching candidates' : 'No candidates found'}</h3>
                <p className={`mt-1 max-w-sm ${skin.body}`}>{search && candidates.length > 0 ? 'Try a different name, role, email or company.' : emptyText}</p>
            </div>
        );
    }

    return (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((c) => {
                const exp = expLabel(c.experience);
                const role = roleLabel(c);
                const skills = Array.isArray(c.skills) ? c.skills : [];
                const location = typeof c.profileExtras?.location === 'string' ? c.profileExtras.location.trim() : '';
                return (
                    <li key={c.id}>
                        <article
                            role={onSelect ? 'button' : undefined}
                            tabIndex={onSelect ? 0 : undefined}
                            onClick={onSelect ? () => onSelect(c) : undefined}
                            onKeyDown={onSelect ? (e) => {
                                if (e.target !== e.currentTarget) return;
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c); }
                            } : undefined}
                            className={`group flex h-full flex-col overflow-hidden border ${skin.edge} bg-surface ${skin.radius} p-4 transition-all duration-200 hover:border-ink/40 hover:shadow-md ${onSelect ? 'cursor-pointer' : ''} ${FOCUS}`}
                        >
                            <h3 className={`${skin.cardTitle} truncate`}>{toTitleCase(c.name) || 'Unnamed'}</h3>

                            <p className={`mt-2 flex items-center gap-1.5 ${skin.body}`}>
                                <Briefcase className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                <span className="min-w-0 truncate">{toTitleCase(role) || 'Not specified'}</span>
                            </p>
                            {exp && (
                                <p className={`mt-1 flex items-center gap-1.5 ${skin.body}`}>
                                    <Clock className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                    <span className="truncate">{exp}</span>
                                </p>
                            )}
                            {location && (
                                <p className={`mt-1 flex items-center gap-1.5 ${skin.body}`}>
                                    <MapPin className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                    <span className="truncate">{location}</span>
                                </p>
                            )}

                            {skills.length > 0 && <SkillsLine skills={skills} />}

                            <div className="mt-auto flex items-center justify-between pt-2.5 text-xs">
                                <span className="text-ink/50">{skills.length} {skills.length === 1 ? 'skill' : 'skills'}</span>
                                {onSelect && (
                                    <span className="inline-flex items-center gap-1 font-semibold text-ink">
                                        View profile <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                    </span>
                                )}
                            </div>
                        </article>
                    </li>
                );
            })}
        </ul>
    );
}
