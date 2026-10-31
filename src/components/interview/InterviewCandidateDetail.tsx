import { useRecordProfileView } from '@/lib/profileViews';
import type { Candidate, RecruitmentRequest } from "@/types";
import { ArrowLeft, ChevronRight, Check, Calendar, XCircle, Pencil, Loader2 } from "lucide-react";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sendRoundInvite } from "@/lib/emailFunctions";
import { setApplicationStatus } from "@/lib/jobApplications";
import { notifyCandidateOfStatusChange } from '@/lib/notificationHelper';
import { getPostRounds } from '@/lib/interviewRounds';
import popup from '@/components/ui/Popup';
import { useEffect, useState } from "react";
import { useSkin, FOCUS } from '@/styles/skin';

/** Dynamic: determine next round from current status */
function getNextRound(current?: string): string | null {
  if (!current) return 'round1';
  if (current === 'pending') return 'round1';
  const match = current.match(/^round(\d+)$/);
  if (match) return `round${parseInt(match[1]) + 1}`;
  return null;
}

/** Extract round number from status (e.g. "round3" -> 3) */
function getRoundNumber(current?: string): number {
  if (!current) return 0;
  const match = current.match(/^round(\d+)$/);
  return match ? parseInt(match[1]) : 0;
}

/** Prefill: the name configured on the post for the round the candidate moves into next. */
function defaultRoundName(status?: string, post?: RecruitmentRequest | null): string {
  const next = getNextRound(status);
  if (!next) return '';
  return getPostRounds(post)[getRoundNumber(next) - 1]?.name || '';
}

interface Props {
  candidate: Candidate;
  post?: RecruitmentRequest | null;
  onBack: () => void;
  onStatusUpdated?: () => void;
  /** Called after a successful Select so the shell can jump to the Selected Candidates module. */
  onCandidateSelected?: () => void;
}

