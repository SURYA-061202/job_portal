import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Briefcase, MapPin, Clock, Users } from 'lucide-react';
import type { RecruitmentRequest } from '@/types';
import { timeAgo } from '@/lib/format';
import { useSkin, FOCUS } from '@/styles/skin';

export interface StagePostItem {
    post: RecruitmentRequest;
    /** Candidates at this stage for the post. */
    count: number;
    /** Optional small note shown before the count, e.g. "4 rounds". */
    note?: string;
    /** Skills shown as chips on plain cards. */
    skills?: string[];
}

interface PostStageListProps {
    title: string;
    items: StagePostItem[];
    /** Singular noun for the count pill, e.g. "candidate". */
    countNoun?: string;
    loading: boolean;
    search: string;
    onSearch: (value: string) => void;
    onOpen: (post: RecruitmentRequest) => void;
    emptyTitle: string;
    emptyText: string;
    /** Shortlisted style: no initial tile, no level tag, the count badge at the far right of the card. */
    plain?: boolean;
    /** Post currently open beside the list; its card is highlighted. */
    selectedId?: string | null;
    /** When set, the list becomes a narrow column and this fills the area to its right. */
    detail?: ReactNode;
    /** Extra controls (e.g. a tab switch) shown beside the search. */
    actions?: ReactNode;
}

/**
 * Stage screens (Shortlisted, Interview) list their posts as cards, each led
 * by a big tile with the number of candidates at this stage.
 */
/** "+N" chip; hover shows every skill in a popup rendered outside the card so it is never clipped. */
function MoreSkills({ skills }: { skills: string[] }) {
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    const show = (e: { currentTarget: HTMLElement }) => {
        const r = e.currentTarget.getBoundingClientRect();
        setPos({ x: Math.min(r.left, window.innerWidth - 240), y: r.top });
    };
    return (
        <span onMouseEnter={show} onMouseLeave={() => setPos(null)} className="cursor-default rounded-md px-1 py-0.5 text-[10px] font-medium text-ink/50 hover:bg-border">
            +{skills.length - 4}
            {pos && createPortal(
                <div role="tooltip" style={{ left: Math.max(8, pos.x), top: pos.y - 8, transform: 'translateY(-100%)' }}
                    className="pointer-events-none fixed z-[100] flex w-56 flex-wrap gap-1 rounded-xl border border-border bg-surface p-2.5 shadow-lg">
                    {skills.map((k) => (
                        <span key={k} className="rounded-md bg-border px-1.5 py-0.5 text-[10px] font-medium text-ink/80">{k}</span>
                    ))}
                </div>, document.body)}
        </span>
    );
}

