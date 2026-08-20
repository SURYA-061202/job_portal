interface FilterSidebarProps {
    selectedFilters: Record<string, string[]>;
    onToggleFilter: (section: string, option: string) => void;
    onClearFilters?: () => void;
}

export default function FilterSidebar({ selectedFilters, onToggleFilter, onClearFilters }: FilterSidebarProps) {
    const filterSections = [
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
                { label: "Entry Level", value: "Entry Level" },
                { label: "Mid Level", value: "Mid Level" },
                { label: "Senior Level", value: "Senior Level" },
                { label: "Director", value: "Director" }
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

    const hasActiveFilters = Object.values(selectedFilters).some(arr => arr.length > 0);

    return (
        <div>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-5">
                {hasActiveFilters && onClearFilters && (
                    <div className="flex justify-end mb-3">
                        <button
                            onClick={onClearFilters}
                            className="px-3 py-1.5 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                            title="Clear all filters"
                        >
                            Clear
                        </button>
                    </div>
                )}

                {filterSections.map((section, idx) => (
                    <div key={idx} className={`${idx !== filterSections.length - 1 ? 'mb-5' : ''}`}>
                        <h4 className="text-[10px] md:text-xs font-bold text-gray-900 mb-2.5 uppercase tracking-wider">{section.title}</h4>
                        <div className="space-y-2.5">
                            {section.options.map((option, optIdx) => {
                                const optionValue = typeof option === 'string' ? option : option.value;
                                const optionLabel = typeof option === 'string' ? option : option.label;

                                return (
                                    <label key={optIdx} className="flex items-center group cursor-pointer">
                                        <div className="relative flex items-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedFilters[section.key]?.includes(optionValue)}
                                                onChange={() => onToggleFilter(section.key, optionValue)}
                                                className="peer h-4 w-4 md:h-5 md:w-5 cursor-pointer appearance-none rounded border-2 border-gray-200 transition-all checked:border-brand checked:bg-brand group-hover:border-brand/30"
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
                                        <span className="ml-3 text-[11px] md:text-sm font-medium text-gray-500 group-hover:text-gray-900 transition-colors">
                                            {optionLabel}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
