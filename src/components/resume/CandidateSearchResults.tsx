import { useMemo, useState, type ReactNode } from 'react';
import { Mail, Phone, FileText, Lock, X, Clock, MapPin, Briefcase, GraduationCap, FolderGit2, Award, ChevronRight, type LucideIcon } from 'lucide-react';
import type { Candidate } from '@/types';
import { buildHighlightRegex, type CandidateMatch } from '@/lib/candidateSearch';
import { useSkin, FOCUS } from '@/styles/skin';
import Highlight from './Highlight';
import { getApplicationStatusInfo } from '@/lib/applicationStatus';
import ResumePreviewModal from './ResumePreviewModal';

interface CandidateSearchResultsProps {
    results: CandidateMatch[];
    keywords: string[];
    onSelectCandidate: (candidate: Candidate) => void;
    /** Single-profile mode: no keyword badge, not clickable, with a close button. */
    detail?: boolean;
    onClose?: () => void;
    /** Detail mode only: show email, phone and the resume (subscribers). */
    canViewContact?: boolean;
    onViewPlans?: () => void;
    /** Post applicants: show the pipeline status (Applied, Shortlisted, Interview Round n...). */
    showStatus?: boolean;
}

const toTitleCase = (s?: string) =>
    (s || '').split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

/**
 * Resume parsers and profile forms are not consistent: a "string" field can be a number,
 * a list or an object. Everything shown on a card goes through here so one odd record
 * can never crash the whole result list.
 */
function txt(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map(txt).filter(Boolean).join(', ');
    if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(txt).filter(Boolean).join(', ');
    return '';
}

const txtList = (value: unknown): string[] =>
    (Array.isArray(value) ? value : value ? [value] : []).map(txt).filter(Boolean);

