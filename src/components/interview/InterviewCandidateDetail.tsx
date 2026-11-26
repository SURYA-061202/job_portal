import { errorMessage } from '@/lib/errors';
import { useRecordProfileView } from '@/lib/profileViews';
import type { Candidate, RecruitmentRequest } from "@/types";
import { ChevronRight, Check, Calendar, XCircle, Pencil, Loader2 } from "lucide-react";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { sendRoundInvite, sendRejectionMail } from "@/lib/emailFunctions";
import { setApplicationStatus } from "@/lib/jobApplications";
import { notifyCandidateOfStatusChange } from '@/lib/notificationHelper';
import { getPostRounds } from '@/lib/interviewRounds';
import popup from '@/components/ui/Popup';
import { useEffect, useState } from "react";
import { useSkin, FOCUS } from '@/styles/skin';

/** Shortest rejection reason accepted; the email function enforces the same floor. */
const MIN_REASON = 10;
const MAX_REASON = 1000;

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
  /** Collapses the expanded row. */
  onClose: () => void;
  onStatusUpdated?: () => void;
  /** Called after a successful Select so the shell can jump to the Selected Candidates module. */
  onCandidateSelected?: () => void;
}

export default function InterviewCandidateDetail({ candidate, post, onClose, onStatusUpdated, onCandidateSelected }: Props) {
  const interview = candidate.interviewDetails || {};
  const status = candidate.status;
  useRecordProfileView(candidate.id);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  /** Salary and joining date as the candidate submitted them (read-only). */
  const [submitted, setSubmitted] = useState<Record<string, string>>({});
  const [yearsExperience, setYearsExperience] = useState<string>(interview.yearsExperience ?? '');
  const [experienceIn, setExperienceIn] = useState<string>(interview.experienceIn ?? '');
  const [readyRelocate, setReadyRelocate] = useState<string>(interview.readyToRelocate ?? '');
  const [feedback, setFeedback] = useState<string>(interview.feedback ?? 'Good');
  const [roundName, setRoundName] = useState<string>(() => defaultRoundName(status, post));
  const [moving, setMoving] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [editFeedback, setEditFeedback] = useState(false);
  const skin = useSkin();

  useEffect(() => {
    const fetchInterview = async () => {
      try {
        const ref = doc(db, "interviews", candidate.id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const data = snap.data();
          // One interview doc per candidate; ignore one recorded for another post.
          if (data.postId && candidate.postId && data.postId !== candidate.postId) return;
          setSelectedDate(data.selectedDate ?? null);
          setResponse(data.response ?? null);
          setSubmitted({
            currentSalary: String(data.currentSalary || ''),
            expectedSalary: String(data.expectedSalary || ''),
            expectedSalaryPeriod: String(data.expectedSalaryPeriod || ''),
            dateOfJoining: String(data.dateOfJoining || ''),
          });
          if (data.yearsExperience) setYearsExperience(data.yearsExperience);
          if (data.experienceIn) setExperienceIn(data.experienceIn);
          if (data.readyToRelocate) setReadyRelocate(data.readyToRelocate);
        }
      } catch (err) {
        console.error("Failed to fetch interview doc", err);
      }
    };
    fetchInterview();
  }, [candidate.id, candidate.postId]);

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
      const applicantPostId = candidate.postId;
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
        feedback,
        roundType: effectiveRoundName,
        status: nextRound,
        updatedAt: new Date()
      };

      if (intSnap.exists()) {
        await updateDoc(interviewRef, updatePayload);
      } else {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(interviewRef, { ...updatePayload, candidateId: candidate.id, postId: candidate.postId || interview.postId, createdAt: new Date() });
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
      onClose();
    } catch (err: unknown) {
      console.error("Failed to update status", err);
      popup.error(errorMessage(err) || "Failed to update");
    } finally {
      setMoving(false);
    }
  };

  const handleSelect = async () => {
    setMoving(true);
    try {
      const applicantPostId = candidate.postId;
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
        feedback,
        status: 'selected',
        updatedAt: new Date()
      };

      if (intSnap.exists()) {
        await updateDoc(interviewRef, updatePayload);
      } else {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(interviewRef, { ...updatePayload, candidateId: candidate.id, postId: candidate.postId || interview.postId, createdAt: new Date() });
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
        onClose();
      }
    } catch (err: unknown) {
      console.error("Failed to select candidate", err);
      popup.error(errorMessage(err) || "Failed to select");
    } finally {
      setMoving(false);
    }
  };

  const closeRejectDialog = () => {
    if (rejecting) return;
    setShowReject(false);
    setRejectReason('');
  };

  const handleReject = async () => {
    const reason = rejectReason.trim();
    if (reason.length < MIN_REASON) {
      popup.error(`Please give a reason (at least ${MIN_REASON} characters)`);
      return;
    }
    setRejecting(true);
    try {
      const newStatus = `${status ?? 'round1'}rejected`;
      const applicantPostId = candidate.postId;
      const rejectionFields = { rejectionReason: reason, rejectedAt: new Date() };

      if (applicantPostId) {
        await setApplicationStatus(applicantPostId, candidate.id, newStatus, rejectionFields);
      } else {
        await updateDoc(doc(db, "candidates", candidate.id), { status: newStatus, ...rejectionFields, updatedAt: new Date() });
      }

      const interviewRef = doc(db, "interviews", candidate.id);
      const intSnap = await getDoc(interviewRef);
      if (intSnap.exists()) {
        await updateDoc(interviewRef, { status: newStatus, ...rejectionFields, updatedAt: new Date() });
      }

      void notifyCandidateOfStatusChange({
        candidateId: candidate.id,
        postId: applicantPostId || interview.postId,
        status: newStatus,
        reason,
      });

      // The status change is already saved, so a failed mail must not undo it.
      let mailed = true;
      try {
        await sendRejectionMail({
          candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
          role: interview.role || candidate.role || post?.jobTitle || '',
          roundName: isRound ? (presentRoundName !== '-' ? presentRoundName : `Round ${presentRoundNum}`) : '',
          reason,
        });
      } catch (emailErr) {
        mailed = false;
        console.error('Failed to send rejection email:', emailErr);
      }

      if (mailed) popup.success("Candidate rejected and emailed");
      else popup.warning("Candidate rejected, but the email could not be sent");
      onStatusUpdated?.();
      onClose();
    } catch (err: unknown) {
      console.error(err);
      popup.error("Failed to reject");
    } finally {
      setRejecting(false);
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

  const responsePill = response === 'accept'
    ? { label: 'Accepted', cls: 'bg-emerald-100 text-emerald-800' }
    : response
      ? { label: `Responded "${response}"`, cls: 'bg-destructive/10 text-destructive' }
      : { label: 'Awaiting response', cls: 'bg-amber-100 text-amber-800' };

  const money = (v?: string) => (v ? `₹ ${Number(v).toLocaleString('en-IN')}` : '-');

  const facts: [string, string][] = [
    ['Round', presentRoundLabel],
    ['Round type', presentRoundName],
    ['Interview role', interview.role || '-'],
    ['Interviewers', Array.isArray(interview.interviewers) && interview.interviewers.length ? interview.interviewers.join(', ') : '-'],
    ['Proposed dates', Array.isArray(interview.dates) && interview.dates.length ? interview.dates.join(', ') : '-'],
    ['Current salary', money(submitted.currentSalary)],
    ['Expected salary', submitted.expectedSalary
      ? `${money(submitted.expectedSalary)}${submitted.expectedSalaryPeriod ? ` / ${submitted.expectedSalaryPeriod}` : ''}`
      : '-'],
    ['Date of joining', submitted.dateOfJoining || '-'],
    ['Years of experience', yearsExperience || '-'],
    ['Experience in', experienceIn || '-'],
    ['Ready to relocate', readyRelocate || '-'],
  ];

  const tile = 'min-w-0 rounded-lg bg-ink/5 px-3 py-2.5';
  const value = 'mt-1 break-words text-sm font-semibold text-ink';
  const editButton = `inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded text-left hover:text-brand ${FOCUS}`;
  const pencil = <Pencil className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />;
  const input = `w-full px-2 py-1 text-sm rounded-lg ${skin.field} ${FOCUS}`;

  return (
    <div className={`mx-5 mb-5 mt-1 overflow-hidden rounded-xl border ${skin.edge} bg-surface`}>
      {/* Interview response */}
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${skin.edge} px-5 py-4`}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink/5 text-ink/60" aria-hidden="true">
            <Calendar className="h-5 w-5" />
          </span>
          <div>
            <p className={skin.micro}>Interview date</p>
            <p className="text-sm font-semibold text-ink">{selectedDate && response === 'accept' ? selectedDate : 'Not confirmed yet'}</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${responsePill.cls}`}>{responsePill.label}</span>
      </div>

      <dl className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
        {facts.map(([k, v]) => (
          <div key={k} className={tile}>
            <dt className={skin.micro}>{k}</dt>
            <dd className={value}>{v}</dd>
          </div>
        ))}

        {/* Feedback is the one editable field; saved with the next round move or selection. */}
        <div className={tile}>
          <dt className={skin.micro}>Feedback</dt>
          <dd className={value}>
            {editFeedback ? (
              <input type="text" aria-label="Feedback" value={feedback}
                onChange={e => setFeedback(e.target.value)}
                onBlur={() => setEditFeedback(false)} autoFocus className={input} />
            ) : (
              <button type="button" className={editButton} onClick={() => setEditFeedback(true)}>
                <span className="break-words">{feedback}</span>{pencil}
              </button>
            )}
          </dd>
        </div>
      </dl>

      {/* Round actions. The round name and move button disappear in the post's
          last round, where only Select and Reject remain. */}
      {isRound && !isSelected && (
        <div className={`flex flex-wrap items-center justify-end gap-3 border-t ${skin.edge} bg-ink/[0.03] px-5 py-4`}>
          {!isLastRound && (
            <>
              <input
                type="text"
                aria-label="Next round name"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                placeholder="e.g. Technical, HR, Manager Round"
                className={`h-9 w-full rounded-lg px-3 text-sm sm:w-56 ${skin.field} ${FOCUS}`}
              />
              {nextRound && (
                <button
                  type="button"
                  onClick={moveToNextRound}
                  disabled={moving || !roundName.trim()}
                  className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-semibold ${skin.cta} ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {moving ? 'Moving…' : `Move to ${nextRound.replace(/^round/, 'Round ')}`}
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </>
          )}
          {isLastRound && (
            <button
              type="button"
              onClick={handleSelect}
              disabled={moving}
              className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-semibold ${skin.cta} ${FOCUS} disabled:opacity-50`}
            >
              {moving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
              {moving ? 'Selecting…' : 'Select'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowReject(true)}
            disabled={moving || rejecting}
            className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-destructive bg-destructive px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 ${FOCUS}`}
          >
            <XCircle className="h-4 w-4" aria-hidden="true" /> Reject
          </button>
        </div>
      )}

      {showReject && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeRejectDialog(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') closeRejectDialog(); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reject-dialog-title"
            className={`w-full max-w-md border ${skin.edge} ${skin.surface} ${skin.radius} p-5 shadow-xl`}
          >
            <h2 id="reject-dialog-title" className={skin.cardTitle}>Reject {candidate.name}?</h2>
            <p className={`mt-1.5 ${skin.body}`}>
              Tell the candidate why. This reason is emailed to them{candidate.email ? ` at ${candidate.email}` : ''} and shown in their notifications.
            </p>
            <label htmlFor="reject-reason" className="mt-4 block text-sm font-bold text-ink/80">
              Reason for rejection <span className="text-destructive">*</span>
            </label>
            <textarea
              id="reject-reason"
              autoFocus
              rows={5}
              maxLength={MAX_REASON}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. We were looking for more hands-on site experience for this role."
              className={`mt-1.5 w-full resize-none px-3 py-2 text-sm rounded-lg ${skin.field} ${FOCUS}`}
            />
            <div className="mt-1 flex justify-between text-xs text-ink/50">
              <span>{rejectReason.trim().length < MIN_REASON ? `At least ${MIN_REASON} characters` : ' '}</span>
              <span>{rejectReason.length}/{MAX_REASON}</span>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeRejectDialog}
                disabled={rejecting}
                className={`cursor-pointer rounded-lg ${skin.secondary} ${FOCUS}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={rejecting || rejectReason.trim().length < MIN_REASON}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive bg-destructive text-white hover:opacity-90 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`}
              >
                {rejecting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
                {rejecting ? 'Rejecting…' : 'Reject & send email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
