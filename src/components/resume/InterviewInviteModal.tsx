import { errorMessage } from '@/lib/errors';
import { useState, useEffect } from 'react';
import type { Candidate, RecruitmentRequest } from '@/types';
import { X } from 'lucide-react';
import popup from '@/components/ui/Popup';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { sendInterviewInviteToCandidate } from '@/lib/interviewInvite';
import { getPostRounds, getRoundLabel } from '@/lib/interviewRounds';
import { useSkin, FOCUS } from '@/styles/skin';

interface Props {
  candidate: Candidate;
  onClose: () => void;
  onSent?: () => void;
  /** Post to pre-select for manual candidates (the post whose candidate list this invite was opened from). */
  defaultPostId?: string | null;
}

/** Round Type always mirrors the post's first interview round. */
const roundTypeForPost = (post?: RecruitmentRequest | null): string => {
  if (!post) return 'Technical';
  const first = getPostRounds(post)[0];
  return first.name || getRoundLabel(first);
};

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
  const skin = useSkin();
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
    // An invite is always raised against one post: the candidate's own application
    // if they have one, otherwise the post whose candidate list this was opened from.
    const applicantPostId = candidate.postId as string | undefined;
    const effectivePostId = applicantPostId || defaultPostId || '';

    const fetchJobs = async () => {
      try {
        setLoadingJobs(true);
        const q = query(collection(db, 'recruits'), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        const fetchedJobs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RecruitmentRequest));
        setJobPosts(fetchedJobs);

        if (effectivePostId) {
          // Manual candidates pick their post from the dropdown below; preselect it.
          if (!applicantPostId) setSelectedPostId(effectivePostId);
          // The interview is for the post's role, not whatever the resume listed.
          const effectiveJob = fetchedJobs.find(j => j.id === effectivePostId);
          if (effectiveJob?.jobTitle) setRole(effectiveJob.jobTitle);
          // Round Type comes from the post's first interview round.
          if (effectiveJob) setRoundType(roundTypeForPost(effectiveJob));
        }
      } catch (error) {
        console.error('Error fetching jobs:', error);
      } finally {
        setLoadingJobs(false);
      }
    };
    fetchJobs();
  }, [candidate, defaultPostId]);

  const handlePostChange = (postId: string) => {
    setSelectedPostId(postId);
    const selectedJob = jobPosts.find(j => j.id === postId);
    if (selectedJob) {
      setRole(selectedJob.jobTitle);
      setRoundType(roundTypeForPost(selectedJob));
    }
  };

  const handleSend = async () => {
    const isJobApplicant = !!candidate.postId;
    if (!role || dates.some((d) => !d) || !roundType || interviewers.length === 0) {
      popup.error('Please fill all fields');
      return;
    }

    if (!isJobApplicant && !selectedPostId) {
      popup.error('Please select a job position');
      return;
    }

    try {
      setLoading(true);
      const effectivePostId = isJobApplicant ? candidate.postId : selectedPostId;

      // Shared with the bulk invite flow: email + candidate doc + application
      // + interviews/{id} + notification + profile activity, in one place.
      await sendInterviewInviteToCandidate({
        candidate,
        role,
        dates,
        roundType,
        interviewers,
        postId: effectivePostId!,
        baseUrl: interviewurl,
      });

      popup.success('Email sent successfully');
      onSent?.();
      onClose();
    } catch (err: unknown) {
      popup.error(errorMessage(err) || 'Failed to send email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className={`w-full max-w-lg p-6 relative border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
        <button
          onClick={onClose}
          className={`absolute top-3 right-3 text-ink/60 hover:text-ink hover:bg-ink/5 ${skin.radius} transition-colors ${FOCUS}`}
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className={`${skin.heading} mb-4`}>Send Interview Invite</h2>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Job Selection for Manual Candidates */}
          {!(candidate.postId) && (
            <div>
              <label className="block text-sm font-medium text-ink/80 mb-1">Select Job Position</label>
              <select
                className={`w-full px-3 py-2 rounded-lg ${skin.field} ${FOCUS}`}
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
              {loadingJobs && <p className={`mt-1 ${skin.meta}`}>Loading jobs...</p>}
            </div>
          )}

          {/* Interview Role */}
          <div>
            <label className="block text-sm font-medium text-ink/80 mb-1">Interview Role</label>
            <input
              type="text"
              className={`w-full px-3 py-2 rounded-lg ${skin.field} ${FOCUS}`}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>

          {/* Dates */}
          <div>
            <label className="block text-sm font-medium text-ink/80 mb-1">Choose Three Dates</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {dates.map((d, idx) => (
                <input
                  key={idx}
                  type="date"
                  className={`px-3 py-2 rounded-lg ${skin.field} ${FOCUS}`}
                  value={d}
                  onChange={(e) => handleDateChange(idx, e.target.value)}
                />
              ))}
            </div>
          </div>

          {/* Round Type is intentionally not a field here: it is derived from
              the post's first interview round and only used when sending. */}

          {/* Interviewers */}
          <div>
            <label className="block text-sm font-medium text-ink/80 mb-1">Interviewers</label>
            {loadingRecruiters ? (
              <p className={skin.meta}>Loading interviewers...</p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {recruiters.map((recruiter) => (
                  <label key={recruiter.id} className="inline-flex items-center text-sm rounded-lg hover:bg-brand/10 px-2 py-1 transition-colors">
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
                  <p className={skin.meta}>No interviewers found</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className={`cursor-pointer rounded-lg ${skin.secondary} ${FOCUS}`}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            className={`inline-flex items-center gap-2 cursor-pointer rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}
            disabled={loading}
          >
            {loading ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
} 