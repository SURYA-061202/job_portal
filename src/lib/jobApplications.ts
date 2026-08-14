import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export interface JobApplication {
  id: string;
  post_id: string;
  user_id: string;
  status: string;
  created_at: Timestamp;
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

  await setDoc(doc(db, 'job_applications', applicationId(postId, userId)), {
    post_id: postId,
    user_id: userId,
    status: 'applied',
    created_at: serverTimestamp(),
  });

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
  status: string
): Promise<void> {
  await setDoc(
    doc(db, 'job_applications', applicationId(postId, userId)),
    { status },
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
