import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { sendInterviewInvite } from './emailFunctions';
import { upsertApplication } from './jobApplications';
import { createInterviewInviteNotification } from './notificationHelper';
import { recordProfileInvite } from './profileViews';
import type { Candidate } from '@/types';

/**
 * One interview invite end-to-end: the email, the candidate document, the
 * application stage, the interviews/{id} bookkeeping and the in-app
 * notification. Shared by the single-candidate modal and the bulk send, so both
 * paths always write exactly the same records.
 *
 * The email (step 1) throws on failure; every later step is best-effort so a
 * Firestore hiccup never strands a candidate who already has the invite in
 * their inbox.
 */
export interface InterviewInviteParams {
    candidate: Candidate;
    /** Role / job title the invite is for. */
    role: string;
    /** The three offered dates (YYYY-MM-DD). */
    dates: string[];
    /** Round name, e.g. "Technical". */
    roundType: string;
    /** Interviewer display names. */
    interviewers: string[];
    /** Post the invite is raised against. */
    postId: string;
    /** Origin used to build the candidate's response link. */
    baseUrl: string;
}

export async function sendInterviewInviteToCandidate(params: InterviewInviteParams): Promise<void> {
    const { candidate, role, dates, roundType, interviewers, postId, baseUrl } = params;
    if (!candidate?.id || !candidate.email) {
        throw new Error('Candidate email missing');
    }

    // 1. The invitation email (contains the response link).
    await sendInterviewInvite({
        candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
        interviewDetails: { role, dates, roundType, interviewers, baseUrl, postId },
        baseUrl,
    });

    const todayStr = new Date().toISOString().split('T')[0];

    // 2. The recruiter-side candidate record (manual uploads live here).
    try {
        const candidateRef = doc(db, 'candidates', candidate.id);
        const snap = await getDoc(candidateRef);
        if (snap.exists()) {
            await updateDoc(candidateRef, {
                status: 'shortlisted',
                postId,
                interviewDetails: {
                    role,
                    dates,
                    roundType,
                    interviewers,
                    currentSalary: 30000,
                    expectedSalary: 30000,
                    joiningDate: todayStr,
                    feedback: 'Good',
                    sentAt: new Date().toISOString(),
                },
                updatedAt: new Date(),
            });
        } else {
            console.log('[InterviewInvite] Candidate document not found:', candidate.id);
        }
    } catch (err) {
        console.error('Failed to update candidate document:', err);
    }

    // 3. The application moves to shortlisted for this post.
    try {
        await upsertApplication(postId, candidate.id, 'shortlisted');
    } catch (err) {
        console.error('Error creating job application:', err);
    }

    // 4. Interview details, keyed by candidate. The invite supersedes any
    //    earlier one (possibly for another post), so previous answers clear.
    try {
        await setDoc(
            doc(db, 'interviews', candidate.id),
            {
                postId,
                role,
                dates,
                roundType,
                interviewers,
                sentAt: new Date().toISOString(),
                response: null,
                selectedDate: null,
                respondedAt: null,
                detailsSubmitted: false,
                dateOfJoining: '',
                currentSalary: '',
                expectedSalary: '',
                expectedSalaryPeriod: '',
                yearsExperience: '',
                experienceIn: '',
                readyToRelocate: '',
                laptop: '',
            },
            { merge: true }
        );
    } catch (err) {
        console.error('Failed to store interview details', err);
    }

    // 5. In-app notification (falls back to the stored email when the loaded
    //    record has none, so the invite never goes unannounced).
    try {
        await createInterviewInviteNotification(candidate.email, role, dates, roundType, candidate.id);
    } catch (err) {
        console.error('Failed to create notification', err);
    }

    // 6. Shows up under "Who viewed me" on the candidate's profile.
    void recordProfileInvite(candidate.id, role);
}
