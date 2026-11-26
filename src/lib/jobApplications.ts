import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  deleteDoc,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { notifyRecruiterOfApplication } from './notificationHelper';
import { getPostLifecycle } from './postLifecycle';
import {
    clearReferralAttribution,
    getReferralAttribution,
    recordReferralConversion,
} from './referrals';
import type { ApplicationSource } from '@/types';

export interface JobApplication {
  id: string;
  post_id: string;
  user_id: string;
  status: string;
  created_at: Timestamp;
  /** Acquisition channel: referral link share, or nothing (organic). */
  source?: ApplicationSource;
}

/** Notes that a job seeker opened a post (feeds the recruiter's Job Views tab). Never throws. */
export async function recordJobView(postId: string, userId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'recruits', postId), { viewedBy: arrayUnion(userId) });
  } catch (err) {
    console.warn('Could not record job view:', err);
  }
}

function applicationId(postId: string, userId: string) {
  return `${postId}_${userId}`;
}

// Check if user has already applied for a job
export async function hasUserApplied(
  postId: string,
  userId: string
): Promise<boolean> {
  const snap = await getDoc(doc(db, 'job_applications', applicationId(postId, userId)));
  return snap.exists();
}

// Get the current pipeline status ('shortlisted', 'round2', 'selected', ...) of a
// user's application to a post, or null if they haven't applied.
export async function getApplicationStatus(
  postId: string,
  userId: string
): Promise<string | null> {
  const snap = await getDoc(doc(db, 'job_applications', applicationId(postId, userId)));
  if (!snap.exists()) return null;
  return (snap.data().status as string) ?? null;
}

// Apply for a job
export async function applyForJob(
  postId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const exists = await hasUserApplied(postId, userId);
  if (exists) {
    return { success: false, error: 'You have already applied for this position.' };
  }

  // Only an open post takes applications (the Firestore rules enforce the same).
  const postSnap = await getDoc(doc(db, 'recruits', postId));
  if (!postSnap.exists()) {
    return { success: false, error: 'This job is no longer available.' };
  }
  const lifecycle = getPostLifecycle(postSnap.data() as Parameters<typeof getPostLifecycle>[0]);
  if (!lifecycle.open) {
    return {
      success: false,
      error: lifecycle.status === 'paused'
        ? 'This job is temporarily not accepting applications.'
        : 'This job is no longer accepting applications.',
    };
  }

  // A visitor who arrived through someone's share link (`/job/{id}?ref=...`) has
  // that referral stamped on the application so recruiters see "source: referral".
  // Self-referrals are ignored; the attribution is only cleared once the write lands.
  const attribution = getReferralAttribution(postId);
  const source: ApplicationSource | undefined =
    attribution && attribution.referrerUid && attribution.referrerUid !== userId
      ? {
          type: 'referral',
          referrerUid: attribution.referrerUid,
          ...(attribution.referrerName ? { referrerName: attribution.referrerName } : {}),
          code: attribution.code,
          at: attribution.at,
        }
      : undefined;

  await setDoc(doc(db, 'job_applications', applicationId(postId, userId)), {
    post_id: postId,
    user_id: userId,
    status: 'applied',
    created_at: serverTimestamp(),
    ...(source ? { source } : {}),
  });

  if (source) {
    clearReferralAttribution(postId);
    // Fire-and-forget: the conversion counter must never fail the application.
    void recordReferralConversion(postId, source, userId);
  }

  // Fire-and-forget: a failed notification must not fail the application.
  void notifyRecruiterOfApplication(postId, userId);

  return { success: true };
}

// Create or update an application's status, keyed by the (postId, userId) pair
export async function upsertApplication(
  postId: string,
  userId: string,
  status: string
): Promise<void> {
  await setDoc(
    doc(db, 'job_applications', applicationId(postId, userId)),
    {
      post_id: postId,
      user_id: userId,
      status,
      created_at: serverTimestamp(),
    },
    { merge: true }
  );
}

// Update an existing application's status. Uses a merge-set rather than
// updateDoc so it never throws if the underlying doc doesn't exist yet.
export async function setApplicationStatus(
  postId: string,
  userId: string,
  status: string,
  /** Extra fields stored with the status, e.g. a rejection reason. */
  extra?: Record<string, unknown>
): Promise<void> {
  await setDoc(
    doc(db, 'job_applications', applicationId(postId, userId)),
    { status, ...(extra ?? {}) },
    { merge: true }
  );
}

// Get all applications for a user
export async function getUserApplications(userId: string): Promise<JobApplication[]> {
  const q = query(
    collection(db, 'job_applications'),
    where('user_id', '==', userId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as JobApplication[];
}

// Get all applications (for counts)
export async function getAllApplications(): Promise<JobApplication[]> {
  const snapshot = await getDocs(collection(db, 'job_applications'));
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as JobApplication[];
}

// Get applicant count per post
export async function getApplicantCounts(): Promise<Record<string, number>> {
  const allApps = await getAllApplications();
  const counts: Record<string, number> = {};
  allApps.forEach((app) => {
    if (app.post_id) {
      counts[app.post_id] = (counts[app.post_id] || 0) + 1;
    }
  });
  return counts;
}

// Get applications for a specific post
export async function getPostApplications(postId: string): Promise<JobApplication[]> {
  const q = query(
    collection(db, 'job_applications'),
    where('post_id', '==', postId)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as JobApplication[];
}

// Withdraw application
export async function withdrawApplication(
  postId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const appRef = doc(db, 'job_applications', applicationId(postId, userId));
  const snap = await getDoc(appRef);
  if (!snap.exists()) {
    return { success: false, error: 'Application not found.' };
  }
  await deleteDoc(appRef);
  return { success: true };
}
