import type { RecruitmentRequest } from '@/types';

/** Comma-separated string or array of skills -> trimmed, non-empty list. */
export const skillList = (v: unknown): string[] =>
    (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : []).map(s => s.trim()).filter(Boolean);

/** "Java Script" equals "JavaScript"; punctuation other than + and # is ignored. */
export const normSkill = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, '');

/** "Java or C#" / "AWS/GCP" are satisfied by any one alternative. */
const alternatives = (required: string) =>
    required.split(/\s+or\s+|\s*[/|]\s*/i).map(normSkill).filter(Boolean);

/**
 * How ready a job seeker is for a post:
 *  ready   - skills are essentially covered; apply now
 *  reach   - a few skills short; learning them makes it a realistic target
 *  explore - skills don't line up yet, but the role or city does
 */
export type Readiness = 'ready' | 'reach' | 'explore';

export interface SeekerProfile {
    skills: string[];
    years: unknown;
    /** Free-text address, e.g. "Pune, Maharashtra". */
    address: string;
    /** The role or job title the person gave themselves. */
    role: string;
}

export interface JobFit {
    /** Share of required skills covered (0-1); null when the post lists none. */
    coverage: number | null;
    required: number;
    matched: string[];
    missing: string[];
    /** Years short of the post's requirement; 0 when met. */
    experienceGap: number;
    nearYou: boolean;
    remote: boolean;
    roleFit: boolean;
    /** Days since posted; null when the post has no date. */
    ageDays: number | null;
    /** 0-100 ordering score blending skills, role, place and experience. */
    fit: number;
    /** Null when nothing about the post lines up with the person. */
    tier: Readiness | null;
}

const READY_COVERAGE = 0.75;
const REACH_COVERAGE = 0.4;

const leadingNumber = (v: unknown) => parseInt(String(v ?? ''), 10) || 0;

const ADDRESS_NOISE = new Set(['india', 'road', 'street', 'near', 'district', 'opp', 'opposite']);
const ROLE_NOISE = new Set(['senior', 'junior', 'lead', 'associate', 'the', 'and', 'for', 'of']);

const words = (text: string, noise: Set<string>) =>
    text.toLowerCase().split(/[^a-z0-9+#]+/).filter(w => w.length >= 3 && !noise.has(w));

/** Posts spell it either way; "Bangalore" should catch "Bengaluru". */
const placeForms = (w: string) => (w === 'bangalore' || w === 'bengaluru' ? ['bangalore', 'bengaluru'] : [w]);

const toMillis = (v: unknown): number => {
    if (!v) return 0;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'object') {
        const t = v as { toDate?: () => Date; seconds?: number };
        if (typeof t.toDate === 'function') return t.toDate().getTime();
        if (typeof t.seconds === 'number') return t.seconds * 1000;
        return 0;
    }
    const ms = new Date(v as string | number).getTime();
    return Number.isNaN(ms) ? 0 : ms;
};

export function assessJob(post: RecruitmentRequest, me: SeekerProfile): JobFit {
    const required = skillList(post.skills);
    const owned = new Set(me.skills.map(normSkill));
    const matched: string[] = [];
    const missing: string[] = [];
    for (const r of required) {
        (alternatives(r).some(a => owned.has(a)) ? matched : missing).push(r);
    }
    const coverage = required.length ? matched.length / required.length : null;

    const needed = leadingNumber(post.yearsExperience);
    const have = leadingNumber(me.years);
    const experienceGap = Math.max(0, needed - have);
    const expFit = needed === 0 || have >= needed ? 1 : have / needed;

    const place = String(post.location || '').toLowerCase();
    const remote = post.modeOfWork === 'Remote';
    const nearYou = !!place && words(me.address, ADDRESS_NOISE).some(w => placeForms(w).some(f => place.includes(f)));

    const title = `${post.jobTitle || ''} ${post.department || ''}`.toLowerCase();
    const roleFit = words(me.role, ROLE_NOISE).some(w => title.includes(w));

    const createdMs = toMillis(post.createdAt);
    const ageDays = createdMs ? Math.max(0, Math.floor((Date.now() - createdMs) / 86_400_000)) : null;

    const fit = Math.round(100 * (
        0.55 * (coverage ?? 0.25) + 0.2 * (roleFit ? 1 : 0) + 0.15 * (nearYou || remote ? 1 : 0) + 0.1 * expFit
    ));

    let tier: Readiness | null = null;
    if (coverage !== null && coverage >= READY_COVERAGE && experienceGap <= 1) tier = 'ready';
    else if (coverage !== null && coverage >= REACH_COVERAGE) tier = 'reach';
    else if (roleFit || nearYou) tier = 'explore';

    return { coverage, required: required.length, matched, missing, experienceGap, nearYou, remote, roleFit, ageDays, fit, tier };
}
