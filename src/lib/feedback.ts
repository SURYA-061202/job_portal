import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import type { MessagingProfile } from './messaging';
import { toMillis } from './profileViews';

/**
 * A person's review of the portal itself: five stars and a few words, one per
 * account. Job seekers and recruiters write it; the admin reads them all.
 */
export interface Feedback {
    id: string;
    userId: string;
    userName: string;
    /** Their account role: 'user', 'recruiter' or 'manager'. */
    userRole: string;
    /** 1 to 5. */
    rating: number;
    comment: string;
    createdAt?: unknown;
    updatedAt?: unknown;
}

export const MAX_FEEDBACK = 1000;

const feedbackRef = (uid: string) => doc(db, 'platform_reviews', uid);

export async function getMyFeedback(uid: string): Promise<Feedback | null> {
    const snap = await getDoc(feedbackRef(uid));
    return snap.exists() ? ({ id: snap.id, ...snap.data() }) as Feedback : null;
}

/** Saves the review, replacing the person's earlier one if they wrote one. */
export async function saveFeedback(profile: MessagingProfile, rating: number, comment: string, isNew: boolean): Promise<void> {
    await setDoc(feedbackRef(profile.uid), {
        userId: profile.uid,
        userName: profile.name,
        userRole: profile.userRole,
        rating,
        comment: comment.trim().slice(0, MAX_FEEDBACK),
        ...(isNew ? { createdAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
    }, { merge: true });
}

/** Admin: every review, newest first. */
export async function listFeedback(): Promise<Feedback[]> {
    const snap = await getDocs(collection(db, 'platform_reviews'));
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as Feedback)
        .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
}
