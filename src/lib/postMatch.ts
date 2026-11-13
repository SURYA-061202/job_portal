import type { Candidate } from '@/types';

/** The parts of a job post the match score looks at. */
export interface MatchTarget {
  jobTitle?: string;
  skills?: string;
  yearsExperience?: string;
}

const WEIGHTS = { skills: 60, role: 25, experience: 15 } as const;
const STOP = new Set(['and', 'the', 'for', 'with', 'of', 'in', 'at', 'to', 'a', 'an', 'sr', 'jr']);

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9+#.\s]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s: unknown) => norm(s).split(' ').filter((t) => t.length > 1 && !STOP.has(t));
const firstNumber = (s: unknown) => {
  const m = String(s ?? '').match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
};

/**
 * 0-100 score of how well a candidate fits a post: skills (60), role / job title (25)
 * and experience (15). A part the post does not specify is left out and the rest
 * are scaled up, so a post without a skills list is not capped below 100.
 */
export function matchScore(candidate: Candidate, post: MatchTarget): number {
  let earned = 0;
  let possible = 0;

  const postSkills = String(post.skills ?? '').split(',').map(norm).filter(Boolean);
  if (postSkills.length) {
    const mine = (Array.isArray(candidate.skills) ? candidate.skills : []).map(norm).filter(Boolean);
    const hit = postSkills.filter((s) => mine.some((m) => m === s || m.includes(s) || s.includes(m))).length;
    earned += (hit / postSkills.length) * WEIGHTS.skills;
    possible += WEIGHTS.skills;
  }

  const titleTokens = tokens(post.jobTitle);
  if (titleTokens.length) {
    const roleNorm = norm(candidate.role);
    const roleTokens = new Set(tokens(candidate.role));
    const full = norm(post.jobTitle);
    const ratio = roleNorm && (roleNorm === full || roleNorm.includes(full) || full.includes(roleNorm))
      ? 1
      : titleTokens.filter((t) => roleTokens.has(t)).length / titleTokens.length;
    earned += ratio * WEIGHTS.role;
    possible += WEIGHTS.role;
  }

  const need = firstNumber(post.yearsExperience);
  if (need !== null) {
    const have = firstNumber(candidate.experience) ?? 0;
    earned += (need === 0 || have >= need ? 1 : have / need) * WEIGHTS.experience;
    possible += WEIGHTS.experience;
  }

  return possible === 0 ? 0 : Math.round((earned / possible) * 100);
}
