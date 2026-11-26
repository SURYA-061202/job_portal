import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { X, Send, Loader2, Users, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { Candidate, RecruitmentRequest } from '@/types';
import { sendInterviewInviteToCandidate } from '@/lib/interviewInvite';
import { getPostRounds, getRoundLabel } from '@/lib/interviewRounds';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

interface Props {
    /** Everyone selected in the applicant list. */
    candidates: Candidate[];
    /** Post the invite is raised against (role + round come from it). */
    post: RecruitmentRequest;
    onClose: () => void;
    /** Called once the run finishes: `sent` invites went out, `failed` did not. */
    onSent: (result: { sent: number; failed: number }) => void;
}

/** Pause between invites so a bulk run stays well inside the daily mail quota. */
const SEND_DELAY_MS = 350;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Round Type mirrors the post's first interview round (same rule as the single invite). */
const roundTypeForPost = (post: RecruitmentRequest): string => {
    const first = getPostRounds(post)[0];
    return first?.name || getRoundLabel(first);
};

/**
 * Bulk interview invite: one shared set of dates/interviewers, sent to every
 * selected applicant in turn. Progress is shown live and each candidate fails
 * on its own, so one bad address never stops the run.
 */
export default function BulkInterviewInviteModal({ candidates, post, onClose, onSent }: Props) {
    const skin = useSkin();
    const [role, setRole] = useState(post.jobTitle || '');
    const [dates, setDates] = useState<string[]>(['', '', '']);
    const [roundType, setRoundType] = useState(() => roundTypeForPost(post));
    const [interviewers, setInterviewers] = useState<string[]>([]);
    const [recruiters, setRecruiters] = useState<{ id: string; name: string }[]>([]);
    const [loadingRecruiters, setLoadingRecruiters] = useState(true);
    const [sending, setSending] = useState(false);
    const [progress, setProgress] = useState({ done: 0, total: 0 });

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const snapshot = await getDocs(query(collection(db, 'users'), where('role', 'in', ['recruiter', 'admin', 'manager'])));
                if (!alive) return;
                setRecruiters(
                    snapshot.docs.map((d) => {
                        const data = d.data();
                        const name = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || 'Unnamed';
                        return { id: d.id, name };
                    })
                );
            } catch (err) {
                console.error('Error fetching interviewers:', err);
            } finally {
                if (alive) setLoadingRecruiters(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        if (post.jobTitle) setRole(post.jobTitle);
        setRoundType(roundTypeForPost(post));
    }, [post]);

    /** Selections without an address can't be mailed — filtered out, not failed. */
    const mailable = useMemo(() => candidates.filter((c) => !!c.email), [candidates]);
    const noEmail = candidates.length - mailable.length;

    const toggleInterviewer = (name: string) =>
        setInterviewers((prev) => (prev.includes(name) ? prev.filter((i) => i !== name) : [...prev, name]));

    const handleSend = async () => {
        if (sending) return;
        if (!role || dates.some((d) => !d) || !roundType || interviewers.length === 0) {
            popup.error('Please fill all fields');
            return;
        }
        if (mailable.length === 0) {
            popup.error('None of the selected candidates has an email address.');
            return;
        }

        setSending(true);
        setProgress({ done: 0, total: mailable.length });
        let sent = 0;
        const failedNames: string[] = [];

        for (let i = 0; i < mailable.length; i += 1) {
            const candidate = mailable[i];
            try {
                await sendInterviewInviteToCandidate({
                    candidate,
                    role,
                    dates,
                    roundType,
                    interviewers,
                    postId: post.id as string,
                    baseUrl: window.location.origin,
                });
                sent += 1;
            } catch (err) {
                console.error('Bulk invite failed for', candidate.id, err);
                failedNames.push(candidate.name || candidate.email || 'Unknown');
            }
            setProgress({ done: i + 1, total: mailable.length });
            if (i < mailable.length - 1) await sleep(SEND_DELAY_MS);
        }

        setSending(false);

        const skipped = noEmail > 0 ? ` ${noEmail} skipped without an email.` : '';
        if (failedNames.length === 0) {
            popup.success(`Interview invites sent to ${sent} candidate${sent === 1 ? '' : 's'}.${skipped}`);
        } else if (sent === 0) {
            popup.error(`Could not send any invite. ${failedNames.slice(0, 3).join(', ')}${failedNames.length > 3 ? '…' : ''}`);
        } else {
            popup.warning(
                `${sent} sent, ${failedNames.length} failed (${failedNames.slice(0, 3).join(', ')}${failedNames.length > 3 ? '…' : ''}).${skipped}`
            );
        }

        onSent({ sent, failed: failedNames.length });
    };

    const field = `w-full rounded-lg px-3 py-2 ${skin.field} ${FOCUS}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Bulk interview invites">
            <div className={`relative max-h-[90vh] w-full max-w-lg overflow-y-auto p-6 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={sending}
                    aria-label="Close"
                    className={`absolute top-3 right-3 text-ink/60 hover:text-ink hover:bg-ink/5 ${skin.radius} transition-colors disabled:opacity-40 ${FOCUS}`}
                >
                    <X className="h-5 w-5" />
                </button>

                <div className="mb-1 flex items-center gap-2">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${skin.iconTile}`} aria-hidden="true">
                        <Users className="h-4 w-4" />
                    </span>
                    <h2 className={skin.heading}>Bulk Interview Invite</h2>
                </div>
                <p className={`mb-4 ${skin.meta}`}>
                    {mailable.length} of {candidates.length} selected candidate{candidates.length === 1 ? '' : 's'} will receive the same invite.
                </p>

                {noEmail > 0 && (
                    <p className="mb-4 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {noEmail} selected candidate{noEmail === 1 ? ' has' : 's have'} no email address and will be skipped.
                    </p>
                )}

                <div className="space-y-4">
                    <div>
                        <label htmlFor="bulk-role" className="mb-1 block text-sm font-medium text-ink/80">Interview Role</label>
                        <input id="bulk-role" type="text" className={field} value={role} onChange={(e) => setRole(e.target.value)} disabled={sending} />
                    </div>

                    <div>
                        <label htmlFor="bulk-dates" className="mb-1 block text-sm font-medium text-ink/80">Choose Three Dates</label>
                        <div id="bulk-dates" className="grid grid-cols-1 gap-2 md:grid-cols-3">
                            {dates.map((d, idx) => (
                                <input
                                    key={idx}
                                    type="date"
                                    aria-label={`Interview date ${idx + 1}`}
                                    className={`px-3 py-2 rounded-lg ${skin.field} ${FOCUS} disabled:opacity-60`}
                                    value={d}
                                    disabled={sending}
                                    onChange={(e) => setDates((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))}
                                />
                            ))}
                        </div>
                    </div>

                    <div>
                        <label htmlFor="bulk-round" className="mb-1 block text-sm font-medium text-ink/80">Interview Round</label>
                        <input id="bulk-round" type="text" className={field} value={roundType} readOnly disabled />
                        <p className={`mt-1 ${skin.meta}`}>Taken from the post's first interview round.</p>
                    </div>

                    <div>
                        <p className="mb-1 text-sm font-medium text-ink/80" id="bulk-interviewers-label">Interviewers</p>
                        {loadingRecruiters ? (
                            <p className={skin.meta}>Loading interviewers…</p>
                        ) : (
                            <div className="grid grid-cols-1 gap-1.5" role="group" aria-labelledby="bulk-interviewers-label">
                                {recruiters.map((recruiter) => (
                                    <label key={recruiter.id} className="inline-flex items-center rounded-lg px-2 py-1 text-sm transition-colors hover:bg-brand/10">
                                        <input
                                            type="checkbox"
                                            className="form-checkbox mr-2 h-4 w-4 text-brand"
                                            checked={interviewers.includes(recruiter.name)}
                                            disabled={sending}
                                            onChange={() => toggleInterviewer(recruiter.name)}
                                        />
                                        {recruiter.name}
                                    </label>
                                ))}
                                {recruiters.length === 0 && <p className={skin.meta}>No interviewers found</p>}
                            </div>
                        )}
                    </div>
                </div>

                {sending && (
                    <div className="mt-4 rounded-lg border border-brand/30 bg-brand/5 px-3.5 py-3" role="status" aria-live="polite">
                        <div className="flex items-center justify-between text-xs font-semibold text-ink/80">
                            <span className="inline-flex items-center gap-1.5">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" aria-hidden="true" />
                                Sending invites…
                            </span>
                            <span>{progress.done} / {progress.total}</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
                            <div
                                className="h-full rounded-full bg-brand transition-all duration-300"
                                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                            />
                        </div>
                    </div>
                )}

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose} disabled={sending} className={`cursor-pointer rounded-lg ${skin.secondary} ${FOCUS} disabled:opacity-50`}>
                        {sending ? 'Please wait…' : 'Cancel'}
                    </button>
                    <button
                        type="button"
                        onClick={handleSend}
                        disabled={sending}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}
                    >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                        {sending ? `Sending ${progress.done}/${progress.total}…` : `Send to ${mailable.length}`}
                    </button>
                </div>
            </div>
        </div>
    );
}
