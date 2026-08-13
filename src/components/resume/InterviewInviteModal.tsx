import { useState, useEffect } from 'react';
import type { Candidate, RecruitmentRequest } from '@/types';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { sendInterviewInvite } from '@/lib/emailFunctions';
import { upsertApplication, setApplicationStatus } from '@/lib/jobApplications';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { createInterviewInviteNotification } from '@/lib/notificationHelper';

interface Props {
  candidate: Candidate;
  onClose: () => void;
  onSent?: () => void;
  /** Post to pre-select for manual candidates (the post whose candidate list this invite was opened from). */
  defaultPostId?: string | null;
}

export default function InterviewInviteModal({ candidate, onClose, onSent, defaultPostId }: Props) {
  const [role, setRole] = useState(candidate.role || '');
  const [dates, setDates] = useState<string[]>(['', '', '']);
  const [roundType, setRoundType] = useState('Technical');
  const [interviewers, setInterviewers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobPosts, setJobPosts] = useState<RecruitmentRequest[]>([]);
  const [selectedPostId, setSelectedPostId] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [recruiters, setRecruiters] = useState<{ id: string; name: string }[]>([]);
  const [loadingRecruiters, setLoadingRecruiters] = useState(false);
  const interviewurl = `${window.location.origin}`;

  const handleCheckbox = (name: string) => {
    setInterviewers((prev) =>
      prev.includes(name) ? prev.filter((i) => i !== name) : [...prev, name]
    );
  };

  const handleDateChange = (idx: number, value: string) => {
    setDates((prev) => prev.map((d, i) => (i === idx ? value : d)));
  };

  useEffect(() => {
    // Fetch recruiters from Firestore
    const fetchRecruiters = async () => {
      try {
        setLoadingRecruiters(true);
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('role', 'in', ['recruiter', 'admin', 'manager']));
        const snapshot = await getDocs(q);
        const recruiterList = snapshot.docs.map(doc => {
          const data = doc.data();
          const name = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || 'Unnamed';
          return { id: doc.id, name };
        });
        setRecruiters(recruiterList);
      } catch (error) {
        console.error('Error fetching recruiters:', error);
      } finally {
        setLoadingRecruiters(false);
      }
    };
    fetchRecruiters();
  }, []);

  useEffect(() => {
    // Only fetch job posts if this candidate doesn't have a postId (manual candidate)
    const isJobApplicant = !!(candidate as any).postId;
    if (!isJobApplicant) {
      const fetchJobs = async () => {
        try {
          setLoadingJobs(true);
          const q = query(collection(db, 'recruits'), orderBy('createdAt', 'desc'));
          const snapshot = await getDocs(q);
          const fetchedJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecruitmentRequest));
          setJobPosts(fetchedJobs);

          // Default to the post this invite was opened from, if any
          if (defaultPostId) {
            setSelectedPostId(defaultPostId);
            const defaultJob = fetchedJobs.find(j => j.id === defaultPostId);
            if (defaultJob) setRole(defaultJob.jobTitle);
          }
        } catch (error) {
          console.error('Error fetching jobs:', error);
        } finally {
          setLoadingJobs(false);
        }
      };
      fetchJobs();
    }
  }, [candidate, defaultPostId]);

  const handlePostChange = (postId: string) => {
    setSelectedPostId(postId);
    const selectedJob = jobPosts.find(j => j.id === postId);
    if (selectedJob) {
      setRole(selectedJob.jobTitle);
    }
  };

  const handleSend = async () => {
    const isJobApplicant = !!(candidate as any).postId;
    if (!role || dates.some((d) => !d) || !roundType || interviewers.length === 0) {
      toast.error('Please fill all fields');
      return;
    }

    if (!isJobApplicant && !selectedPostId) {
      toast.error('Please select a job position');
      return;
    }

    try {
      setLoading(true);
      const effectivePostId = isJobApplicant ? (candidate as any).postId : selectedPostId;
      await sendInterviewInvite({
        candidate,
        interviewDetails: { role, dates, roundType, interviewers, baseUrl: interviewurl, postId: effectivePostId },
        baseUrl: interviewurl,
      });

      // isJobApplicant (declared above): job applicants have postId (set when fetching
      // from job_applications); manual candidates are in the 'candidates' collection without postId

      // Always update the candidate's document with postId and status
      try {
        const candidateRef = doc(db, 'candidates', candidate.id);
        const snap = await getDoc(candidateRef);
        const todayStr = new Date().toISOString().split('T')[0];

        if (snap.exists()) {
          await updateDoc(candidateRef, {
            status: 'shortlisted',
            postId: effectivePostId,
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
          console.log('[InterviewInvite] Updated candidate document:', candidate.id);
        } else {
          console.log('[InterviewInvite] Candidate document not found:', candidate.id);
        }
      } catch (err) {
        console.error('Failed to update candidate document:', err);
      }

      // Always create/upsert the job application
      try {
        console.log('[InterviewInvite] Creating/updating application:', { user_id: candidate.id, post_id: effectivePostId });
        await upsertApplication(effectivePostId, candidate.id, 'shortlisted');
        console.log('[InterviewInvite] Application created/updated successfully');
      } catch (appError: any) {
        console.error('Error creating job application:', appError);
        toast.error(`Sync Error: ${appError.message}`);
      }

      // Store interview details in interviews collection for both types
      try {
        const { setDoc } = await import('firebase/firestore');
        const interviewRef = doc(db, 'interviews', candidate.id);
        const todayStr = new Date().toISOString().split('T')[0];
        await setDoc(interviewRef, {
          postId: effectivePostId,
          role,
          dates,
          roundType,
          interviewers,
          currentSalary: 30000,
          expectedSalary: 30000,
          joiningDate: todayStr,
          feedback: 'Good',
          sentAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        console.error('Failed to store interview details', err);
      }

      // Create notification for the candidate
      try {
        await createInterviewInviteNotification(candidate.email, role, dates, roundType);
      } catch (err) {
        console.error('Failed to create notification', err);
      }

      toast.success('Email sent successfully');
      onSent?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-surface w-full max-w-lg rounded-lg shadow-lg p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-semibold mb-4">Send Interview Invite</h2>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Job Selection for Manual Candidates */}
          {!((candidate as any).postId) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Select Job Position</label>
              <select
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand hover:border-gray-400 transition-colors bg-surface"
                value={selectedPostId}
                onChange={(e) => handlePostChange(e.target.value)}
                disabled={loadingJobs}
              >
                <option value="">-- Choose Job --</option>
                {jobPosts.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.jobTitle}
                  </option>
                ))}
              </select>
              {loadingJobs && <p className="text-xs text-gray-400 mt-1">Loading jobs...</p>}
            </div>
          )}

          {/* Interview Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interview Role</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand hover:border-gray-400 transition-colors"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>

          {/* Dates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Choose Three Dates</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {dates.map((d, idx) => (
                <input
                  key={idx}
                  type="date"
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand hover:border-gray-400 transition-colors"
                  value={d}
                  onChange={(e) => handleDateChange(idx, e.target.value)}
                />
              ))}
            </div>
          </div>

          {/* Round Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Round Type</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand hover:border-gray-400 transition-colors"
              value={roundType}
              onChange={(e) => setRoundType(e.target.value)}
            />
          </div>

          {/* Interviewers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interviewers</label>
            {loadingRecruiters ? (
              <p className="text-xs text-gray-400">Loading interviewers...</p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {recruiters.map((recruiter) => (
                  <label key={recruiter.id} className="inline-flex items-center text-sm rounded hover:bg-brand/10 px-2 py-1 transition-colors">
                    <input
                      type="checkbox"
                      className="form-checkbox h-4 w-4 text-brand mr-2"
                      checked={interviewers.includes(recruiter.name)}
                      onChange={() => handleCheckbox(recruiter.name)}
                    />
                    {recruiter.name}
                  </label>
                ))}
                {recruiters.length === 0 && (
                  <p className="text-xs text-gray-400">No interviewers found</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border rounded-md text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            className="px-4 py-2 text-sm font-medium rounded-md text-white bg-brand hover:bg-brand disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
} 