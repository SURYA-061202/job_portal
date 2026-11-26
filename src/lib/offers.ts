import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import type { OfferLetter, OfferStatus, OfferTimelineEvent } from '@/types';
import { setApplicationStatus } from './jobApplications';
import { createNotification } from './notificationHelper';

/**
 * Offer management: one letter per (post, candidate), written by the recruiter
 * (`offers/{postId}__{candidateId}`) and answered by the candidate through the
 * getOffer / respondToOffer Cloud Functions — the candidate never gets direct
 * read access to the collection.
 *
 * Sending an offer = write the letter → move the application to `offer_sent` →
 * notify the candidate → email them the link (Cloud Function, counted against
 * the daily mail quota).
 */

export const OFFER_STATUS: Record<OfferStatus, { label: string; className: string }> = {
    draft: { label: 'Draft', className: 'bg-ink/5 text-ink/70 border-ink/20' },
    sent: { label: 'Offer Sent', className: 'bg-brand/10 text-brand border-brand/20' },
    accepted: { label: 'Accepted', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    declined: { label: 'Declined', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

/** Document id for an offer; mirrors the `${postId}_${candidateId}` application key with a double underscore. */
export function offerDocId(postId: string, candidateId: string): string {
    return `${postId}__${candidateId}`;
}

const nowIso = () => new Date().toISOString();

/** Letter status for the candidate pipeline: sent/accepted/declined all count as an offer stage. */
export const OFFER_APPLICATION_STATUS: Record<Exclude<OfferStatus, 'draft'>, string> = {
    sent: 'offer_sent',
    accepted: 'offer_accepted',
    declined: 'offer_declined',
};

/** Reads one letter; returns null when the recruiter hasn't drafted it yet. */
export async function loadOffer(postId: string, candidateId: string): Promise<OfferLetter | null> {
    if (!postId || !candidateId) return null;
    try {
        const snap = await getDoc(doc(db, 'offers', offerDocId(postId, candidateId)));
        if (!snap.exists()) return null;
        return { id: snap.id, ...(snap.data() as Omit<OfferLetter, 'id'>) };
    } catch (err) {
        console.error('Failed to load offer:', err);
        return null;
    }
}

/** Offers for the given candidates on one post, keyed by candidate id. */
export async function loadOffersForCandidates(
    postId: string,
    candidateIds: string[]
): Promise<Record<string, OfferLetter>> {
    if (!postId || candidateIds.length === 0) return {};
    const entries = await Promise.all(
        candidateIds.map(async (candidateId) => {
            const offer = await loadOffer(postId, candidateId);
            return offer ? ([candidateId, offer] as const) : null;
        })
    );
    return Object.fromEntries(entries.filter((e): e is readonly [string, OfferLetter] => !!e));
}

interface SendOfferParams {
    offerId: string;
    baseUrl: string;
}

const sendOfferLetterFn = httpsCallable<SendOfferParams, { success: boolean }>(functions, 'sendOfferLetter');
const getOfferFn = httpsCallable<{ offerId: string; token: string }, OfferLetter>(functions, 'getOffer');
const respondToOfferFn = httpsCallable<
    { offerId: string; action: 'accept' | 'decline'; signatureName?: string; token: string },
    { success: boolean; status: OfferStatus }
>(functions, 'respondToOffer');

/**
 * Emails the offer link to the candidate. The letter itself is read from
 * Firestore by the function, so the client can't inject content into the mail.
 * Throws when the mail could not be sent (the letter is already recorded).
 */
export async function sendOfferLetterEmail(offerId: string, baseUrl: string = window.location.origin): Promise<void> {
    await sendOfferLetterFn({ offerId, baseUrl });
}

/**
 * What the candidate's link shows: the letter fields plus its current status.
 * `token` is the random `?t=` value from the emailed link — without it the
 * callable refuses to hand over the letter.
 */
export async function fetchOfferForCandidate(offerId: string, token: string): Promise<OfferLetter> {
    const result = await getOfferFn({ offerId, token });
    return result.data;
}

/** Accept or decline from the candidate page. Accepting requires the typed signature. */
export async function respondToOffer(
    offerId: string,
    action: 'accept' | 'decline',
    token: string,
    signatureName?: string
): Promise<{ status: OfferStatus }> {
    const result = await respondToOfferFn({
        offerId,
        action,
        token,
        ...(signatureName ? { signatureName } : {}),
    });
    return { status: result.data.status };
}

export interface ComposeOfferInput {
    postId: string;
    jobTitle: string;
    companyName: string;
    recruiterId: string;
    recruiterName?: string;
    candidate: { id: string; name: string; email: string };
    designation: string;
    salary: string;
    joiningDate: string;
    location: string;
    notes: string;
}

/**
 * Writes the letter, moves the application to `offer_sent`, notifies the
 * candidate and asks the backend to email the link. Returns the offer id and
 * whether the email went out — a failed email leaves the letter recorded so the
 * recruiter can resend rather than lose the work.
 */
export async function submitOffer(input: ComposeOfferInput): Promise<{ offerId: string; emailed: boolean }> {
    const offerId = offerDocId(input.postId, input.candidate.id);
    const at = nowIso();
    const existing = await getDoc(doc(db, 'offers', offerId));
    const previous = existing.exists() ? (existing.data() as Partial<OfferLetter>) : null;
    const previousStatus = previous?.status;

    if (previousStatus === 'accepted' || previousStatus === 'declined') {
        throw new Error('The candidate has already responded to this offer.');
    }

    const timeline: OfferTimelineEvent[] = Array.isArray(previous?.timeline) ? [...previous!.timeline!] : [];
    if (!previous) timeline.push({ kind: 'created', at, by: input.recruiterName || 'Recruiter' });
    timeline.push({ kind: 'sent', at, by: input.recruiterName || 'Recruiter' });

    const letter: OfferLetter = {
        postId: input.postId,
        candidateId: input.candidate.id,
        candidateName: input.candidate.name,
        candidateEmail: input.candidate.email,
        jobTitle: input.jobTitle,
        designation: input.designation.trim(),
        salary: input.salary.trim(),
        joiningDate: input.joiningDate,
        location: input.location.trim(),
        notes: input.notes.trim(),
        companyName: input.companyName,
        status: 'sent',
        recruiterId: input.recruiterId,
        ...(input.recruiterName ? { recruiterName: input.recruiterName } : {}),
        createdBy: input.recruiterId,
        createdAt: previous?.createdAt || at,
        updatedAt: at,
        sentAt: at,
        timeline,
    };

    await setDoc(
        doc(db, 'offers', offerId),
        { ...letter, ...(previous ? {} : { createdAt: serverTimestamp() }), updatedAt: serverTimestamp() },
        { merge: true }
    );

    // The application stage drives the pipeline and keeps the candidate visible
    // in the Selected tab after the offer goes out.
    await setApplicationStatus(input.postId, input.candidate.id, OFFER_APPLICATION_STATUS.sent, { offerId });

    // Best-effort: a notification failure must not lose the offer itself.
    try {
        await createNotification({
            userId: input.candidate.email,
            type: 'offer_sent',
            title: 'Offer Sent 🎉',
            message: `An offer for ${input.designation || input.jobTitle} is waiting for your response. Open the link in your email to accept or decline.`,
            metadata: { role: input.designation || input.jobTitle, offerId, postId: input.postId },
        });
    } catch (err) {
        console.error('Offer notification failed:', err);
    }

    let emailed = true;
    try {
        await sendOfferLetterEmail(offerId);
        timeline.push({ kind: 'emailed', at: nowIso() });
        await setDoc(doc(db, 'offers', offerId), { timeline, updatedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
        console.error('Offer email failed:', err);
        emailed = false;
    }

    return { offerId, emailed };
}
