import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';

/** Options each section shows inline; the rest live behind "View all". */
const VISIBLE_OPTIONS = 4;

/** Quick-pick cities, always listed above the search box. */
const LOCATION_PRESETS = ['Chennai', 'Bangalore', 'Hyderabad'];

/** Everything else the city search can surface. */
const OTHER_CITIES = [
    'Ahmedabad', 'Aurangabad', 'Bhopal', 'Bhubaneswar', 'Chandigarh', 'Coimbatore',
    'Dehradun', 'Faridabad', 'Ghaziabad', 'Gurugram', 'Guwahati', 'Indore',
    'Jaipur', 'Kanpur', 'Kochi', 'Kolkata', 'Lucknow', 'Madurai',
    'Mangaluru', 'Mohali', 'Mysuru', 'Nagpur', 'Nashik', 'Navi Mumbai',
    'New Delhi', 'Noida', 'Patna', 'Raipur', 'Ranchi', 'Salem',
    'Surat', 'Thane', 'Thiruvananthapuram', 'Tiruchirappalli', 'Vadodara', 'Varanasi',
    'Vijayawada', 'Visakhapatnam'
];

export interface FilterOption {
    label: string;
    value: string;
    /** Shown right-aligned when present (candidate facet counts). */
    count?: number;
}

export interface FilterSection {
    title: string;
    key: string;
    options: FilterOption[];
    /** Renders a search box under the options. */
    searchable?: boolean;
    searchPlaceholder?: string;
    /** Extra rows the search box can surface (the jobs city list + free-form add). */
    searchResults?: FilterOption[];
    /** Allows an "Add ..." row for values outside the list (jobs cities). */
    allowCustom?: boolean;
    /** Shows at most N options; selected ones are always kept visible. */
    maxOptions?: number;
}

interface FilterSidebarProps {
    /** Sections to render; defaults to the job-post filters when omitted. */
    sections?: FilterSection[];
    selectedFilters: Record<string, string[]>;
    onToggleFilter: (section: string, option: string) => void;
    onClearFilters?: () => void;
}

function FilterCheck({ label, count, checked, onChange }: { label: string; count?: number; checked: boolean; onChange: () => void }) {
    const skin = useSkin();
    return (
        <label className="flex w-full items-center group cursor-pointer">
            <div className="relative flex items-center">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={onChange}
                    className={`peer h-4 w-4 md:h-5 md:w-5 cursor-pointer appearance-none rounded border-2 ${skin.edge} transition-all checked:border-brand checked:bg-brand group-hover:border-brand/30 ${FOCUS}`}
                />
                <svg
                    className="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 md:h-3.5 md:w-3.5 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 transition-opacity peer-checked:opacity-100"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <polyline points="20 6 9 17 4 12" />
                </svg>
            </div>
            <span
                className="ml-3 min-w-0 flex-1 truncate text-[11px] md:text-sm font-medium text-ink/60 group-hover:text-ink transition-colors"
                title={label}
            >
                {label}
            </span>
            {count !== undefined && (
                <span className="shrink-0 pl-2 text-[11px] tabular-nums text-ink/40" aria-hidden="true">{count}</span>
            )}
        </label>
    );
}

