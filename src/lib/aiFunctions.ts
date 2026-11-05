import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

/**
 * Thin wrappers over the AI Cloud Functions. The OpenAI key lives only on the
 * server; the functions check that the caller is a signed-in recruiter.
 */

const LONG = { timeout: 300_000 };

export interface AIProfile {
    id: string;
    name?: string;
    role?: string;
    experience?: string;
    skills?: string[];
    summary?: string;
    workHistory?: string;
}

export interface ServerRanking {
    score: number;
    reasoning: string;
    updatedAtMs: number;
}

const parseResumeFn = httpsCallable<{ text: string }, { data: Record<string, unknown> }>(functions, 'parseResume', LONG);
const scoreCandidatesFn = httpsCallable<
    { jobId: string; jobTitle: string; jobDescription: string; candidates: AIProfile[] },
    { rankings: Record<string, ServerRanking> }
>(functions, 'scoreCandidates', LONG);
const rankApplicantsFn = httpsCallable<{ jobId: string }, { count: number }>(functions, 'rankApplicants', LONG);
const clusterCandidatesFn = httpsCallable<
    { candidates: AIProfile[] },
    { clusters: { id: number; label: string; candidateIds: string[] }[] }
>(functions, 'clusterCandidates', LONG);

export async function parseResumeText(text: string) {
    return (await parseResumeFn({ text })).data.data;
}

export async function scoreCandidatesOnServer(params: {
    jobId: string;
    jobTitle: string;
    jobDescription: string;
    candidates: AIProfile[];
}) {
    return (await scoreCandidatesFn(params)).data.rankings;
}

export async function rankApplicantsOnServer(jobId: string) {
    return (await rankApplicantsFn({ jobId })).data.count;
}

export async function clusterCandidatesOnServer(candidates: AIProfile[]) {
    return (await clusterCandidatesFn({ candidates })).data.clusters;
}
