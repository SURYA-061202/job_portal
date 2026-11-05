import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

/**
 * Calls used by the signed-out pages candidates reach from an emailed link
 * (/interview and /verify-details). The interview data is no longer readable
 * from the browser: these Cloud Functions are the only way in.
 */

export interface InterviewInvite {
    role: string;
    dates: string[];
    responded: boolean;
    detailsSubmitted: boolean;
}

export interface CandidateDetailsForm {
    dateOfJoining: string;
    currentSalary: string;
    expectedSalary: string;
    expectedSalaryPeriod: string;
    yearsExperience: string;
    experienceIn: string;
    readyToRelocate: string;
    laptop: string;
}

const getInviteFn = httpsCallable<{ candidateId: string }, InterviewInvite>(functions, 'getInterviewInvite');
const submitResponseFn = httpsCallable<
    {
        candidateId: string;
        response: 'accept' | 'decline';
        slotDate?: string;
        slotTime?: string;
        details?: CandidateDetailsForm;
    },
    { success: boolean }
>(functions, 'submitInterviewResponse');
const submitDetailsFn = httpsCallable<{ candidateId: string; details: CandidateDetailsForm }, { success: boolean }>(
    functions,
    'submitVerifyDetails'
);

export async function getInterviewInvite(candidateId: string) {
    return (await getInviteFn({ candidateId })).data;
}

export async function submitInterviewResponse(p: {
    candidateId: string;
    accepted: boolean;
    slotDate?: string;
    slotTime?: string;
    details?: CandidateDetailsForm;
}) {
    await submitResponseFn({
        candidateId: p.candidateId,
        response: p.accepted ? 'accept' : 'decline',
        slotDate: p.slotDate,
        slotTime: p.slotTime,
        details: p.details,
    });
}

export async function submitVerifyDetails(candidateId: string, details: CandidateDetailsForm) {
    await submitDetailsFn({ candidateId, details });
}

/** The server's message for a failed callable, or a fallback. */
export function callableMessage(err: unknown, fallback: string): string {
    const e = err as { code?: string; message?: string };
    return e?.code?.startsWith('functions/') && e.message ? e.message : fallback;
}
