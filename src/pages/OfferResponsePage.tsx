import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Loader2, CheckCircle2, XCircle, PenLine, Download, FileText } from 'lucide-react';
import type { OfferLetter } from '@/types';
import { OFFER_STATUS, fetchOfferForCandidate, respondToOffer } from '@/lib/offers';
import { buildOfferPdf } from '@/lib/offerPdf';
import { callableMessage } from '@/lib/candidatePortal';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

const timelineLabel: Record<string, string> = {
    created: 'Offer drafted',
    sent: 'Offer sent to you',
    emailed: 'Email delivered',
    accepted: 'Offer accepted',
    declined: 'Offer declined',
};

/**
 * Candidate-facing offer page (`/offer/{offerId}`), reached from the emailed
 * link. The letter is read and the answer written through Cloud Functions, so
 * the offers collection stays closed to candidates.
 */
export default function OfferResponsePage() {
    const { offerId = '' } = useParams();
    // The `?t=` token travels only in the emailed link; the callable rejects
    // anything else, so the letter and the candidate's address stay private.
    const [searchParams] = useSearchParams();
    const token = searchParams.get('t') || '';
    const skin = useSkin();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [offer, setOffer] = useState<OfferLetter | null>(null);

    const [choosing, setChoosing] = useState<'accept' | 'decline' | null>(null);
    const [signatureName, setSignatureName] = useState('');
    const [consent, setConsent] = useState(false);
    const [saving, setSaving] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const load = useCallback(async () => {
        if (!offerId || !token) {
            setError('This offer link is not valid.');
            setLoading(false);
            return;
        }
        try {
            const letter = await fetchOfferForCandidate(offerId, token);
            setOffer(letter);
            setSignatureName(letter.candidateName || '');
        } catch (err) {
            console.error('Failed to load offer:', err);
            setError(callableMessage(err, 'This offer link is not valid or has expired.'));
        } finally {
            setLoading(false);
        }
    }, [offerId, token]);

    useEffect(() => { void load(); }, [load]);

    const submit = async () => {
        if (saving || !choosing) return;
        if (choosing === 'accept') {
            if (signatureName.trim().length < 3) {
                popup.error('Please type your full name as your signature.');
                return;
            }
            if (!consent) {
                popup.error('Please confirm that you accept the terms of this offer.');
                return;
            }
        }
        setSaving(true);
        try {
            const result = await respondToOffer(
                offerId,
                choosing,
                token,
                choosing === 'accept' ? signatureName.trim() : undefined
            );
            setOffer((prev) => (prev ? { ...prev, status: result.status } : prev));
            setChoosing(null);
            popup.success(
                result.status === 'accepted'
                    ? 'Offer accepted. Welcome aboard!'
                    : 'Your response has been recorded. Thank you.'
            );
            await load();
        } catch (err) {
            console.error('Offer response failed:', err);
            popup.error(callableMessage(err, 'Could not record your response.'));
        } finally {
            setSaving(false);
        }
    };

    const download = async () => {
        if (!offer || downloading) return;
        setDownloading(true);
        try {
            await buildOfferPdf(offer);
        } catch (err) {
            console.error('Offer PDF failed:', err);
            popup.error('Could not generate the PDF.');
        } finally {
            setDownloading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-ink/[0.04] p-4" role="status">
                <Loader2 className="h-6 w-6 animate-spin text-brand" aria-hidden="true" />
                <span className="sr-only">Loading offer…</span>
            </div>
        );
    }

    if (error || !offer) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-ink/[0.04] p-4">
                <div className={`w-full max-w-md border p-8 text-center ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
                    <XCircle className="mx-auto mb-3 h-9 w-9 text-destructive" aria-hidden="true" />
                    <h1 className={skin.heading}>Offer not found</h1>
                    <p className={`mt-2 ${skin.body}`}>{error || 'This offer link is not valid.'}</p>
                </div>
            </div>
        );
    }

    const status = OFFER_STATUS[offer.status];
    const answered = offer.status === 'accepted' || offer.status === 'declined';

    return (
        <div className="min-h-screen bg-ink/[0.04] px-4 py-8">
            <div className="mx-auto w-full max-w-3xl">
                {/* Header */}
                <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 border px-5 py-4 ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
                    <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${skin.iconTile}`} aria-hidden="true">
                            <FileText className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <h1 className={`${skin.heading} truncate`}>Offer Letter</h1>
                            <p className={`${skin.meta} truncate`}>{offer.designation || offer.jobTitle} · {offer.companyName}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>
                        <button
                            type="button"
                            onClick={download}
                            disabled={downloading}
                            className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg ${skin.secondary} ${FOCUS} disabled:opacity-50`}
                        >
                            {downloading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                            PDF
                        </button>
                    </div>
                </div>

                {/* Letter */}
                <article className={`border px-6 py-8 text-sm leading-relaxed text-ink/85 sm:px-10 ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
                    <p className="text-center text-lg font-bold uppercase tracking-wide text-ink">{offer.companyName}</p>
                    <p className="mt-1 text-center text-xs font-semibold tracking-widest text-brand">OFFER LETTER</p>
                    <p className="mt-5 text-xs text-ink/60">
                        Date: {offer.sentAt ? new Date(offer.sentAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </p>
                    <p className="mt-4 font-semibold text-ink">{offer.candidateName}</p>
                    <p className="text-xs text-ink/60">{offer.candidateEmail}</p>
                    <p className="mt-4">
                        Subject: Offer of employment for the position of <span className="font-semibold">{offer.designation || offer.jobTitle}</span>.
                    </p>
                    <p className="mt-4">Dear {offer.candidateName || 'Candidate'},</p>
                    <p className="mt-3">
                        We are pleased to offer you the position of <span className="font-semibold">{offer.designation || offer.jobTitle}</span> with{' '}
                        <span className="font-semibold">{offer.companyName}</span>. We were impressed with your qualifications and believe you will be a
                        valuable addition to our team.
                    </p>
                    <dl className="mt-4 grid gap-x-6 gap-y-1.5 border-y border-dashed py-3 text-xs sm:grid-cols-2">
                        <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold text-ink">Position</dt><dd>{offer.designation || '—'}</dd></div>
                        <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold text-ink">Compensation</dt><dd>{offer.salary || '—'}</dd></div>
                        <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold text-ink">Joining date</dt><dd>{offer.joiningDate || '—'}</dd></div>
                        <div className="flex gap-2"><dt className="w-28 shrink-0 font-semibold text-ink">Location</dt><dd>{offer.location || '—'}</dd></div>
                    </dl>
                    {offer.notes && <pre className="mt-3 whitespace-pre-wrap font-sans text-xs text-ink/75">{offer.notes}</pre>}
                    <p className="mt-4">
                        Please confirm your acceptance using the buttons below. We look forward to welcoming you aboard.
                    </p>
                    <div className="mt-6 flex items-end justify-between gap-4">
                        <div>
                            {offer.signature && (
                                <div className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                                    <p className="font-semibold">Accepted by {offer.signature.name}</p>
                                    <p>{new Date(offer.signature.at).toLocaleString('en-IN')}</p>
                                </div>
                            )}
                        </div>
                        <p className="text-right text-xs text-ink/60">
                            For {offer.companyName}
                            <br />
                            Authorised Signatory
                        </p>
                    </div>
                </article>

                {/* Response */}
                <div className={`mt-4 border px-5 py-4 ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
                    {!answered && offer.status !== 'sent' && !choosing && (
                        <p className={skin.body}>This offer has not been sent out yet. Please wait for the recruiter's email.</p>
                    )}

                    {offer.status === 'sent' && !choosing && (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <p className={skin.body}>Ready to respond? Accepting requires your typed signature.</p>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setChoosing('decline')}
                                    className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg ${skin.secondary} ${FOCUS}`}
                                >
                                    <XCircle className="h-4 w-4" aria-hidden="true" />
                                    Decline
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setChoosing('accept')}
                                    className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg ${skin.cta} ${FOCUS}`}
                                >
                                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                    Accept offer
                                </button>
                            </div>
                        </div>
                    )}

                    {choosing === 'accept' && (
                        <div className="space-y-3.5">
                            <h2 className={skin.heading}>Accept with your e-signature</h2>
                            <div>
                                <label htmlFor="offer-signature" className="mb-1 block text-sm font-medium text-ink/80">Type your full name</label>
                                <input
                                    id="offer-signature"
                                    type="text"
                                    className={`w-full rounded-lg px-3 py-2.5 ${skin.field} ${FOCUS}`}
                                    value={signatureName}
                                    maxLength={120}
                                    placeholder={offer.candidateName}
                                    onChange={(e) => setSignatureName(e.target.value)}
                                />
                                <p className={`mt-1 ${skin.meta}`}>Your typed name acts as your signature on this offer letter.</p>
                            </div>
                            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink/80">
                                <input
                                    type="checkbox"
                                    className="mt-0.5 h-4 w-4 shrink-0 form-checkbox text-brand"
                                    checked={consent}
                                    onChange={(e) => setConsent(e.target.checked)}
                                />
                                <span>I have read the offer letter and accept its terms and conditions.</span>
                            </label>
                            <div className="flex justify-end gap-3">
                                <button type="button" onClick={() => setChoosing(null)} disabled={saving} className={`cursor-pointer rounded-lg ${skin.secondary} ${FOCUS} disabled:opacity-50`}>
                                    Back
                                </button>
                                <button
                                    type="button"
                                    onClick={submit}
                                    disabled={saving}
                                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}
                                >
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <PenLine className="h-4 w-4" aria-hidden="true" />}
                                    {saving ? 'Signing…' : 'Sign & accept'}
                                </button>
                            </div>
                        </div>
                    )}

                    {choosing === 'decline' && (
                        <div className="space-y-3.5">
                            <h2 className={skin.heading}>Decline this offer</h2>
                            <p className={skin.body}>Are you sure you want to decline? The recruiter will be notified straight away.</p>
                            <div className="flex justify-end gap-3">
                                <button type="button" onClick={() => setChoosing(null)} disabled={saving} className={`cursor-pointer rounded-lg ${skin.secondary} ${FOCUS} disabled:opacity-50`}>
                                    Back
                                </button>
                                <button
                                    type="button"
                                    onClick={submit}
                                    disabled={saving}
                                    className={`inline-flex cursor-pointer items-center gap-2 rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}
                                >
                                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
                                    {saving ? 'Submitting…' : 'Confirm decline'}
                                </button>
                            </div>
                        </div>
                    )}

                    {answered && (
                        <div className="flex flex-wrap items-center gap-3">
                            <span className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold ${status.className}`}>
                                {offer.status === 'accepted' ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
                                {offer.status === 'accepted' ? 'You accepted this offer' : 'You declined this offer'}
                            </span>
                            {offer.respondedAt && (
                                <span className="text-xs text-ink/60">{new Date(offer.respondedAt).toLocaleString('en-IN')}</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Timeline */}
                {offer.timeline?.length ? (
                    <div className={`mt-4 border px-5 py-4 ${skin.edge} ${skin.surface} ${skin.radius}`}>
                        <p className={`mb-3 ${skin.micro}`}>Timeline</p>
                        <ol className="space-y-2.5">
                            {[...offer.timeline].reverse().map((event, i) => (
                                <li key={`${event.kind}-${event.at}-${i}`} className="flex items-start gap-3 text-sm text-ink/75">
                                    <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                                        event.kind === 'accepted' ? 'bg-emerald-500'
                                            : event.kind === 'declined' ? 'bg-destructive'
                                                : 'bg-brand'
                                    }`} aria-hidden="true" />
                                    <span>
                                        <span className="font-medium text-ink">{timelineLabel[event.kind] || event.kind}</span>
                                        {event.by ? <span className="text-ink/60"> · {event.by}</span> : null}
                                        <br />
                                        <span className="text-xs text-ink/50">{new Date(event.at).toLocaleString('en-IN')}</span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
