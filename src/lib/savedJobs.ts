import { arrayRemove, arrayUnion, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * A job seeker's saved jobs live on their own profile as `savedJobs: string[]`
 * (post ids). The profile is already owner-writable, so no extra rules are needed.
 */

/** Post ids the user has saved; empty when none or the profile can't be read. */
export async function getSavedJobIds(userId: string): Promise<string[]> {
  try {
    const snap = await getDoc(doc(db, 'users', userId));
    const ids = snap.exists() ? snap.data().savedJobs : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch (err) {
    console.warn('Could not load saved jobs:', err);
    return [];
  }
}

/** Saves or un-saves a post for the user. Throws on failure so the caller can revert its UI. */
export async function setJobSaved(userId: string, postId: string, saved: boolean): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    savedJobs: saved ? arrayUnion(postId) : arrayRemove(postId),
  });
}
