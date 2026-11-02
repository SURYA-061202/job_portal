import type { RecruitmentRequest } from '@/types';
import { keywordPattern } from './candidateSearch';
import { skillList } from './jobMatch';

/* Keyword search over job posts, the same rules as the recruiter's candidate search:
   - "site engineer, autocad" (commas)  -> two phrases
   - site engineer autocad (no commas)  -> three words, unless quoted: site "project manager"
   A post passes when it matches at least one keyword, and posts hitting more keywords,
   or hitting them in more telling places, come first. */

type Section = 'title' | 'skills' | 'department' | 'company' | 'description' | 'location' | 'details';

/** Higher = a hit there says more about the job. */
const WEIGHTS: Record<Section, number> = {
    title: 5,
    skills: 5,
    department: 4,
    company: 4,
    description: 2,
    location: 2,
    details: 1,
};

export interface JobSearchHit {
    /** Keywords (lowercased) found anywhere on the post. */
    matched: string[];
    score: number;
}

const text = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

function linesOf(post: Partial<RecruitmentRequest>): { section: Section; text: string }[] {
    const lines: { section: Section; text: string }[] = [];
    const add = (section: Section, value: unknown) => {
        const t = text(value);
        if (t) lines.push({ section, text: t });
    };
    add('title', post.jobTitle);
    skillList(post.skills).forEach(s => add('skills', s));
    add('department', post.department);
    add('company', post.companyName);
    add('description', post.description);
    add('location', post.location);
    [post.positionLevel, post.candidateType, post.modeOfWork, post.qualification].forEach(v => add('details', v));
    return lines;
}

export interface CompiledKeywords {
    keywords: string[];
    patterns: { kw: string; re: RegExp }[];
}

export const compileKeywords = (keywords: string[]): CompiledKeywords => ({
    keywords,
    patterns: keywords.map(kw => ({ kw, re: new RegExp(keywordPattern(kw), 'iu') })),
});

/** Null when nothing in the post matches any keyword. */
export function searchJob(post: Partial<RecruitmentRequest>, compiled: CompiledKeywords): JobSearchHit | null {
    const lines = linesOf(post);
    const matched: string[] = [];
    let score = 0;
    for (const { kw, re } of compiled.patterns) {
        let best = 0;
        for (const line of lines) {
            if (re.test(line.text)) best = Math.max(best, WEIGHTS[line.section]);
        }
        if (best > 0) {
            matched.push(kw);
            score += best;
        }
    }
    return matched.length > 0 ? { matched, score } : null;
}

/** More keywords first, then where they hit; equal posts keep their incoming order. */
export const byRelevance = (a: JobSearchHit, b: JobSearchHit) => b.matched.length - a.matched.length || b.score - a.score;
