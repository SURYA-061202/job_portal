import type { Candidate } from '@/types';

/** Facet selection for the Candidates tab: section key -> selected option values. */
export type SelectedFilters = Record<string, string[]>;

export interface CandidateFilterOption {
    label: string;
    /** Normalized value the predicate matches on (lowercase). */
    value: string;
    count: number;
}

export interface CandidateFilterSection {
    title: string;
    key: string;
    options: CandidateFilterOption[];
}

const norm = (value: unknown): string => String(value ?? '').trim().toLowerCase();

/** First number in a free-text experience field ("3", "3 years", "Fresher"). */
export function parseExperienceYears(raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;
    const match = String(raw).match(/\d+(?:\.\d+)?/);
    if (!match) return null;
    const years = Number(match[0]);
    return Number.isFinite(years) ? years : null;
}

/** Buckets shown in the Experience filter section. */
export const EXPERIENCE_BUCKETS: { value: string; label: string }[] = [
    { value: '0-1', label: '0-1 yr' },
    { value: '1-3', label: '1-3 yrs' },
    { value: '3-5', label: '3-5 yrs' },
    { value: '5-10', label: '5-10 yrs' },
    { value: '10+', label: '10+ yrs' },
    { value: 'unknown', label: 'Not specified' }
];

export function experienceBucket(raw: unknown): string {
    const years = parseExperienceYears(raw);
    if (years === null) return 'unknown';
    if (years <= 1) return '0-1';
    if (years <= 3) return '1-3';
    if (years <= 5) return '3-5';
    if (years <= 10) return '5-10';
    return '10+';
}

/** City spelled either way counts as the same place ("Bangalore" = "Bengaluru"). */
const CITY_ALIASES: Record<string, string> = { bengaluru: 'bangalore' };

/** First segment of the location string ("Chennai, Tamilnadu" -> "chennai"). */
export function candidateCity(candidate: Candidate): { key: string; label: string } | null {
    const first = String(candidate.profileExtras?.location || '').split(',')[0].trim();
    if (!first) return null;
    const lower = first.toLowerCase();
    return { key: CITY_ALIASES[lower] || lower, label: first };
}

type Entry = { key: string; label: string };

/** Dedupes by normalized key, keeping the first spelling as the label. */
function dedupe(entries: Entry[]): Entry[] {
    const seen = new Set<string>();
    const out: Entry[] = [];
    for (const entry of entries) {
        if (!entry.key || seen.has(entry.key)) continue;
        seen.add(entry.key);
        out.push(entry);
    }
    return out;
}

export function candidateSkills(candidate: Candidate): Entry[] {
    const raw = Array.isArray(candidate.skills) && candidate.skills.length > 0
        ? candidate.skills
        : candidate.extractedData?.skills ?? [];
    return dedupe(raw.map((skill) => {
        const label = String(skill ?? '').trim();
        return { key: label.toLowerCase(), label };
    }));
}

export function candidateColleges(candidate: Candidate): Entry[] {
    const institutions = [
        ...(candidate.education ?? []).map((edu) => edu.institution),
        ...(candidate.extractedData?.education ?? []).map((edu) => edu.institution)
    ];
    return dedupe(institutions.map((name) => {
        const label = String(name ?? '').trim();
        return { key: label.toLowerCase(), label };
    }));
}

/** Any 19xx/20xx year inside a free-text education line ("2019-2023", "2024"). */
const YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;

/**
 * Year of passing per qualification: the LAST year found in an entry's
 * `year`/`duration` text, so a "2019 - 2023" duration counts as 2023.
 * A candidate with several qualifications contributes each distinct year.
 */
