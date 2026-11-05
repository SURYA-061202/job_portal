import type { Candidate } from '@/types';
import { Timestamp } from 'firebase/firestore';
import { scoreCandidatesOnServer, type AIProfile } from './aiFunctions';

const toProfile = (c: Candidate): AIProfile => ({
    id: c.id,
    name: c.name,
    role: c.role,
    experience: c.experience,
    skills: c.skills,
    summary: c.extractedData?.summary || '',
    workHistory: c.extractedData?.workExperience?.map(w => `${w.position} at ${w.company}`).join('; ') || '',
});

/**
 * Scores candidates against a job. The OpenAI call and the write of
 * `rankings.<jobId>` both happen in the `scoreCandidates` Cloud Function; this
 * returns the candidates with the new scores merged in.
 */
export async function analyzeCandidateScores(
    candidates: Candidate[],
    jobDescription: string,
    jobId: string,
    jobTitle: string
): Promise<Candidate[]> {
    if (!candidates || candidates.length === 0) return [];
    if (!jobDescription) throw new Error('Job Description is required for analysis');

    // Already scored for this job: nothing to do.
    const pending = candidates.filter(c => !(c.rankings && c.rankings[jobId]));
    if (pending.length === 0) return candidates;

    const rankings = await scoreCandidatesOnServer({
        jobId,
        jobTitle,
        jobDescription,
        candidates: pending.map(toProfile),
    });

    return candidates.map(c => {
        const r = rankings[c.id];
        if (!r) return c;
        return {
            ...c,
            rankings: {
                ...c.rankings,
                [jobId]: { score: r.score, reasoning: r.reasoning, updatedAt: Timestamp.fromMillis(r.updatedAtMs) },
            },
        };
    });
}
