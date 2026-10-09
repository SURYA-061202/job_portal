import { useState } from 'react';
import { Search } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';

interface FilterSidebarProps {
    selectedFilters: Record<string, string[]>;
    onToggleFilter: (section: string, option: string) => void;
    onClearFilters?: () => void;
}

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

interface FilterOption {
    label: string;
    value: string;
}

interface FilterSection {
    title: string;
    key: string;
    options: FilterOption[];
    /** Renders the "search other cities" box under the options. */
    searchable?: boolean;
    searchResults?: FilterOption[];
}

function FilterCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
    const skin = useSkin();
    return (
        <label className="flex items-center group cursor-pointer">
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
            <span className="ml-3 text-[11px] md:text-sm font-medium text-ink/60 group-hover:text-ink transition-colors">
                {label}
            </span>
        </label>
    );
}

export default function FilterSidebar({ selectedFilters, onToggleFilter, onClearFilters }: FilterSidebarProps) {
    const skin = useSkin();
    const [cityQuery, setCityQuery] = useState('');

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
    const locationOptions: FilterOption[] = [
        ...LOCATION_PRESETS.map(city => ({ label: city, value: city })),
        ...selectedCities
            .filter(city => !LOCATION_PRESETS.some(preset => preset.toLowerCase() === city.toLowerCase()))
            .map(city => ({ label: city, value: city }))
    ];

    // Search results: whatever the city list matches under the query, or a
    // free-form row when the typed town is not in the list at all.
    const query = cityQuery.trim();
    let searchResults: FilterOption[] = [];
    if (query) {
        const lowerQuery = query.toLowerCase();
        searchResults = [...LOCATION_PRESETS, ...OTHER_CITIES]
            .filter(city => city.toLowerCase().includes(lowerQuery))
            .map(city => ({ label: city, value: city }))
            .slice(0, 8);

        const alreadyKnown = [...LOCATION_PRESETS, ...selectedCities]
            .some(city => city.toLowerCase() === lowerQuery);
        if (searchResults.length === 0 && !alreadyKnown) {
            searchResults = [{ label: `Add "${query}"`, value: query }];
        }
    }

    const filterSections: FilterSection[] = [
        ...baseSections,
        {
            title: "Location",
            key: "location",
            options: locationOptions,
            searchable: true,
            searchResults
        }
    ];

    const hasActiveFilters = Object.values(selectedFilters).some(arr => arr.length > 0);

    return (
        <div>
            <div className={`border ${skin.edge} ${skin.surface} rounded-lg p-4 md:p-5`}>
                {hasActiveFilters && onClearFilters && (
                    <div className="flex justify-end mb-3">
                        <button
                            onClick={onClearFilters}
                            className={`px-3 py-1.5 text-xs font-bold border border-destructive bg-surface text-destructive rounded-lg cursor-pointer transition-colors duration-200 hover:bg-destructive/10 ${FOCUS}`}
                            title="Clear all filters"
                        >
                            Clear
                        </button>
                    </div>
                )}

                {filterSections.map((section, idx) => (
                    <div key={idx} className={`${idx !== filterSections.length - 1 ? 'mb-5' : ''}`}>
                        <h4 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ink">{section.title}</h4>
                        <div className="space-y-2.5">
                            {section.options.map((option, optIdx) => (
                                <FilterCheck
                                    key={`${section.key}-${optIdx}`}
                                    label={option.label}
                                    checked={selectedFilters[section.key]?.includes(option.value) || false}
                                    onChange={() => onToggleFilter(section.key, option.value)}
                                />
                            ))}
                        </div>

                        {section.searchable && (
                            <div className="mt-3">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink/40" />
                                    <input
                                        type="text"
                                        value={cityQuery}
                                        onChange={(event) => setCityQuery(event.target.value)}
                                        placeholder="Search other cities"
                                        aria-label="Search other cities"
                                        className={`w-full pl-9 pr-3 py-2 text-xs md:text-sm bg-surface border ${skin.edge} rounded-lg text-ink placeholder:text-ink/40 focus:outline-none ${FOCUS}`}
                                    />
                                </div>
                                {section.searchResults && section.searchResults.length > 0 && (
                                    <div className="space-y-2.5 mt-2.5">
                                        {section.searchResults.map((option, optIdx) => (
                                            <FilterCheck
                                                key={`search-${optIdx}`}
                                                label={option.label}
                                                checked={selectedFilters[section.key]?.includes(option.value) || false}
                                                onChange={() => onToggleFilter(section.key, option.value)}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
