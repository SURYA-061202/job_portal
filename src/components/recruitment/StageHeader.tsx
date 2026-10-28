import type { ReactNode } from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';

interface StageHeaderProps {
    title: string;
    /** Small line under the title, e.g. a candidate count. */
    subtitle?: string;
    /** Shows the square back arrow before the title when given. */
    onBack?: () => void;
    backLabel?: string;
    search: string;
    onSearch: (value: string) => void;
    searchLabel?: string;
    /** Extra controls (filters, toggles) placed after the search box. */
    children?: ReactNode;
}

/** Title row shared by the stage screens: [back] title on the left, search and filters on the right. */
export default function StageHeader({ title, subtitle, onBack, backLabel = 'Back to posts', search, onSearch, searchLabel = 'Search', children }: StageHeaderProps) {
    const skin = useSkin();
    return (
        <div className="mb-5 flex shrink-0 flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
                {onBack && (
                    <button
                        type="button"
                        onClick={onBack}
                        aria-label={backLabel}
                        title={backLabel}
                        className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border ${skin.edge} bg-surface text-ink/70 shadow-sm transition-colors duration-200 hover:border-ink/40 hover:text-ink ${FOCUS}`}
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
                <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold text-ink">{title}</h2>
                    {subtitle && <p role="status" aria-atomic="true" className={`mt-0.5 ${skin.meta}`}>{subtitle}</p>}
                </div>
            </div>
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                <div className="relative w-full sm:w-52">
                    <label htmlFor="stage-candidate-search" className="sr-only">{searchLabel}</label>
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                        <Search className="h-4 w-4 text-ink/40" aria-hidden="true" />
                    </div>
                    <input
                        id="stage-candidate-search"
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
                {children}
            </div>
        </div>
    );
}