export default function FilterSidebar({ sections: customSections, selectedFilters, onToggleFilter, onClearFilters }: FilterSidebarProps) {
    const skin = useSkin();
    // One search box per section, so several sections can be searchable at once.
    const [queries, setQueries] = useState<Record<string, string>>({});
    const setQuery = (key: string, value: string) => setQueries(prev => ({ ...prev, [key]: value }));
    // "View all" modal: which section is open, and the search typed inside it.
    const [modalKey, setModalKey] = useState<string | null>(null);
    const [modalQuery, setModalQuery] = useState('');

    const openModal = (key: string) => {
        setModalKey(key);
        setModalQuery('');
    };
    const closeModal = () => setModalKey(null);

    useEffect(() => {
        if (!modalKey) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') closeModal();
        };
        window.addEventListener('keydown', onKeyDown);
        // Keep the page behind the modal still.
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [modalKey]);

    const baseSections: FilterSection[] = [
        {
            title: "Job Type",
            key: "jobType",
            options: [
                { label: "Full Time", value: "Permanent" },
                { label: "Part Time", value: "Part Time" },
                { label: "Contract", value: "Contract" },
                { label: "Internship", value: "Internship" }
            ]
        },
        {
            title: "Experience Level",
            key: "experience",
            options: [
                { label: "Entry", value: "Entry" },
                { label: "Junior", value: "Junior" },
                { label: "Mid", value: "Mid" },
                { label: "Senior", value: "Senior" },
                { label: "Manager", value: "Manager" }
            ]
        },
        {
            title: "Salary Range",
            key: "salary",
            options: [
                { label: "0-5 LPA", value: "0-5 LPA" },
                { label: "5-10 LPA", value: "5-10 LPA" },
                { label: "10-20 LPA", value: "10-20 LPA" },
                { label: "20+ LPA", value: "20+ LPA" }
            ]
        }
    ];

    // Presets first, then any city picked from the search box so it stays
    // visible once the query is cleared.
    const selectedCities = selectedFilters.location || [];
    const locationQueryRaw = queries.location ?? '';
    const locationQuery = locationQueryRaw.trim();
    const locationOptions: FilterOption[] = [
        ...LOCATION_PRESETS.map(city => ({ label: city, value: city })),
        ...selectedCities
            .filter(city => !LOCATION_PRESETS.some(preset => preset.toLowerCase() === city.toLowerCase()))
            .map(city => ({ label: city, value: city }))
    ];

    // Search results: whatever the city list matches under the query, or a
    // free-form row when the typed town is not in the list at all.
    let locationSearchResults: FilterOption[] = [];
    if (locationQuery) {
        const lowerQuery = locationQuery.toLowerCase();
        locationSearchResults = [...LOCATION_PRESETS, ...OTHER_CITIES]
            .filter(city => city.toLowerCase().includes(lowerQuery))
            .map(city => ({ label: city, value: city }))
            .slice(0, 8);

        const alreadyKnown = [...LOCATION_PRESETS, ...selectedCities]
            .some(city => city.toLowerCase() === lowerQuery);
        if (locationSearchResults.length === 0 && !alreadyKnown) {
            locationSearchResults = [{ label: `Add "${locationQuery}"`, value: locationQuery }];
        }
    }

    const defaultSections: FilterSection[] = [
        ...baseSections,
        {
            title: "Location",
            key: "location",
            options: locationOptions,
            searchable: true,
            searchPlaceholder: "Search other cities",
            searchResults: locationSearchResults,
            allowCustom: true
        }
    ];

    const filterSections = customSections ?? defaultSections;

    const hasActiveFilters = Object.values(selectedFilters).some(arr => arr.length > 0);

    const isChecked = (sectionKey: string, option: FilterOption) =>
        selectedFilters[sectionKey]?.includes(option.value) || false;

    /** Options shown in the main list: the first cap in their usual order, so a
     *  picked option never jumps to the top. A selected option beyond the cap is
     *  appended instead of reordered, keeping every choice visible in place. */
    const visibleMainOptions = (section: FilterSection) => {
        const query = (queries[section.key] ?? '').trim();
        // The jobs city list keeps its full list on screen while typing and
        // surfaces matches below the box; other sections swap to matches only.
        if (query && !section.allowCustom) return [];
        const cap = section.maxOptions ?? VISIBLE_OPTIONS;
        if (!query) {
            const shown = section.options.slice(0, cap);
            const shownValues = new Set(shown.map(option => option.value));
            const selectedBeyond = section.options.filter(
                option => isChecked(section.key, option) && !shownValues.has(option.value)
            );
            return selectedBeyond.length > 0 ? [...shown, ...selectedBeyond] : shown;
        }
        return section.options;
    };

    /** Rows under the search box: the jobs city results, or matches for this section. */
    const searchResultsFor = (section: FilterSection): FilterOption[] => {
        const query = (queries[section.key] ?? '').trim().toLowerCase();
        if (!query) return [];
        if (section.searchResults) return section.searchResults;
        return section.options.filter(option => option.label.toLowerCase().includes(query)).slice(0, 8);
    };

    const modalSection = modalKey ? filterSections.find(section => section.key === modalKey) ?? null : null;
    /** Every option of the section in its usual order, narrowed by the modal's own search (rows never reorder while ticking). */
    const modalOptions: FilterOption[] = (() => {
        if (!modalSection) return [];
        const query = modalQuery.trim().toLowerCase();
        if (!query) return modalSection.options;
        return modalSection.options.filter(option => option.label.toLowerCase().includes(query));
    })();

    return (
        <div>
            <div className={`border ${skin.edge} ${skin.surface} rounded-lg p-4 md:p-5`}>
                {hasActiveFilters && onClearFilters && (
                    <div className="flex justify-end mb-3">
                        <button
                            onClick={() => {
                                setQueries({});
                                onClearFilters();
                            }}
                            className={`px-3 py-1.5 text-xs font-bold border border-destructive bg-surface text-destructive rounded-lg cursor-pointer transition-colors duration-200 hover:bg-destructive/10 ${FOCUS}`}
                            title="Clear all filters"
                        >
                            Clear
                        </button>
                    </div>
                )}

                {filterSections.map((section, idx) => {
                    const query = (queries[section.key] ?? '').trim();
                    const mainOptions = visibleMainOptions(section);
                    const results = section.searchable && query ? searchResultsFor(section) : [];
                    const cap = section.maxOptions ?? VISIBLE_OPTIONS;
                    const showViewAll = !query && section.options.length > cap;
                    return (
                        <div key={section.key} className={`${idx !== filterSections.length - 1 ? 'mb-5' : ''}`}>
                            <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ink">{section.title}</h4>
                            <div className="space-y-2.5">
                                {mainOptions.map((option) => (
                                    <FilterCheck
                                        key={`${section.key}-${option.value}`}
                                        label={option.label}
                                        count={option.count}
                                        checked={isChecked(section.key, option)}
                                        onChange={() => onToggleFilter(section.key, option.value)}
                                    />
                                ))}
                            </div>
                            {showViewAll && (
                                <button
                                    type="button"
                                    onClick={() => openModal(section.key)}
                                    className={`mt-2 cursor-pointer text-xs font-semibold text-brand transition-colors duration-200 hover:underline ${FOCUS}`}
                                >
                                    View all ({section.options.length})
                                </button>
                            )}

                            {section.searchable && (
                                <div className="mt-3">
                                    <div className="relative">
                                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink/40" />
                                        <input
                                            type="text"
                                            value={queries[section.key] ?? ''}
                                            onChange={(event) => setQuery(section.key, event.target.value)}
                                            placeholder={section.searchPlaceholder ?? 'Search'}
                                            aria-label={section.searchPlaceholder ?? `Search ${section.title}`}
                                            className={`w-full pl-9 pr-3 py-2 text-xs md:text-sm bg-surface border ${skin.edge} rounded-lg text-ink placeholder:text-ink/40 focus:outline-none ${FOCUS}`}
                                        />
                                    </div>
                                    {results.length > 0 && (
                                        <div className="space-y-2.5 mt-2.5">
                                            {results.map((option) => (
                                                <FilterCheck
                                                    key={`search-${option.value}`}
                                                    label={option.label}
                                                    count={option.count}
                                                    checked={isChecked(section.key, option)}
                                                    onChange={() => onToggleFilter(section.key, option.value)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* "View all": every option of one section, with its own search for long lists.
                Portaled to <body> so the sticky sidebar's stacking context can't
                trap the overlay under the results table. */}
            {modalSection && createPortal(
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label={`All ${modalSection.title} options`}
                >
                    <div className="absolute inset-0 bg-black/40" onClick={closeModal} aria-hidden="true" />
                    <div className={`relative flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border shadow-xl ${skin.edge} ${skin.surface}`}>
                        <div className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${skin.edge}`}>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink">{modalSection.title}</h4>
                            <button
                                type="button"
                                onClick={closeModal}
                                aria-label="Close"
                                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                        {/* The sidebar carries no search of its own any more, so the
                            modal does whenever the list is longer than the panel shows. */}
                        {modalSection.options.length > (modalSection.maxOptions ?? VISIBLE_OPTIONS) && (
                            <div className="shrink-0 px-4 pt-3">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink/40" />
                                    <input
                                        type="text"
                                        value={modalQuery}
                                        onChange={(event) => setModalQuery(event.target.value)}
                                        placeholder={`Search ${modalSection.title.toLowerCase()}`}
                                        aria-label={`Search ${modalSection.title.toLowerCase()}`}
                                        className={`w-full rounded-lg border bg-surface py-2 pl-9 pr-3 text-xs text-ink placeholder:text-ink/40 focus:outline-none md:text-sm ${skin.edge} ${FOCUS}`}
                                    />
                                </div>
                            </div>
                        )}
                        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4 thin-scrollbar">
                            {modalOptions.length === 0 ? (
                                <p className="text-sm text-ink/50">No options match.</p>
                            ) : (
                                modalOptions.map((option) => (
                                    <FilterCheck
                                        key={`${modalSection.key}-${option.value}`}
                                        label={option.label}
                                        count={option.count}
                                        checked={isChecked(modalSection.key, option)}
                                        onChange={() => onToggleFilter(modalSection.key, option.value)}
                                    />
                                ))
                            )}
                        </div>
                        <div className={`shrink-0 border-t p-3 ${skin.edge}`}>
                            <button
                                type="button"
                                onClick={closeModal}
                                className={`w-full cursor-pointer rounded-lg py-2 text-sm font-semibold ${skin.cta} ${FOCUS}`}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
