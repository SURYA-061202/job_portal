import type { Candidate } from '@/types';

/* Keyword search over candidates, modelled on a job-portal resume search:
   - "java, project manager" (commas)  -> two phrases
   - java spring boot (no commas)      -> three words, unless quoted: java "spring boot"
   - Any mode ranks by how many keywords hit (and where); All mode needs every keyword. */

export type MatchMode = 'any' | 'all';

export type SearchSection =
    | 'name'
    | 'role'
    | 'experience'
    | 'contact'
    | 'location'
    | 'summary'
    | 'skills'
    | 'work'
    | 'education'
    | 'projects'
    | 'certifications';

/** Higher = a hit there says more about the candidate. */
const WEIGHTS: Record<SearchSection, number> = {
    skills: 5,
    role: 5,
    work: 4,
    name: 4,
    projects: 3,
    certifications: 3,
    education: 3,
    summary: 2,
    location: 2,
    experience: 1,
    contact: 1,
};

/** A line of candidate text plus where it came from. */
export interface SearchableLine {
    section: SearchSection;
    text: string;
}

export interface CandidateMatch {
    candidate: Candidate;
    /** The keywords (as typed, lowercased) found anywhere on the candidate. */
    matched: string[];
    score: number;
}

const clean = (value: unknown): string => (value === undefined || value === null ? '' : String(value).trim());

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Flattens strings, arrays and plain objects (resume parsers are inconsistent) into text lines. */
function flatten(value: unknown, out: string[] = []): string[] {
    if (value === undefined || value === null) return out;
    if (typeof value === 'string' || typeof value === 'number') {
        const t = clean(value);
        if (t) out.push(t);
    } else if (Array.isArray(value)) {
        value.forEach((v) => flatten(v, out));
    } else if (typeof value === 'object') {
        Object.values(value as Record<string, unknown>).forEach((v) => flatten(v, out));
    }
    return out;
}

/** Every searchable line of a candidate, tagged by section. Shared by the matcher and the result card. */
export function getSearchableLines(c: Candidate): SearchableLine[] {
    const lines: SearchableLine[] = [];
    const add = (section: SearchSection, value: unknown) =>
        flatten(value).forEach((text) => lines.push({ section, text }));

    const extra = c.profileExtras;
    const extracted = c.extractedData;

    add('name', c.name);
    add('role', c.role);
    add('experience', c.experience);
    add('contact', [c.email, c.phone]);
    add('location', extra?.location);
    add('summary', extracted?.summary);
    add('skills', c.skills?.length ? c.skills : extracted?.skills);

    arr<Record<string, unknown>>(extracted?.workExperience).forEach((w) => add('work', [w?.position, w?.company, w?.duration, w?.description]));
    arr<Record<string, unknown>>(extra?.experience).forEach((w) => add('work', [w?.title, w?.meta, w?.description]));

    arr<Record<string, unknown>>(c.education?.length ? c.education : extracted?.education).forEach((e) =>
        add('education', [e?.degree, e?.field, e?.institution, e?.year])
    );

    const projects = (c as unknown as { keyProjects?: unknown; projects?: unknown }).keyProjects
        ?? c.projects
        ?? extracted?.projects;
    add('projects', projects);
    arr<Record<string, unknown>>(extra?.projects).forEach((p) => add('projects', [p?.title, p?.meta, p?.description]));

    add('certifications', extracted?.certifications);
    arr<Record<string, unknown>>(extra?.certificates).forEach((p) => add('certifications', [p?.title, p?.meta]));
    add('certifications', extra?.courses);

    return lines;
}

/**
 * Splits the search box into keywords.
 * With a comma the commas are the separators (so "project manager, autocad" is two phrases);
 * otherwise spaces separate words and "double quotes" keep a phrase together.
 */
export function parseKeywords(input: string): string[] {
    const text = input.trim().toLowerCase();
    if (!text) return [];

    let parts: string[];
    if (text.includes(',')) {
        parts = text.split(',');
    } else {
        parts = [];
        const re = /"([^"]+)"|(\S+)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) parts.push(m[1] ?? m[2]);
    }

    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of parts) {
        const kw = raw.replace(/["]/g, '').replace(/\s+/g, ' ').trim();
        if (kw && !seen.has(kw)) {
            seen.add(kw);
            result.push(kw);
        }
    }
    return result;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One-or-two character keywords ("c", "r", "qa") must be whole words, or "c" would hit every line. */
function keywordPattern(keyword: string): string {
    const body = escapeRegExp(keyword).replace(/ /g, '\\s+');
    return keyword.length <= 2 ? `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])` : body;
}

/** One regex that finds any keyword; used to highlight. Null when there is nothing to find. */
export function buildHighlightRegex(keywords: string[]): RegExp | null {
    if (keywords.length === 0) return null;
    // Longest first so "spring boot" wins over "spring".
    const ordered = [...keywords].sort((a, b) => b.length - a.length);
    return new RegExp(`(${ordered.map(keywordPattern).join('|')})`, 'giu');
}

/** Runs the search. Without keywords everything passes through unchanged and unranked. */
export function searchCandidates(candidates: Candidate[], keywords: string[], mode: MatchMode): CandidateMatch[] {
    if (keywords.length === 0) return candidates.map((candidate) => ({ candidate, matched: [], score: 0 }));

    const patterns = keywords.map((kw) => ({ kw, re: new RegExp(keywordPattern(kw), 'iu') }));
    const results: CandidateMatch[] = [];

    for (const candidate of candidates) {
        const lines = getSearchableLines(candidate);
        const matched: string[] = [];
        let score = 0;

        for (const { kw, re } of patterns) {
            let best = 0;
            for (const line of lines) {
                if (re.test(line.text)) best = Math.max(best, WEIGHTS[line.section]);
            }
            if (best > 0) {
                matched.push(kw);
                score += best;
            }
        }

        const passes = mode === 'all' ? matched.length === keywords.length : matched.length > 0;
        if (passes) results.push({ candidate, matched, score });
    }

    // More keywords first, then where they hit, then keep the incoming order (stable sort).
    return results.sort((a, b) => b.matched.length - a.matched.length || b.score - a.score);
}
