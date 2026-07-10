import type { Candidate } from "@/types";
import { ArrowLeft, ChevronRight, Check, Calendar, XCircle, Pencil } from "lucide-react";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import toast from "react-hot-toast";
import { useEffect, useState } from "react";

interface Props {
  candidate: Candidate;
  onBack: () => void;
  onStatusUpdated?: () => void;
}

export default function InterviewCandidateDetail({ candidate, onBack, onStatusUpdated }: Props) {
  const interview = (candidate as any).interviewDetails || {};
  const status = (candidate as any).status;

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [currentSalary, setCurrentSalary] = useState<number>(interview.currentSalary ?? 30000);
  const [expectedSalary, setExpectedSalary] = useState<number>(interview.expectedSalary ?? 30000);
  const [joiningDate, setJoiningDate] = useState<string>(interview.joiningDate ?? new Date().toISOString().split('T')[0]);
  const [yearsExperience, setYearsExperience] = useState<string>(interview.yearsExperience ?? '');
  const [experienceIn, setExperienceIn] = useState<string>(interview.experienceIn ?? '');
  const [readyRelocate, setReadyRelocate] = useState<string>(interview.readyToRelocate ?? '');
  const [feedback, setFeedback] = useState<string>(interview.feedback ?? 'Good');
  const [roundName, setRoundName] = useState<string>('');
  const [moving, setMoving] = useState(false);
  const [editCurSal, setEditCurSal] = useState(false);
  const [editExpSal, setEditExpSal] = useState(false);
  const [editJoinDate, setEditJoinDate] = useState(false);
  const [editFeedback, setEditFeedback] = useState(false);

  useEffect(() => {
    const fetchInterview = async () => {
      try {
        const ref = doc(db, "interviews", candidate.id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data() as any;
          setSelectedDate(data.selectedDate ?? null);
          setResponse(data.response ?? null);
          if (data.currentSalary) setCurrentSalary(data.currentSalary);
          if (data.expectedSalary) setExpectedSalary(data.expectedSalary);
          if (data.joiningDate) setJoiningDate(data.joiningDate);
          if (data.yearsExperience) setYearsExperience(data.yearsExperience);
          if (data.experienceIn) setExperienceIn(data.experienceIn);
          if (data.readyToRelocate) setReadyRelocate(data.readyToRelocate);
        }
      } catch (err) {
        console.error("Failed to fetch interview doc", err);
      }
    };
    fetchInterview();
  }, [candidate.id]);

  /** Dynamic: determine next round from current status */
  const getNextRound = (current?: string): string | null => {
    if (!current) return 'round1';
    if (current === 'pending') return 'round1';
    const match = current.match(/^round(\d+)$/);
    if (match) return `round${parseInt(match[1]) + 1}`;
    return null;
  };

  /** Extract round number from status (e.g. "round3" -> 3) */
  const getRoundNumber = (current?: string): number => {
    if (!current) return 0;
    const match = current.match(/^round(\d+)$/);
    return match ? parseInt(match[1]) : 0;
  };

  const nextRound = getNextRound(status);
  const isRound = /^round\d+$/.test(status || '');

  /** Check if status is already 'selected' */
  const isSelected = status === 'selected';

  const moveToNextRound = async () => {
    if (!nextRound || !roundName.trim()) {
      toast.error('Please enter a round name');
      return;
    }
    setMoving(true);
    try {
      const effectiveRoundName = roundName.trim();
      const nextRoundNum = getRoundNumber(nextRound);

      // 1. Update status
      const applicantPostId = (candidate as any).postId;
      if (applicantPostId) {
        const { error } = await supabase
          .from('job_applications')
          .update({ status: nextRound })
          .eq('user_id', candidate.id)
          .eq('post_id', applicantPostId);
        if (error) throw error;
      } else {
        await updateDoc(doc(db, "candidates", candidate.id), {
          status: nextRound,
          updatedAt: new Date()
        });
      }

      // 2. Update interviews collection
      const interviewRef = doc(db, "interviews", candidate.id);
      const intSnap = await getDoc(interviewRef);
      const updatePayload = {
        currentSalary,
        expectedSalary,
        joiningDate,
        feedback,
        roundType: effectiveRoundName,
        status: nextRound,
        updatedAt: new Date()
      };

      if (intSnap.exists()) {
        await updateDoc(interviewRef, updatePayload);
      } else {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(interviewRef, { ...updatePayload, candidateId: candidate.id, createdAt: new Date() });
      }

      // 3. Send round invite email
      try {
        const baseUrl = window.location.origin;
        await supabase.functions.invoke('send_round_invite', {
          body: {
            candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
            roundName: effectiveRoundName,
            roundNumber: nextRoundNum,
            role: interview.role || candidate.role || 'the position',
            baseUrl
          }
        });
      } catch (emailErr) {
        console.error('Failed to send round email:', emailErr);
      }

      toast.success(`Moved to Round ${nextRoundNum} (${effectiveRoundName})`);
      onStatusUpdated?.();
      onBack();
    } catch (err: any) {
      console.error("Failed to update status", err);
      toast.error(err.message || "Failed to update");
    } finally {
      setMoving(false);
    }
  };

  const handleSelect = async () => {
    if (!confirm("Select this candidate?")) return;
    setMoving(true);
    try {
      const applicantPostId = (candidate as any).postId;
      if (applicantPostId) {
        const { error } = await supabase
          .from('job_applications')
          .update({ status: 'selected' })
          .eq('user_id', candidate.id)
          .eq('post_id', applicantPostId);
        if (error) throw error;
      } else {
        await updateDoc(doc(db, "candidates", candidate.id), {
          status: 'selected',
          updatedAt: new Date()
        });
      }

      const interviewRef = doc(db, "interviews", candidate.id);
      const intSnap = await getDoc(interviewRef);
      const updatePayload = {
        currentSalary,
        expectedSalary,
        joiningDate,
        feedback,
        status: 'selected',
        updatedAt: new Date()
      };

      if (intSnap.exists()) {
        await updateDoc(interviewRef, updatePayload);
      } else {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(interviewRef, { ...updatePayload, candidateId: candidate.id, createdAt: new Date() });
      }

      toast.success("Candidate selected!");
      onStatusUpdated?.();
      onBack();
    } catch (err: any) {
      console.error("Failed to select candidate", err);
      toast.error(err.message || "Failed to select");
    } finally {
      setMoving(false);
    }
  };

  const handleReject = async () => {
    if (!confirm("Reject this candidate?")) return;
    try {
      const newStatus = `${status ?? 'round1'}rejected`;
      const applicantPostId = (candidate as any).postId;

      if (applicantPostId) {
        const { error } = await supabase
          .from('job_applications')
          .update({ status: newStatus })
          .eq('user_id', candidate.id)
          .eq('post_id', applicantPostId);
        if (error) throw error;
      } else {
        await updateDoc(doc(db, "candidates", candidate.id), { status: newStatus, updatedAt: new Date() });
      }

      const interviewRef = doc(db, "interviews", candidate.id);
      const intSnap = await getDoc(interviewRef);
      if (intSnap.exists()) {
        await updateDoc(interviewRef, { status: newStatus, updatedAt: new Date() });
      }

      toast.success("Candidate rejected");
      onStatusUpdated?.();
      onBack();
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to reject");
    }
  };

  const displayedRoundType = interview.roundType || '-';

  return (
    <div className="space-y-6">
      <button
        className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
        onClick={onBack}
      >
        <ArrowLeft className="h-5 w-5" />
        <span>Back to List</span>
      </button>

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-gray-900">{candidate.name}</h2>
            <p className="text-gray-600 text-sm">
              {candidate.email}
              {candidate.phone && (
                <>
                  <span className="mx-2 text-gray-400">•</span>
                  {candidate.phone}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Interview info table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <tbody className="divide-y divide-gray-100">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-48">Round</th>
                <td className="px-4 py-3 text-gray-800 capitalize">{status || 'Not started'}</td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Round Type</th>
                <td className="px-4 py-3 text-gray-800">{displayedRoundType}</td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Interview Role</th>
                <td className="px-4 py-3 text-gray-800">{interview.role || '-'}</td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Interviewers</th>
                <td className="px-4 py-3 text-gray-800">{Array.isArray(interview.interviewers) && interview.interviewers.length ? interview.interviewers.join(', ') : '-'}</td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Proposed Dates</th>
                <td className="px-4 py-3 text-gray-800">
                  {Array.isArray(interview.dates) && interview.dates.length ? interview.dates.join(', ') : '-'}
                </td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Selected Date</th>
                <td className="px-4 py-3">
                  {selectedDate && response === 'accept' ? (
                    <span className="flex items-center text-gray-800"><Calendar className="h-4 w-4 mr-1 text-primary-600" /> {selectedDate}</span>
                  ) : response && response !== 'accept' ? (
                    <span className="text-red-600">Candidate responded "{response}"</span>
                  ) : (
                    <span className="text-red-600">Awaiting candidate response</span>
                  )}
                </td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Current Salary</th>
                <td className="px-4 py-3">
                  {editCurSal ? (
                    <input type="number" value={currentSalary}
                      onChange={e => setCurrentSalary(parseInt(e.target.value) || 0)}
                      onBlur={() => setEditCurSal(false)}
                      autoFocus
                      className="border rounded px-2 py-1 w-32 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  ) : (
                    <span className="cursor-pointer" onClick={() => setEditCurSal(true)}>
                      ₹ {currentSalary.toLocaleString()}
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Expected Salary</th>
                <td className="px-4 py-3">
                  {editExpSal ? (
                    <input type="number" value={expectedSalary}
                      onChange={e => setExpectedSalary(parseInt(e.target.value) || 0)}
                      onBlur={() => setEditExpSal(false)}
                      autoFocus
                      className="border rounded px-2 py-1 w-32 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  ) : (
                    <span className="cursor-pointer" onClick={() => setEditExpSal(true)}>
                      ₹ {expectedSalary.toLocaleString()}
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Date of Joining</th>
                <td className="px-4 py-3">
                  {editJoinDate ? (
                    <input type="date" value={joiningDate}
                      onChange={e => setJoiningDate(e.target.value)}
                      onBlur={() => setEditJoinDate(false)}
                      autoFocus
                      className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  ) : (
                    <span className="cursor-pointer" onClick={() => setEditJoinDate(true)}>{joiningDate}</span>
                  )}
                </td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Years of Experience</th>
                <td className="px-4 py-3 text-gray-800">{yearsExperience || '-'}</td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Experience In</th>
                <td className="px-4 py-3 text-gray-800">{experienceIn || '-'}</td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Ready to Relocate</th>
                <td className="px-4 py-3 text-gray-800">{readyRelocate || '-'}</td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Feedback</th>
                <td className="px-4 py-3">
                  {editFeedback ? (
                    <input type="text" value={feedback}
                      onChange={e => setFeedback(e.target.value)}
                      onBlur={() => setEditFeedback(false)}
                      autoFocus
                      className="border rounded px-2 py-1 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  ) : (
                    <span className="cursor-pointer inline-flex items-center space-x-1 hover:text-primary-600" onClick={() => setEditFeedback(true)}>
                      <span>{feedback}</span>
                      <Pencil className="h-3.5 w-3.5 text-gray-400" />
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Round Name Input + Actions */}
        {isRound && !isSelected && (
          <div className="border-t border-gray-200 pt-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
              <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Round Name:</label>
              <input
                type="text"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                placeholder="e.g. Technical, HR, Manager Round"
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 w-full sm:w-56"
              />
              {nextRound && (
                <button
                  onClick={moveToNextRound}
                  disabled={moving || !roundName.trim()}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 shadow disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {moving ? 'Moving...' : `Move to ${nextRound.replace(/^round/, 'Round ')}`}
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={handleSelect}
                disabled={moving}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 shadow disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                Select
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={moving}
                className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium shadow disabled:opacity-50"
              >
                <XCircle className="h-5 w-5 mr-2" /> Reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