export function candidatePassingYears(candidate: Candidate): Entry[] {
    const entries = [
        ...(candidate.education ?? []),
        ...(candidate.extractedData?.education ?? [])
    ];
    const years = new Set<string>();
    for (const edu of entries) {
        const found: number[] = [];
        for (const text of [edu.year, edu.duration]) {
            if (!text) continue;
            for (const match of String(text).match(YEAR_PATTERN) ?? []) {
                found.push(Number(match));
            }
        }
        if (found.length > 0) years.add(String(Math.max(...found)));
    }
    return [...years].sort((a, b) => Number(b) - Number(a)).map((year) => ({ key: year, label: year }));
}

export function candidateCompanies(candidate: Candidate): Entry[] {
    const entries: Entry[] = [];
    for (const work of candidate.extractedData?.workExperience ?? []) {
        const label = String(work?.company ?? '').trim();
        entries.push({ key: label.toLowerCase(), label });
    }
    // Profile experience lines are "Role — Company".
    for (const line of candidate.profileExtras?.experience ?? []) {
        const parts = String(line?.title ?? '').split(/\s+[—–]\s+/);
        const label = (parts.length > 1 ? parts[parts.length - 1] : '').trim();
        entries.push({ key: label.toLowerCase(), label });
    }
    return dedupe(entries);
}

const STATUS_LABELS: Record<string, string> = {
    pending: 'Pending',
    shortlisted: 'Shortlisted',
    selected: 'Selected',
    rejected: 'Rejected',
    round1: 'Round 1',
    round2: 'Round 2',
    round3: 'Round 3'
};

function statusLabel(status: string): string {
    if (STATUS_LABELS[status]) return STATUS_LABELS[status];
    return status.charAt(0).toUpperCase() + status.slice(1);
}

/** Counts how often each key occurs, most frequent first. */
function countEntries(entriesFor: (candidate: Candidate) => Entry[], list: Candidate[]): CandidateFilterOption[] {
    const counts = new Map<string, { label: string; n: number }>();
    for (const candidate of list) {
        for (const entry of entriesFor(candidate)) {
            const current = counts.get(entry.key);
            if (current) current.n += 1;
            else counts.set(entry.key, { label: entry.label, n: 1 });
        }
    }
    return [...counts.entries()]
        .sort((a, b) => b[1].n - a[1].n || a[1].label.localeCompare(b[1].label))
        .map(([value, v]) => ({ value, label: v.label, count: v.n }));
}

/**
 * Builds the sidebar sections from the list currently on screen, so every
 * option shows how many candidates it would reveal. Sections with nothing to
 * pick (or a single status, where the filter would be a no-op) are omitted.
 * Long lists stay out of the sidebar: the panel shows a few options and the
 * "View all" modal carries the search.
 */
export function buildCandidateFilterSections(list: Candidate[]): CandidateFilterSection[] {
    const sections: CandidateFilterSection[] = [];

    const roles = countEntries((c) => (c.role ? [{ key: norm(c.role), label: c.role.trim() }] : []), list);
    if (roles.length > 0) {
        sections.push({ title: 'Role', key: 'role', options: roles });
    }

    const expCounts = new Map<string, number>();
    for (const candidate of list) {
        const bucket = experienceBucket(candidate.experience);
        expCounts.set(bucket, (expCounts.get(bucket) ?? 0) + 1);
    }
    const experienceOptions = EXPERIENCE_BUCKETS
        .filter((bucket) => (expCounts.get(bucket.value) ?? 0) > 0)
        .map((bucket) => ({ value: bucket.value, label: bucket.label, count: expCounts.get(bucket.value) ?? 0 }));
    if (experienceOptions.length > 1) {
        sections.push({ title: 'Experience', key: 'experience', options: experienceOptions });
    }

    const locations = countEntries((c) => {
        const city = candidateCity(c);
        return city ? [city] : [];
    }, list);
    if (locations.length > 0) {
        sections.push({ title: 'Location', key: 'location', options: locations });
    }

    const skills = countEntries(candidateSkills, list);
    if (skills.length > 0) {
        sections.push({ title: 'Skills', key: 'skills', options: skills });
    }

    const colleges = countEntries(candidateColleges, list);
    if (colleges.length > 0) {
        sections.push({ title: 'College', key: 'college', options: colleges });
    }

    // Year of passing sits with the education section, newest first;
    // "Not specified" joins only when some candidate does carry a year
    // (an all-unknown section would be a no-op).
    const passingCounts = countEntries(candidatePassingYears, list);
    if (passingCounts.length > 0) {
        const unknownCount = list.reduce(
            (n, candidate) => n + (candidatePassingYears(candidate).length === 0 ? 1 : 0),
            0
        );
        const passingOptions = [...passingCounts].sort((a, b) => {
            if (a.value === 'unknown') return 1;
            if (b.value === 'unknown') return -1;
            return Number(b.value) - Number(a.value);
        });
        if (unknownCount > 0) {
            passingOptions.push({ value: 'unknown', label: 'Not specified', count: unknownCount });
        }
        sections.push({ title: 'Year of passing', key: 'passingYear', options: passingOptions });
    }

    const companies = countEntries(candidateCompanies, list);
    if (companies.length > 0) {
        sections.push({ title: 'Company', key: 'company', options: companies });
    }

    const statusCounts = new Map<string, number>();
    for (const candidate of list) {
        const status = norm(candidate.status) || 'pending';
        statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    }
    if (statusCounts.size > 1) {
        sections.push({
            title: 'Status',
            key: 'status',
            options: [...statusCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([value, n]) => ({ value, label: statusLabel(value), count: n }))
        });
    }

    return sections;
}