/** Flattens projects, which arrive as a string, a list of strings or a list of objects. */
function projectLines(c: Candidate): { title: string; meta?: string; description?: string }[] {
    const raw = (c as unknown as { keyProjects?: unknown }).keyProjects ?? c.projects ?? c.extractedData?.projects;
    const lines: { title: string; meta?: string; description?: string }[] = [];
    if (typeof raw === 'string') {
        raw.split('\n').map((l) => l.trim()).filter(Boolean).forEach((title) => lines.push({ title }));
    } else if (Array.isArray(raw)) {
        raw.forEach((p) => {
            if (typeof p === 'string') lines.push({ title: p });
            else if (p && typeof p === 'object') {
                const o = p as { name?: unknown; title?: unknown; technologies?: unknown; description?: unknown };
                const title = txt(o.name) || txt(o.title);
                if (title) lines.push({ title, meta: txt(o.technologies), description: txt(o.description) });
            }
        });
    }
    (c.profileExtras?.projects ?? []).forEach((p) => lines.push({ title: txt(p.title), meta: txt(p.meta), description: txt(p.description) }));
    return lines;
}

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
    const skin = useSkin();
    return (
        <h4 className={`mb-2 flex items-center gap-1.5 ${skin.micro}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {children}
        </h4>
    );
}

/**
 * Keyword-search results. Each match is an enlarged card with the whole profile
 * (summary, skills, work, education, projects, certifications) and the keywords
 * highlighted wherever they occur.
 */
export default function CandidateSearchResults({ results, keywords, onSelectCandidate, detail = false, onClose, canViewContact = false, onViewPlans, showStatus = false }: CandidateSearchResultsProps) {
    const skin = useSkin();
    const [resumeUrl, setResumeUrl] = useState<string | null>(null);
    const regex = useMemo(() => buildHighlightRegex(keywords), [keywords]);
    const hl = (text: string) => <Highlight text={text} regex={regex} />;

    return (
        <ul className={detail ? 'h-full' : 'space-y-4'} aria-label="Matching candidates">
            {results.map(({ candidate: c }) => {
                const skills = txtList(c.skills?.length ? c.skills : c.extractedData?.skills);
                const asList = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
                const work = [
                    ...asList<Record<string, unknown>>(c.extractedData?.workExperience).map((w) => ({
                        title: [txt(w?.position), txt(w?.company)].filter(Boolean).join(' @ '),
                        meta: txt(w?.duration),
                        description: txt(w?.description),
                    })),
                    ...asList<Record<string, unknown>>(c.profileExtras?.experience).map((w) => ({
                        title: txt(w?.title),
                        meta: txt(w?.meta),
                        description: txt(w?.description),
                    })),
                ].filter((w) => w.title);
                const education = asList<Record<string, unknown>>(c.education?.length ? c.education : c.extractedData?.education).map((e) => ({
                    degree: txt(e?.degree),
                    field: txt(e?.field),
                    institution: txt(e?.institution),
                    year: txt(e?.year),
                }));
                const projects = projectLines(c);
                const certs = [
                    ...txtList(c.extractedData?.certifications).map((title) => ({ title, meta: '' })),
                    ...asList<Record<string, unknown>>(c.profileExtras?.certificates).map((x) => ({ title: txt(x?.title), meta: txt(x?.meta) })),
                ].filter((x) => x.title);
                const courses = txtList(c.profileExtras?.courses);
                const summary = txt(c.extractedData?.summary);
                const location = txt(c.profileExtras?.location);
                const experience = txt(c.experience);
                const role = txt(c.role);
                const name = txt(c.name);

                return (
                    <li key={c.id} className={detail ? 'h-full' : undefined}>
                        <article
                            {...(detail
                                ? {}
                                : {
                                    role: 'button',
                                    tabIndex: 0,
                                    onClick: () => onSelectCandidate(c),
                                    onKeyDown: (e: React.KeyboardEvent) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            onSelectCandidate(c);
                                        }
                                    },
                                })}
                            className={`group ${detail ? 'flex h-full flex-col overflow-hidden' : 'cursor-pointer'} border ${skin.edge} bg-surface ${skin.radius} p-4 sm:p-6 transition-colors duration-200 ${skin.cardHover} ${FOCUS}`}
                        >
                            {/* Header */}
                            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-4">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className={`${skin.cardTitle} break-words`}>{hl(toTitleCase(name))}</h3>
                                            {showStatus && (() => {
                                                const info = getApplicationStatusInfo(c.status || 'applied');
                                                return info ? (
                                                    <span className={`shrink-0 whitespace-nowrap rounded-lg border px-2 py-0.5 text-[10px] font-bold ${info.label === 'Selected' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-orange-300 bg-orange-50 text-orange-700'}`}>{info.label}</span>
                                                ) : null;
                                            })()}
                                        </div>
                                        {role && (
                                            <p className={`mt-1.5 flex items-center gap-1.5 ${skin.body}`}>
                                                <Briefcase className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                                <span>{hl(toTitleCase(role))}</span>
                                            </p>
                                        )}
                                        {experience && (
                                            <p className={`mt-1 flex items-center gap-1.5 ${skin.body}`}>
                                                <Clock className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                                <span>{hl(/^[\d.]+$/.test(experience) ? `${experience} yrs` : experience)}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {detail ? (
                                    onClose && (
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            aria-label="Close details"
                                            className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                                        >
                                            <X className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    )
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <ChevronRight className={`h-4 w-4 ${skin.subtle} group-hover:text-ink`} aria-hidden="true" />
                                    </div>
                                )}
                            </div>

                            {/* Contact */}
                            <div className={`${detail ? 'mt-1 shrink-0' : 'mt-4'} flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-ink/70`}>
                                {detail && canViewContact && txt(c.email) && (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Mail className="h-3.5 w-3.5 text-ink/40" aria-hidden="true" />
                                        {txt(c.email)}
                                    </span>
                                )}
                                {detail && canViewContact && txt(c.phone) && (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Phone className="h-3.5 w-3.5 text-ink/40" aria-hidden="true" />
                                        {txt(c.phone)}
                                    </span>
                                )}
                                {location && (
                                    <span className="inline-flex items-center gap-1.5">
                                        <MapPin className="h-3.5 w-3.5 text-ink/40" aria-hidden="true" />
                                        {hl(location)}
                                    </span>
                                )}
                            </div>

                            {detail && (
                                <div className="mt-3 flex shrink-0 flex-col items-start gap-2">
                                    {canViewContact ? (
                                        c.resumeUrl && (
                                            <button
                                                type="button"
                                                onClick={() => setResumeUrl(c.resumeUrl as string)}
                                                className={`inline-flex items-center gap-1.5 cursor-pointer rounded-lg ${skin.secondary} ${FOCUS}`}
                                            >
                                                <FileText className="h-4 w-4" aria-hidden="true" />
                                                Resume
                                            </button>
                                        )
                                    ) : (
                                        <>
                                            <span className={`inline-flex items-center gap-1.5 ${skin.meta}`}>
                                                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                                Subscribe to view contact details and resume
                                            </span>
                                            {onViewPlans && (
                                                <button
                                                    type="button"
                                                    onClick={onViewPlans}
                                                    className={`ml-5 cursor-pointer rounded-md border border-black bg-transparent px-2.5 py-0.5 text-xs font-semibold text-black transition-colors duration-200 hover:bg-black/5 ${FOCUS}`}
                                                >
                                                    View plans
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}

                            <div className={detail ? 'thin-scrollbar mt-1 min-h-0 flex-1 overflow-y-auto pr-1' : undefined}>
                            {summary && <p className={`mt-4 ${skin.body}`}>{hl(summary)}</p>}

                            {skills.length > 0 && (
                                <div className="mt-4">
                                    <p className={`mb-2 ${skin.micro}`}>Skills</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {skills.map((skill, i) => (
                                            <span key={`${skill}-${i}`} className="rounded-lg bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink/80">
                                                {hl(skill)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {courses.length > 0 && (
                                <div className="mt-4">
                                    <p className={`mb-2 ${skin.micro}`}>Courses completed</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {courses.map((course, i) => (
                                            <span key={`${course}-${i}`} className="rounded-lg bg-ink/5 px-2.5 py-1 text-xs font-medium text-ink/80">
                                                {hl(course)}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Two independent columns, so a tall Education list never leaves a gap under Experience. */}
                            <div className={`mt-5 grid grid-cols-1 gap-x-8 gap-y-5 ${detail ? '' : 'lg:grid-cols-2 lg:items-start'}`}>
                                <div className="space-y-5 empty:hidden">
                                    {work.length > 0 && (
                                        <section>
                                            <SectionTitle icon={Briefcase}>Experience</SectionTitle>
                                            <ul className="space-y-3">
                                                {work.map((w, i) => (
                                                    <li key={i} className="border-l-2 border-brand/40 pl-3">
                                                        <p className="text-sm font-semibold text-ink">{hl(w.title)}</p>
                                                        {w.meta && <p className={skin.meta}>{w.meta}</p>}
                                                        {w.description && <p className={`mt-0.5 line-clamp-3 ${skin.body}`}>{hl(w.description)}</p>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}

                                    {projects.length > 0 && (
                                        <section>
                                            <SectionTitle icon={FolderGit2}>Projects</SectionTitle>
                                            <ul className="space-y-3">
                                                {projects.map((p, i) => (
                                                    <li key={i} className="border-l-2 border-brand/40 pl-3">
                                                        <p className="text-sm font-semibold text-ink">{hl(p.title)}</p>
                                                        {p.meta && <p className={skin.meta}>{hl(p.meta)}</p>}
                                                        {p.description && <p className={`mt-0.5 line-clamp-3 ${skin.body}`}>{hl(p.description)}</p>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}
                                </div>

                                <div className="space-y-5 empty:hidden">
                                    {education.length > 0 && (
                                        <section>
                                            <SectionTitle icon={GraduationCap}>Education</SectionTitle>
                                            <ul className="space-y-3">
                                                {education.map((e, i) => (
                                                    <li key={i} className="border-l-2 border-brand/40 pl-3">
                                                        <p className="text-sm font-semibold text-ink">
                                                            {hl([e.degree, e.field].filter(Boolean).join(' in '))}
                                                        </p>
                                                        <p className={skin.body}>{hl(e.institution)}</p>
                                                        {e.year && <p className={skin.meta}>{e.year}</p>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}

                                    {certs.length > 0 && (
                                        <section>
                                            <SectionTitle icon={Award}>Certifications</SectionTitle>
                                            <ul className="space-y-3">
                                                {certs.map((x, i) => (
                                                    <li key={i} className="border-l-2 border-brand/40 pl-3">
                                                        <p className="text-sm font-semibold text-ink">{hl(x.title)}</p>
                                                        {x.meta && <p className={skin.meta}>{hl(x.meta)}</p>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </section>
                                    )}

                                </div>
                            </div>
                            </div>
                        </article>
                        {resumeUrl && <ResumePreviewModal url={resumeUrl} onClose={() => setResumeUrl(null)} />}
                    </li>
                );
            })}
        </ul>
    );
}
