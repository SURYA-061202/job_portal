import type { Candidate } from "@/types";
import { ArrowLeft, ChevronRight, Calendar, XCircle } from "lucide-react";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
  const [feedback, setFeedback] = useState<string>(interview.feedback ?? 'Good');
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
        }
      } catch (err) {
        console.error("Failed to fetch interview doc", err);
      }
    };
    fetchInterview();
  }, [candidate.id]);

  /** Determine next round from current status */
  const getNextRound = (current?: string): string | null => {
    switch (current) {
      case "pending":
        return "round1";
      case "round1":
        return "round2";
      case "round2":
        return "round3";
      case "round3":
        return "selected";
      default:
        return null;
    }
  };

  const nextRound = getNextRound(status);

  const moveToNextRound = async () => {
    if (!nextRound) return;
    try {
      const ref = doc(db, "candidates", candidate.id);
      const update: any = { status: nextRound, updatedAt: new Date() };
      if (nextRound === 'round2') {
        update['interviewDetails.roundType'] = 'Technical 2';
      }
      if (nextRound === 'round3') {
        update['interviewDetails.roundType'] = 'HR';
      }
      if (nextRound === 'selected') {
        update['interviewDetails.roundType'] = 'HR';
      }
      update['interviewDetails.currentSalary'] = currentSalary;
      update['interviewDetails.expectedSalary'] = expectedSalary;
      update['interviewDetails.joiningDate'] = joiningDate;
      update['interviewDetails.feedback'] = feedback;
      await updateDoc(ref, update);
      toast.success(`Moved to ${nextRound}`);
      onStatusUpdated?.();
      onBack();
    } catch (err: any) {
      console.error("Failed to update status", err);
      toast.error(err.message || "Failed to update");
    }
  };

  const handleReject = async () => {
    if (!confirm("Reject this candidate?")) return;
    try {
      // Store as e.g. "round1rejected", "round2rejected", etc.
      const newStatus = `${status ?? 'round1'}rejected`;
      await updateDoc(doc(db, "candidates", candidate.id), { status: newStatus, updatedAt: new Date() });
      toast.success("Candidate rejected");
      onStatusUpdated?.();
      onBack();
    } catch (err:any) {
      console.error(err);
      toast.error("Failed to reject");
    }
  };

  const displayedRoundType = status === 'round3' ? 'HR' : (interview.roundType || '-');

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

          {/* action button removed from header */}
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
                      onChange={e=>setCurrentSalary(parseInt(e.target.value)||0)}
                      onBlur={()=>setEditCurSal(false)}
                      autoFocus
                      className="border rounded px-2 py-1 w-32 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"/>
                  ) : (
                    <span className="cursor-pointer" onClick={()=>setEditCurSal(true)}>
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
                      onChange={e=>setExpectedSalary(parseInt(e.target.value)||0)}
                      onBlur={()=>setEditExpSal(false)}
                      autoFocus
                      className="border rounded px-2 py-1 w-32 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"/>
                  ) : (
                    <span className="cursor-pointer" onClick={()=>setEditExpSal(true)}>
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
                      onChange={e=>setJoiningDate(e.target.value)}
                      onBlur={()=>setEditJoinDate(false)}
                      autoFocus
                      className="border rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"/>
                  ) : (
                    <span className="cursor-pointer" onClick={()=>setEditJoinDate(true)}>{joiningDate}</span>
                  )}
                </td>
              </tr>
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Feedback</th>
                <td className="px-4 py-3">
                  {editFeedback ? (
                    <input type="text" value={feedback}
                      onChange={e=>setFeedback(e.target.value)}
                      onBlur={()=>setEditFeedback(false)}
                      autoFocus
                      className="border rounded px-2 py-1 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-primary-500"/>
                  ) : (
                    <span className="cursor-pointer" onClick={()=>setEditFeedback(true)}>{feedback}</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4 pt-6">
          {nextRound && (
            <button
              onClick={moveToNextRound}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 shadow"
            >
              {nextRound === 'selected' ? 'Select' : `Move to ${nextRound.replace(/^./, c=>c.toUpperCase())}`}
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={handleReject}
            className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-medium shadow"
          >
            <XCircle className="h-5 w-5 mr-2" /> Reject Candidate
          </button>
        </div>
      </div>
    </div>
  );
} 