export default function PostStageList({ title, items, countNoun = 'candidate', loading, search, onSearch, onOpen, emptyTitle, emptyText, plain = false, selectedId, detail, actions }: PostStageListProps) {
    const skin = useSkin();

    return (
        <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} flex-1 min-h-0 flex flex-col`}>
            <div className="mb-5 flex shrink-0 flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-ink">{title}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                {actions}
                <div className="relative w-full sm:w-52">
                    <label htmlFor={`stage-search-${title}`} className="sr-only">Search posts</label>
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Search className="h-4 w-4 text-ink/40" aria-hidden="true" />
                    </div>
                    <input
                        id={`stage-search-${title}`}
                        type="text"
                        placeholder="Search"
                        value={search}
                        onChange={(e) => onSearch(e.target.value)}
                        className={`block h-9 w-full rounded-lg border border-ink/20 bg-surface pl-10 pr-9 text-sm text-ink shadow-sm transition-colors placeholder:text-ink/40 hover:border-ink/40 ${FOCUS}`}
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => onSearch('')}
                            aria-label="Clear search"
                            className={`absolute inset-y-0 right-0 my-auto mr-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    )}
                </div>
                </div>
            </div>

            <div className={detail ? 'flex min-h-0 flex-1 flex-col gap-4 lg:flex-row' : 'flex min-h-0 flex-1 flex-col'}>
            <div className={`min-h-0 overflow-y-auto scrollbar-hide ${detail ? 'max-h-64 shrink-0 lg:max-h-none lg:w-80' : 'flex-1'}`}>
                {loading ? (
                    <div role="status" aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        <span className="sr-only">Loading posts…</span>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} aria-hidden="true" className={`flex animate-pulse gap-4 border ${skin.edge} bg-surface ${skin.radius} p-4`}>
                                <div className={`h-16 w-16 shrink-0 ${skin.skeleton}`} />
                                <div className="flex-1 space-y-2">
                                    <div className={`h-4 w-2/3 ${skin.skeleton}`} />
                                    <div className={`h-3 w-1/2 ${skin.skeleton}`} />
                                    <div className={`h-3 w-1/3 ${skin.skeleton}`} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : items.length === 0 ? (
                    <div className={`flex flex-col items-center justify-center border ${skin.edge} bg-surface ${skin.radius} px-6 py-16 text-center`}>
                        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink/5 text-ink/50" aria-hidden="true">
                            <Briefcase className="h-6 w-6" />
                        </span>
                        <h3 className={skin.emptyTitle}>{search ? 'No matching posts' : emptyTitle}</h3>
                        <p className={`mt-1 max-w-sm ${skin.body}`}>{search ? 'Try a different title, department or location.' : emptyText}</p>
                    </div>
                ) : (
                    <ul className={detail ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
                        {items.map(({ post, count, note, skills }) => (
                            <li key={post.id}>
                                {plain ? (
                                <button
                                    type="button"
                                    onClick={() => onOpen(post)}
                                    aria-label={`Open ${post.jobTitle}`}
                                    aria-pressed={selectedId === post.id}
                                    className={`group flex h-full w-full cursor-pointer flex-col border bg-surface ${skin.radius} p-4 text-left transition-colors duration-200 ${selectedId === post.id ? 'border-ink bg-ink/5' : `${skin.edge} hover:border-ink/40`} ${FOCUS}`}
                                >
                                    <span className="flex items-start justify-between gap-3">
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-semibold text-ink">{post.jobTitle}</span>
                                            {post.department && <span className={`block truncate ${skin.meta}`}>{post.department}</span>}
                                        </span>
                                    </span>
                                    <span className={`mt-4 block space-y-1.5 ${skin.body}`}>
                                        <span className="flex min-w-0 items-center gap-2">
                                            <MapPin className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                            <span className="truncate">{post.location || '-'}</span>
                                        </span>
                                        <span className="flex items-center gap-2">
                                            <Clock className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                            <span>{timeAgo(post.createdAt)}</span>
                                        </span>
                                    </span>
                                    {skills && skills.length > 0 && (
                                        <span className="mt-3 flex flex-wrap gap-1">
                                            {skills.slice(0, 4).map((k) => (
                                                <span key={k} className="rounded-md bg-border px-1.5 py-0.5 text-[10px] font-medium text-ink/80">{k}</span>
                                            ))}
                                            {skills.length > 4 && <MoreSkills skills={skills} />}
                                        </span>
                                    )}
                                    <span className="mt-3 flex justify-end">
                                        <span className="inline-flex items-center gap-1 rounded-lg bg-border px-2 py-1 text-xs font-bold text-ink/80">
                                            <Users className="h-3 w-3" aria-hidden="true" />{count} {count === 1 ? countNoun : `${countNoun}s`}
                                        </span>
                                    </span>
                                </button>
                                ) : (
                                <button
                                    type="button"
                                    onClick={() => onOpen(post)}
                                    aria-label={`Open ${post.jobTitle}`}
                                    className={`group flex h-full w-full cursor-pointer flex-col border ${skin.edge} bg-surface ${skin.radius} p-4 text-left transition-colors duration-200 hover:border-ink/40 ${FOCUS}`}
                                >
                                    <span className="flex items-center gap-3">
                                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink/5 text-base font-bold text-ink/70" aria-hidden="true">
                                            {(post.jobTitle || '?').charAt(0).toUpperCase()}
                                        </span>
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-semibold text-ink">{post.jobTitle}</span>
                                            {post.department && <span className={`block truncate ${skin.meta}`}>{post.department}</span>}
                                        </span>
                                    </span>

                                    <span className={`mt-4 block space-y-1.5 ${skin.body}`}>
                                        <span className="flex min-w-0 items-center gap-2">
                                            <MapPin className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                            <span className="truncate">{post.location || '-'}</span>
                                        </span>
                                        <span className="flex items-center gap-2">
                                            <Clock className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                            <span>{timeAgo(post.createdAt)}</span>
                                        </span>
                                    </span>

                                    <span className="mt-4 flex flex-1 flex-wrap items-end gap-1.5">
                                        <span className="inline-flex items-center gap-1 rounded-lg bg-border px-2 py-1 text-xs font-medium text-ink/70">
                                            <Users className="h-3 w-3" aria-hidden="true" />{count} {count === 1 ? countNoun : `${countNoun}s`}
                                        </span>
                                        {post.positionLevel && (
                                            <span className="rounded-lg bg-border px-2 py-1 text-xs font-medium text-ink/70">{post.positionLevel}</span>
                                        )}
                                        {note && <span className="rounded-lg bg-border px-2 py-1 text-xs font-medium text-ink/70">{note}</span>}
                                    </span>
                                </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {detail}
            </div>
        </div>
    );
}
