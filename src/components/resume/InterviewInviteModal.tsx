import { useState, useEffect } from 'react';
import type { Candidate, RecruitmentRequest } from '@/types';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, collection, query, orderBy, getDocs } from 'firebase/firestore';
import { createInterviewInviteNotification } from '@/lib/notificationHelper';

interface Props {
  candidate: Candidate;
  onClose: () => void;
  onSent?: () => void;
}

export default function InterviewInviteModal({ candidate, onClose, onSent }: Props) {
  const [role, setRole] = useState(candidate.role || '');
  const [dates, setDates] = useState<string[]>(['', '', '']);
  const [roundType, setRoundType] = useState('Technical');
  const [interviewers, setInterviewers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobPosts, setJobPosts] = useState<RecruitmentRequest[]>([]);
  const [selectedPostId, setSelectedPostId] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(false);
  const interviewurl = `${window.location.origin}`;
  const interviewerOptions = ['Dhinesh Kumar', 'Naresh Kumar', 'Manthra'];

  const handleCheckbox = (name: string) => {
    setInterviewers((prev) =>
      prev.includes(name) ? prev.filter((i) => i !== name) : [...prev, name]
    );
  };

  const handleDateChange = (idx: number, value: string) => {
    setDates((prev) => prev.map((d, i) => (i === idx ? value : d)));
  };

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
        } catch (error) {
          console.error('Error fetching jobs:', error);
        } finally {
          setLoadingJobs(false);
        }
      };
      fetchJobs();
    }
  }, [candidate]);

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
      const { data, error } = await supabase.functions.invoke('send_interview_invite', {
        body: {
          candidate,
          interviewDetails: { role, dates, roundType, interviewers, baseUrl: interviewurl },
          baseUrl: interviewurl,
        },
      });

      if (error || !data?.success) throw new Error(error?.message || data?.error || 'Failed to send');

      // Determine if this is a manually uploaded candidate or a job applicant
      // Job applicants have postId (set when fetching from job_applications)
      // Manual candidates are in the 'candidates' collection without postId
      const isJobApplicant = !!(candidate as any).postId;

      if (!isJobApplicant) {
        try {
          const candidateRef = doc(db, 'candidates', candidate.id);
          const snap = await getDoc(candidateRef);
          const todayStr = new Date().toISOString().split('T')[0];

          if (snap.exists()) {
            await updateDoc(candidateRef, {
              status: 'shortlisted',
              postId: selectedPostId, // Link to selected post
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
          }

          // Also create a job_application in Supabase to make it show up in the specific post view
          const { error: appError } = await supabase
            .from('job_applications')
            .upsert({
              user_id: candidate.id,
              post_id: selectedPostId,
              status: 'shortlisted',
              created_at: new Date().toISOString()
            }, { onConflict: 'user_id, post_id' });

          if (appError) {
            console.error('Error creating job application in Supabase:', appError);
            toast.error(`Supabase Sync Error: ${appError.message}`);
          }

        } catch (err) {
          console.error('Failed to update candidate after sending invite', err);
        }
      } else {
        // Update job application status in Supabase for job applicants
        try {
          console.log('[InterviewInvite] Updating application:', { user_id: candidate.id, post_id: (candidate as any).postId });

          let query = supabase
            .from('job_applications')
            .update({ status: 'shortlisted' })
            .eq('user_id', candidate.id);

          if ((candidate as any).postId) {
            query = query.eq('post_id', (candidate as any).postId);
          }

          const { error: updateError, data: updateData } = await query.select();

          if (updateError) {
            console.error('[InterviewInvite] Failed to update:', updateError);
          } else {
            console.log('[InterviewInvite] Successfully updated:', updateData);
          }
        } catch (err) {
          console.error('Failed to update job application after sending invite', err);
        }
      }

      // Store interview details in interviews collection for both types
      try {
        const { setDoc } = await import('firebase/firestore');
        const interviewRef = doc(db, 'interviews', candidate.id);
        const todayStr = new Date().toISOString().split('T')[0];
        await setDoc(interviewRef, {
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
      <div className="bg-white w-full max-w-lg rounded-lg shadow-lg p-6 relative">
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
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 hover:border-gray-400 transition-colors bg-white"
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
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 hover:border-gray-400 transition-colors"
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
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 hover:border-gray-400 transition-colors"
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
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 hover:border-gray-400 transition-colors"
              value={roundType}
              onChange={(e) => setRoundType(e.target.value)}
            />
          </div>

          {/* Interviewers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interviewers</label>
            <div className="grid grid-cols-1 gap-2">
              {interviewerOptions.map((name) => (
                <label key={name} className="inline-flex items-center text-sm rounded hover:bg-primary-50 px-2 py-1 transition-colors">
                  <input
                    type="checkbox"
                    className="form-checkbox h-4 w-4 text-primary-600 mr-2"
                    checked={interviewers.includes(name)}
                    onChange={() => handleCheckbox(name)}
                  />
                  {name}
                </label>
              ))}
            </div>
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
            className="px-4 py-2 text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
} 