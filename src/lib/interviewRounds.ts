import type { InterviewRound, RecruitmentRequest } from '@/types';

/**
 * Posts created before rounds were configurable have no `totalRounds`, so the
 * pipeline falls back to the four rounds it used to hard-code.
 */
export const DEFAULT_TOTAL_ROUNDS = 4;
export const MAX_TOTAL_ROUNDS = 10;

/**
 * The interview rounds a post runs, always as a dense 1..N list so the pipeline
 * can render a column per round even when a name was never filled in.
 */
export function getPostRounds(post?: Partial<RecruitmentRequest> | null): InterviewRound[] {
    const configured = Array.isArray(post?.rounds) ? post!.rounds! : [];

    const total = typeof post?.totalRounds === 'number' && post.totalRounds >= 0
        ? Math.min(Math.floor(post.totalRounds), MAX_TOTAL_ROUNDS)
        : (configured.length || DEFAULT_TOTAL_ROUNDS);

    return Array.from({ length: total }, (_, i) => {
        const roundNumber = i + 1;
        const configuredRound = configured.find(r => Number(r?.roundNumber) === roundNumber);
        return { roundNumber, name: (configuredRound?.name || '').trim() };
    });
}

/** "Round 2: Technical Screen", or "Interview Round 2" when unnamed. */
export function getRoundLabel(round: InterviewRound): string {
    return round.name ? `Round ${round.roundNumber}: ${round.name}` : `Interview Round ${round.roundNumber}`;
}

/** 'round3' -> 3, anything else -> null. */
export function getRoundNumberFromStatus(status?: string | null): number | null {
    const match = (status || '').toLowerCase().match(/^round(\d+)$/);
    return match ? Number(match[1]) : null;
}
