import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';

export interface JobApplication {
  id: string;
  post_id: string;
  user_id: string;
  status: 'applied' | 'reviewed' | 'shortlisted' | 'rejected' | 'hired';
  created_at: Timestamp;
}

// Check if user has already applied for a job
export async function hasUserApplied(
  postId: string,
  userId: string
): Promise<boolean> {
  const q = query(
    collection(db, 'job_applications'),
    where('post_id', '==', postId),
    where('user_id', '==', userId)
  );
  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

// Apply for a job
export async function applyForJob(
  postId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  // Check for duplicate
  const exists = await hasUserApplied(postId, userId);
  if (exists) {
    return { success: false, error: 'You have already applied for this position.' };
  }

  await addDoc(collection(db, 'job_applications'), {
    post_id: postId,
    user_id: userId,
    status: 'applied',
    created_at: serverTimestamp(),
  });

  return { success: true };
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
  const q = query(
    collection(db, 'job_applications'),
    where('post_id', '==', postId),
    where('user_id', '==', userId)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) {
    return { success: false, error: 'Application not found.' };
  }
  await deleteDoc(doc(db, 'job_applications', snapshot.docs[0].id));
  return { success: true };
}
