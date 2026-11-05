import { rankApplicantsOnServer } from './aiFunctions';

/** Ranks every applicant of a post. Runs in the `rankApplicants` Cloud Function. */
export async function rankCandidatesForJob(jobId: string) {
    const count = await rankApplicantsOnServer(jobId);
    return count === 0
        ? { success: true, message: 'No applicants to rank', count: 0 }
        : { success: true, count };
}