export default function InterviewCandidateDetail({ candidate, post, onBack, onStatusUpdated, onCandidateSelected }: Props) {
  const interview = (candidate as any).interviewDetails || {};
  const status = (candidate as any).status;
  useRecordProfileView(candidate.id);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [currentSalary, setCurrentSalary] = useState<number>(interview.currentSalary ?? 30000);
  const [expectedSalary, setExpectedSalary] = useState<number>(interview.expectedSalary ?? 30000);
  const [joiningDate, setJoiningDate] = useState<string>(interview.joiningDate ?? new Date().toISOString().split('T')[0]);
  const [yearsExperience, setYearsExperience] = useState<string>(interview.yearsExperience ?? '');
  const [experienceIn, setExperienceIn] = useState<string>(interview.experienceIn ?? '');
  const [readyRelocate, setReadyRelocate] = useState<string>(interview.readyToRelocate ?? '');
  const [feedback, setFeedback] = useState<string>(interview.feedback ?? 'Good');
  const [roundName, setRoundName] = useState<string>(() => defaultRoundName(status, post));
  const [moving, setMoving] = useState(false);
  const [editCurSal, setEditCurSal] = useState(false);
  const [editExpSal, setEditExpSal] = useState(false);
  const [editJoinDate, setEditJoinDate] = useState(false);
  const [editFeedback, setEditFeedback] = useState(false);
  const skin = useSkin();

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

  const nextRound = getNextRound(status);
  const isRound = /^round\d+$/.test(status || '');

  /** Check if status is already 'selected' */
  const isSelected = status === 'selected';

  /** Only the post's last round may select the candidate outright. */
  const isLastRound = isRound && getRoundNumber(status) >= getPostRounds(post).length;

  const moveToNextRound = async () => {
    if (!nextRound || !roundName.trim()) {
      popup.error('Please enter a round name');
      return;
    }
    setMoving(true);
    try {
      const effectiveRoundName = roundName.trim();
      const nextRoundNum = getRoundNumber(nextRound);

      // 1. Update status
      const applicantPostId = (candidate as any).postId;
      if (applicantPostId) {
        await setApplicationStatus(applicantPostId, candidate.id, nextRound);
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
        await setDoc(interviewRef, { ...updatePayload, candidateId: candidate.id, postId: (candidate as any).postId || interview.postId, createdAt: new Date() });
      }

      // 3. Send round invite email
      try {
        const baseUrl = window.location.origin;
        await sendRoundInvite({
          candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
          roundName: effectiveRoundName,
          roundNumber: nextRoundNum,
          role: interview.role || candidate.role || 'the position',
          baseUrl,
        });
      } catch (emailErr) {
        console.error('Failed to send round email:', emailErr);
      }

      void notifyCandidateOfStatusChange({
        candidateId: candidate.id,
        postId: applicantPostId || interview.postId,
        status: nextRound,
        roundLabel: effectiveRoundName,
      });

      popup.success(`Moved to Round ${nextRoundNum} (${effectiveRoundName})`);
      onStatusUpdated?.();
      onBack();
    } catch (err: any) {
      console.error("Failed to update status", err);
      popup.error(err.message || "Failed to update");
    } finally {
      setMoving(false);
    }
  };

  const handleSelect = async () => {
    setMoving(true);
    try {
      const applicantPostId = (candidate as any).postId;
      if (applicantPostId) {
        await setApplicationStatus(applicantPostId, candidate.id, 'selected');
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
        await setDoc(interviewRef, { ...updatePayload, candidateId: candidate.id, postId: (candidate as any).postId || interview.postId, createdAt: new Date() });
      }

      void notifyCandidateOfStatusChange({
        candidateId: candidate.id,
        postId: applicantPostId || interview.postId,
        status: 'selected',
      });

      popup.success("Candidate selected!");
      onStatusUpdated?.();
      if (onCandidateSelected) {
        onCandidateSelected();
      } else {
        onBack();
      }
    } catch (err: any) {
      console.error("Failed to select candidate", err);
      popup.error(err.message || "Failed to select");
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
        await setApplicationStatus(applicantPostId, candidate.id, newStatus);
      } else {
        await updateDoc(doc(db, "candidates", candidate.id), { status: newStatus, updatedAt: new Date() });
      }

      const interviewRef = doc(db, "interviews", candidate.id);
      const intSnap = await getDoc(interviewRef);
      if (intSnap.exists()) {
        await updateDoc(interviewRef, { status: newStatus, updatedAt: new Date() });
      }

      void notifyCandidateOfStatusChange({
        candidateId: candidate.id,
        postId: applicantPostId || interview.postId,
        status: newStatus,
      });

      popup.success("Candidate rejected");
      onStatusUpdated?.();
      onBack();
    } catch (err: any) {
      console.error(err);
      popup.error("Failed to reject");
    }
  };

  /** Present round in the body: the number comes from the status, the name
      from the post's configuration (falling back to the name recorded when
      the candidate was moved in). */
  const presentRoundNum = getRoundNumber(status);
  const presentRoundName = (((isRound && getPostRounds(post)[presentRoundNum - 1]?.name) || interview.roundType || '-').trim()) || '-';
  const presentRoundLabel = isRound
    ? `Round ${presentRoundNum}`
    : status
      ? status.charAt(0).toUpperCase() + status.slice(1)
      : 'Not started';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Masthead - back control beside the identity: the name alone (the
          round number lives in the body), a description underneath; no line
          separator between rows, and the back arrow uses the same
          rounded-lg as the buttons. */}
      <div className={`shrink-0 mb-4 overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash} px-4 py-3.5 sm:px-5`}>
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} rounded-lg cursor-pointer transition-colors duration-200 hover:border-ink/40 hover:text-ink ${FOCUS}`}
            title="Back to list"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className={`${skin.heading} max-w-full truncate`}>{candidate.name}</h1>
            <p className={`mt-1.5 ${skin.body}`}>Review the candidate's interview details and move them forward to the next round.</p>
          </div>
        </div>
      </div>

      {/* Controls row below the header: round name and the round actions
          pinned to the right end, above the body. The round name and move
          action disappear once the candidate is in the post's last round —
          only Select (and Reject) remain. */}
      {isRound && !isSelected && (
        <div className="mb-4 flex shrink-0 flex-wrap items-center justify-end gap-3">
          {!isLastRound && (
            <>
              <input
                id="interview-round-name"
                type="text"
                aria-label="Round name"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                placeholder="e.g. Technical, HR, Manager Round"
                className={`px-3 py-2 rounded-lg w-full sm:w-56 ${skin.field} ${FOCUS}`}
              />
              {nextRound && (
                <button
                  onClick={moveToNextRound}
                  disabled={moving || !roundName.trim()}
                  className={`inline-flex items-center gap-2 rounded-lg cursor-pointer ${skin.cta} ${FOCUS} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {moving ? 'Moving...' : `Move to ${nextRound.replace(/^round/, 'Round ')}`}
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </>
          )}
          {isLastRound && (
            <button
              onClick={handleSelect}
              disabled={moving}
              className={`inline-flex items-center gap-2 rounded-lg cursor-pointer ${skin.cta} ${FOCUS} disabled:opacity-50`}
            >
              {moving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" />}
              {moving ? 'Selecting…' : 'Select'}
            </button>
          )}
          <button
            type="button"
            onClick={handleReject}
            disabled={moving}
            className={`inline-flex items-center px-4 py-2 rounded-lg border border-destructive bg-destructive text-white hover:opacity-90 text-sm font-medium disabled:opacity-50 ${FOCUS}`}
          >
            <XCircle className="h-5 w-5 mr-2" /> Reject
          </button>
        </div>
      )}

      {/* Body - white surface with no shadow; the details themselves sit on
          a grey section inside it, like the Shortlisted module. The vertical
          padding is pinned strips on the panel itself, so it stays at the top
          and bottom of the body by default and while the table scrolls
          between them. */}
      <div className={`flex flex-1 min-h-0 flex-col overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius}`}>
      <div className="h-4 sm:h-6 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-4 sm:px-6">
        <div className={`border ${skin.edge} ${skin.radius} ${skin.canvas} overflow-hidden`}>
        {/* Interview info table */}
        <div className="overflow-x-auto">
          <table className="table-fixed w-auto text-sm">
            <tbody>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Email</th>
                <td className="px-4 py-3 text-ink/80">{candidate.email || '-'}</td>
              </tr>
              {candidate.phone && (
                <tr>
                  <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Phone</th>
                  <td className="px-4 py-3 text-ink/80">{candidate.phone}</td>
                </tr>
              )}
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Round</th>
                <td className="px-4 py-3 text-ink/80">{presentRoundLabel}</td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Round Type</th>
                <td className="px-4 py-3 text-ink/80">{presentRoundName}</td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Interview Role</th>
                <td className="px-4 py-3 text-ink/80">{interview.role || '-'}</td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Interviewers</th>
                <td className="px-4 py-3 text-ink/80">{Array.isArray(interview.interviewers) && interview.interviewers.length ? interview.interviewers.join(', ') : '-'}</td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Proposed Dates</th>
                <td className="px-4 py-3 text-ink/80">
                  {Array.isArray(interview.dates) && interview.dates.length ? interview.dates.join(', ') : '-'}
                </td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Selected Date</th>
                <td className="px-4 py-3">
                  {selectedDate && response === 'accept' ? (
                    <span className="flex items-center text-ink/80"><Calendar className="h-4 w-4 mr-1 text-brand" /> {selectedDate}</span>
                  ) : response && response !== 'accept' ? (
                    <span className="text-destructive">Candidate responded "{response}"</span>
                  ) : (
                    <span className="text-destructive">Awaiting candidate response</span>
                  )}
                </td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Current Salary</th>
                <td className="px-4 py-3">
                  {editCurSal ? (
                    <input type="number" value={currentSalary}
                      onChange={e => setCurrentSalary(parseInt(e.target.value) || 0)}
                      onBlur={() => setEditCurSal(false)}
                      autoFocus
                      className={`px-2 py-1 w-32 ${skin.field} ${FOCUS}`} />
                  ) : (
                    <span className="cursor-pointer" onClick={() => setEditCurSal(true)}>
                      ₹ {currentSalary.toLocaleString()}
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Expected Salary</th>
                <td className="px-4 py-3">
                  {editExpSal ? (
                    <input type="number" value={expectedSalary}
                      onChange={e => setExpectedSalary(parseInt(e.target.value) || 0)}
                      onBlur={() => setEditExpSal(false)}
                      autoFocus
                      className={`px-2 py-1 w-32 ${skin.field} ${FOCUS}`} />
                  ) : (
                    <span className="cursor-pointer" onClick={() => setEditExpSal(true)}>
                      ₹ {expectedSalary.toLocaleString()}
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Date of Joining</th>
                <td className="px-4 py-3">
                  {editJoinDate ? (
                    <input type="date" value={joiningDate}
                      onChange={e => setJoiningDate(e.target.value)}
                      onBlur={() => setEditJoinDate(false)}
                      autoFocus
                      className={`px-2 py-1 ${skin.field} ${FOCUS}`} />
                  ) : (
                    <span className="cursor-pointer" onClick={() => setEditJoinDate(true)}>{joiningDate}</span>
                  )}
                </td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Years of Experience</th>
                <td className="px-4 py-3 text-ink/80">{yearsExperience || '-'}</td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Experience In</th>
                <td className="px-4 py-3 text-ink/80">{experienceIn || '-'}</td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Ready to Relocate</th>
                <td className="px-4 py-3 text-ink/80">{readyRelocate || '-'}</td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Feedback</th>
                <td className="px-4 py-3">
                  {editFeedback ? (
                    <input type="text" value={feedback}
                      onChange={e => setFeedback(e.target.value)}
                      onBlur={() => setEditFeedback(false)}
                      autoFocus
                      className={`px-2 py-1 w-full max-w-xs ${skin.field} ${FOCUS}`} />
                  ) : (
                    <span className="cursor-pointer inline-flex items-center space-x-1 hover:text-brand" onClick={() => setEditFeedback(true)}>
                      <span>{feedback}</span>
                      <Pencil className="h-3.5 w-3.5 text-ink/60" />
                    </span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        </div>
        </div>
      </div>
      <div className="h-4 sm:h-6 shrink-0" aria-hidden="true" />
      </div>
    </div>
  );
}
