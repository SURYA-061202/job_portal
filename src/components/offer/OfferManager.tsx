import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Send, Loader2, FileText, Download, CheckCircle2, Clock } from 'lucide-react';
import { getDoc, doc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import type { Candidate, OfferLetter, OfferTimelineEvent, RecruitmentRequest } from '@/types';
import { OFFER_STATUS, submitOffer } from '@/lib/offers';
import { buildOfferPdf } from '@/lib/offerPdf';
import { errorMessage } from '@/lib/errors';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

interface Props {
    candidate: Candidate;
    post: RecruitmentRequest;
    /** Offer already on file, when the recruiter reopens a sent letter. */
    existing?: OfferLetter | null;
    onClose: () => void;
    onSent?: (offerId: string) => void;
}

const DEFAULT_TERMS = `1. This offer is subject to verification of the documents and credentials submitted.
2. Either party may terminate the employment relationship with 30 days' written notice.
3. The terms stated in this letter supersede any prior verbal discussions.`;

const timelineLabel: Record<OfferTimelineEvent['kind'], string> = {
    created: 'Draft created',
    sent: 'Offer sent',
    emailed: 'Email delivered',
    accepted: 'Accepted by candidate',
    declined: 'Declined by candidate',
};

/**
 * Compose and send an offer letter: the form on the left, a live preview of the
 * letter on the right, then the letter is written to `offers/{postId}__{uid}`,
 * the application moves to `offer_sent` and the candidate gets the link by mail.
 */
export default function OfferManager({ candidate, post, existing, onClose, onSent }: Props) {
    const skin = useSkin();
    const locked = existing?.status === 'accepted' || existing?.status === 'declined';

    const [designation, setDesignation] = useState(existing?.designation || post.jobTitle || '');
    const [salary, setSalary] = useState(existing?.salary || post.budgetPay || post.salaryBreakup || '');
    const [joiningDate, setJoiningDate] = useState(existing?.joiningDate || '');
    const [location, setLocation] = useState(existing?.location || post.location || '');
    const [notes, setNotes] = useState(existing?.notes || DEFAULT_TERMS);
    const [sending, setSending] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [offer, setOffer] = useState<OfferLetter | null>(existing || null);
    const [recruiterName, setRecruiterName] = useState(post.recruiterName || '');

    // Re-hydrate when the candidate changes (the modal is reused per row).
    useEffect(() => {
        setDesignation(existing?.designation || post.jobTitle || '');
        setSalary(existing?.salary || post.budgetPay || post.salaryBreakup || '');
        setJoiningDate(existing?.joiningDate || '');
        setLocation(existing?.location || post.location || '');
        setNotes(existing?.notes || DEFAULT_TERMS);
        setOffer(existing || null);
    }, [candidate.id, existing, post]);

    // The sender's display name lands on the timeline the candidate sees.
    useEffect(() => {
        let alive = true;
        const uid = auth.currentUser?.uid;
        if (!uid || recruiterName) return;
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'users', uid));
                if (!alive || !snap.exists()) return;
                const d = snap.data();
                const name = `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.name || '';
                if (name) setRecruiterName(name);
            } catch {
                /* the post's recruiterName already covers most cases */
            }
        })();
        return () => { alive = false; };
    }, [recruiterName]);

    const preview = useMemo<OfferLetter>(() => ({
        postId: post.id as string,
        candidateId: candidate.id,
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        jobTitle: post.jobTitle,
        designation,
        salary,
        joiningDate,
        location,
        notes,
        companyName: post.companyName || 'Indian Infra',
        status: offer?.status || 'draft',
        recruiterId: post.recruiterId || auth.currentUser?.uid || '',
        recruiterName,
        timeline: offer?.timeline || [],
    }), [post, candidate, designation, salary, joiningDate, location, notes, offer, recruiterName]);

    const valid = designation.trim() && salary.trim() && joiningDate;

    const handleSend = async () => {
        if (sending || locked) return;
        if (!valid) {
            popup.error('Designation, compensation and joining date are required.');
            return;
        }
        const uid = auth.currentUser?.uid || post.recruiterId;
        if (!uid) {
            popup.error('Please sign in again to send an offer.');
            return;
        }
        setSending(true);
        try {
            const result = await submitOffer({
                postId: post.id as string,
                jobTitle: post.jobTitle,
                companyName: post.companyName || 'Indian Infra',
                recruiterId: uid,
                recruiterName: recruiterName || post.recruiterName || undefined,
                candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
                designation,
                salary,
                joiningDate,
                location,
                notes,
            });
            if (result.emailed) {
                popup.success(`Offer sent to ${candidate.name || 'the candidate'} by email.`);
            } else {
                popup.warning('Offer saved, but the email could not be sent. Use "Resend" to try again.');
            }
            onSent?.(result.offerId);
            onClose();
        } catch (err) {
            console.error('Send offer failed:', err);
            popup.error(errorMessage(err) || 'Could not send the offer.');
        } finally {
            setSending(false);
        }
    };

    const handleDownload = async () => {
        if (downloading) return;
        setDownloading(true);
        try {
            await buildOfferPdf(preview);
        } catch (err) {
            console.error('Offer PDF failed:', err);
            popup.error('Could not generate the PDF.');
        } finally {
            setDownloading(false);
        }
    };

    const field = `w-full rounded-lg px-3 py-2 ${skin.field} ${FOCUS} disabled:opacity-60`;
    const status = OFFER_STATUS[offer?.status || 'draft'];

    // Rendered on <body> and above the sticky header, which would otherwise cover the top.
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Offer letter">
            <div className={`relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
                <div className={`flex shrink-0 items-center justify-between gap-3 border-b ${skin.edge} px-5 py-4`}>
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${skin.iconTile}`} aria-hidden="true">
                            <FileText className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                            <h2 className={`${skin.heading} truncate`}>Offer Letter · {candidate.name}</h2>
                            <p className={`${skin.meta} truncate`}>{post.jobTitle}{post.location ? ` · ${post.location}` : ''}</p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <span className={`hidden rounded-full border px-2.5 py-1 text-[11px] font-bold sm:inline-flex ${status.className}`}>
                            {status.label}
                        </span>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={sending}
                            aria-label="Close"
                            className={`flex h-9 w-9 items-center justify-center ${skin.subtle} ${skin.subtleHover} ${skin.radius} ${FOCUS} disabled:opacity-40`}
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    {locked && offer && (
                        <div className={`mb-4 rounded-lg border px-3.5 py-3 text-sm ${offer.status === 'accepted' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-destructive/30 bg-destructive/10 text-destructive'}`}>
                            {offer.status === 'accepted'
                                ? `Accepted by ${offer.signature?.name || candidate.name} on ${offer.respondedAt ? new Date(offer.respondedAt).toLocaleString('en-IN') : '—'}.`
                                : `Declined by ${candidate.name} on ${offer.respondedAt ? new Date(offer.respondedAt).toLocaleString('en-IN') : '—'}.`}
                        </div>
                    )}

                    <div className="grid gap-5 md:grid-cols-2">
                        {/* ---- form ---- */}
                        <div className="space-y-3.5">
                            <div>
                                <label htmlFor="offer-designation" className="mb-1 block text-sm font-medium text-ink/80">Designation</label>
                                <input id="offer-designation" type="text" className={field} value={designation} disabled={locked || sending} onChange={(e) => setDesignation(e.target.value)} />
                            </div>
                            <div className="grid gap-3.5 sm:grid-cols-2">
                                <div>
                                    <label htmlFor="offer-salary" className="mb-1 block text-sm font-medium text-ink/80">Compensation</label>
                                    <input id="offer-salary" type="text" placeholder="₹8 LPA" className={field} value={salary} disabled={locked || sending} onChange={(e) => setSalary(e.target.value)} />
                                </div>
                                <div>
                                    <label htmlFor="offer-joining" className="mb-1 block text-sm font-medium text-ink/80">Joining date</label>
                                    <input id="offer-joining" type="date" className={field} value={joiningDate} disabled={locked || sending} onChange={(e) => setJoiningDate(e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="offer-location" className="mb-1 block text-sm font-medium text-ink/80">Work location</label>
                                <input id="offer-location" type="text" className={field} value={location} disabled={locked || sending} onChange={(e) => setLocation(e.target.value)} />
                            </div>
                            <div>
                                <label htmlFor="offer-notes" className="mb-1 block text-sm font-medium text-ink/80">Terms &amp; conditions</label>
                                <textarea id="offer-notes" rows={7} className={`${field} resize-y`} value={notes} disabled={locked || sending} onChange={(e) => setNotes(e.target.value)} />
                            </div>

                            {offer?.timeline?.length ? (
                                <div className={`rounded-lg border ${skin.edge} px-3.5 py-3`}>
                                    <p className={`mb-2 ${skin.micro}`}>Timeline</p>
                                    <ol className="space-y-1.5">
                                        {offer.timeline.map((event, i) => (
                                            <li key={`${event.kind}-${event.at}-${i}`} className="flex items-start gap-2 text-xs text-ink/70">
                                                <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                                                    event.kind === 'accepted' ? 'bg-emerald-100 text-emerald-700'
                                                        : event.kind === 'declined' ? 'bg-destructive/15 text-destructive'
                                                            : 'bg-brand/10 text-brand'
                                                }`} aria-hidden="true">
                                                    {event.kind === 'accepted' ? <CheckCircle2 className="h-2.5 w-2.5" /> : <Clock className="h-2.5 w-2.5" />}
                                                </span>
                                                <span>
                                                    {timelineLabel[event.kind]}
                                                    {event.by ? ` · ${event.by}` : ''}
                                                    <span className="text-ink/50"> · {new Date(event.at).toLocaleString('en-IN')}</span>
                                                </span>
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            ) : null}
                        </div>

                        {/* ---- live preview ---- */}
                        <div className={`rounded-lg border ${skin.edge} bg-surface p-5 text-sm leading-relaxed text-ink/85 shadow-sm`}>
                            <p className="text-center text-base font-bold uppercase tracking-wide text-ink">{preview.companyName}</p>
                            <p className="mt-1 text-center text-xs font-semibold tracking-widest text-brand">OFFER LETTER</p>
                            <p className="mt-4 text-xs text-ink/60">Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                            <p className="mt-3 font-semibold text-ink">{preview.candidateName}</p>
                            <p className="text-xs text-ink/60">{preview.candidateEmail}</p>
                            <p className="mt-3">
                                Subject: Offer of employment for the position of <span className="font-semibold">{preview.designation || '—'}</span>.
                            </p>
                            <p className="mt-3">Dear {preview.candidateName || 'Candidate'},</p>
                            <p className="mt-2">
                                We are pleased to offer you the position of <span className="font-semibold">{preview.designation || '—'}</span> with{' '}
                                <span className="font-semibold">{preview.companyName}</span>. We look forward to welcoming you to the team.
                            </p>
                            <dl className="mt-3 space-y-1 border-y border-dashed py-2.5 text-xs">
                                <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold text-ink">Position</dt><dd>{preview.designation || '—'}</dd></div>
                                <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold text-ink">Compensation</dt><dd>{preview.salary || '—'}</dd></div>
                                <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold text-ink">Joining date</dt><dd>{preview.joiningDate || '—'}</dd></div>
                                <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold text-ink">Location</dt><dd>{preview.location || '—'}</dd></div>
                            </dl>
                            <pre className="mt-2.5 whitespace-pre-wrap font-sans text-xs text-ink/75">{preview.notes}</pre>
                            {preview.signature && (
                                <div className="mt-4 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                                    <p className="font-semibold">Accepted by {preview.signature.name}</p>
                                    <p>{new Date(preview.signature.at).toLocaleString('en-IN')}</p>
                                </div>
                            )}
                            <p className="mt-4 text-right text-xs text-ink/60">For {preview.companyName}<br />Authorised Signatory</p>
                        </div>
                    </div>
                </div>

                <div className={`flex shrink-0 flex-wrap items-center justify-end gap-3 border-t ${skin.edge} px-5 py-3.5`}>
                    <button
                        type="button"
                        onClick={handleDownload}
                        disabled={downloading}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg ${skin.secondary} ${FOCUS} disabled:opacity-50`}
                    >
                        {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                        {downloading ? 'Preparing…' : 'Download PDF'}
                    </button>
                    <button type="button" onClick={onClose} disabled={sending} className={`cursor-pointer rounded-lg ${skin.secondary} ${FOCUS} disabled:opacity-50`}>
                        {locked ? 'Close' : 'Cancel'}
                    </button>
                    {!locked && (
                        <button
                            type="button"
                            onClick={handleSend}
                            disabled={sending || !valid}
                            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}
                        >
                            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                            {sending ? 'Sending…' : offer?.status === 'sent' ? 'Resend offer' : 'Send offer'}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