/**
 * AND across sections, OR within a section (a candidate matching ANY selected
 * option of a section passes that section). Empty sections never exclude.
 */
export function matchesCandidateFilters(candidate: Candidate, filters: SelectedFilters): boolean {
    const roles = filters.role;
    if (roles && roles.length > 0 && !roles.includes(norm(candidate.role))) return false;

    const experience = filters.experience;
    if (experience && experience.length > 0 && !experience.includes(experienceBucket(candidate.experience))) return false;

    const passingYear = filters.passingYear;
    if (passingYear && passingYear.length > 0) {
        const years = candidatePassingYears(candidate).map((entry) => entry.key);
        const owned = years.length > 0 ? years : ['unknown'];
        if (!passingYear.some((year) => owned.includes(year))) return false;
    }

    const locations = filters.location;
    if (locations && locations.length > 0) {
        const city = candidateCity(candidate);
        if (!city || !locations.includes(city.key)) return false;
    }

    const skills = filters.skills;
    if (skills && skills.length > 0) {
        const owned = new Set(candidateSkills(candidate).map((s) => s.key));
        if (!skills.some((skill) => owned.has(skill))) return false;
    }

    const colleges = filters.college;
    if (colleges && colleges.length > 0) {
        const owned = new Set(candidateColleges(candidate).map((c) => c.key));
        if (!colleges.some((college) => owned.has(college))) return false;
    }

    const companies = filters.company;
    if (companies && companies.length > 0) {
        const owned = new Set(candidateCompanies(candidate).map((c) => c.key));
        if (!companies.some((company) => owned.has(company))) return false;
    }

    const statuses = filters.status;
    if (statuses && statuses.length > 0) {
        const status = norm(candidate.status) || 'pending';
        if (!statuses.includes(status)) return false;
    }

    return true;
}

export function hasActiveFilters(filters: SelectedFilters): boolean {
    return Object.values(filters).some((values) => values.length > 0);
}

/** Every selected option as removable chips, grouped in section order. */
export function activeFilterChips(
    filters: SelectedFilters,
    sections: CandidateFilterSection[]
): { sectionKey: string; value: string; label: string }[] {
    const chips: { sectionKey: string; value: string; label: string }[] = [];
    for (const section of sections) {
        const selected = filters[section.key] ?? [];
        for (const value of selected) {
            const option = section.options.find((o) => o.value === value);
            chips.push({ sectionKey: section.key, value, label: option?.label ?? value });
        }
    }
    return chips;
}
