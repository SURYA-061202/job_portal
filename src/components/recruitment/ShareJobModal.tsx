import { X, Copy, Check, Share2, Gift } from 'lucide-react';
import { useState } from 'react';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';
import { auth } from '@/lib/firebase';
import { buildJobShareUrl, recordJobShare } from '@/lib/referrals';

interface ShareJobModalProps {
    jobTitle: string;
    jobId: string;
    onClose: () => void;
}

export default function ShareJobModal({ jobTitle, jobId, onClose }: ShareJobModalProps) {
    const [copied, setCopied] = useState(false);
    const [sharing, setSharing] = useState(false);
    const skin = useSkin();
    // Signed-in seekers (and recruiters) get a personal referral link, so an
    // application that comes back through it is credited to the sharer.
    const referralCode = auth.currentUser?.uid ?? null;
    const shareUrl = buildJobShareUrl(jobId, referralCode);

    const handleCopyLink = async () => {
        try {
            const textToCopy = `${jobTitle}\n${shareUrl}`;
            await navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            popup.success('Link copied to clipboard!');
            // Count the share against the sharer's referral link (best-effort).
            void recordJobShare(jobId, jobTitle);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            popup.error('Failed to copy link');
        }
    };

    const handleNativeShare = async () => {
        if (sharing) return;
        setSharing(true);
        try {
            if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
                await navigator.share({ title: jobTitle, text: jobTitle, url: shareUrl });
                void recordJobShare(jobId, jobTitle);
                popup.success('Shared!');
            } else {
                await handleCopyLink();
            }
        } catch (err) {
            // The user closing the native sheet is not an error worth reporting.
            if ((err as { name?: string } | null)?.name !== 'AbortError') {
                popup.error('Failed to share');
            }
        } finally {
            setSharing(false);
        }
    };

    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} max-w-md w-full p-6`} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h3 className={skin.heading}>Share Job</h3>
                    <button
                        onClick={onClose}
                        className={`p-2 text-ink/60 hover:bg-ink/5 hover:text-ink ${skin.radius} cursor-pointer transition-colors ${FOCUS}`}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Job Title */}
                <div className="mb-6 p-4 bg-brand/10 rounded-lg border border-brand/20">
                    <p className="text-sm font-semibold text-ink line-clamp-2">{jobTitle}</p>
                </div>

                {/* Copy Link Section */}
                <div className="space-y-3">
                    <p className="text-sm font-medium text-ink/80">
                        {referralCode ? 'Copy your referral link to share' : 'Copy link to share'}
                    </p>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={shareUrl}
                            readOnly
                            aria-label="Share link"
                            className={`flex-1 rounded-lg px-4 py-3 ${skin.field} ${FOCUS}`}
                        />
                        <button
                            onClick={handleCopyLink}
                            className={`inline-flex items-center gap-2 rounded-lg cursor-pointer transition-all ${skin.cta} ${FOCUS} ${copied
                                ? ''
                                : 'hover:scale-105 active:scale-95'
                                }`}
                        >
                            {copied ? (
                                <>
                                    <Check className="w-4 h-4" />
                                    <span>Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-4 h-4" />
                                    <span>Copy</span>
                                </>
                            )}
                        </button>
                    </div>

                    {canNativeShare && (
                        <button
                            type="button"
                            onClick={handleNativeShare}
                            disabled={sharing}
                            className={`inline-flex w-full items-center justify-center gap-2 rounded-lg cursor-pointer ${skin.secondary} ${FOCUS} disabled:opacity-50`}
                        >
                            <Share2 className="w-4 h-4" aria-hidden="true" />
                            {sharing ? 'Sharing…' : 'Share via device'}
                        </button>
                    )}
                </div>

                {/* Referral reward note */}
                {referralCode && (
                    <div className={`mt-4 flex items-start gap-2.5 rounded-lg border ${skin.edge} bg-ink/[0.03] px-3.5 py-3`}>
                        <Gift className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                        <p className="text-xs leading-relaxed text-ink/70">
                            This is your personal referral link. When someone applies through it, the application is
                            marked <span className="font-semibold text-ink">source: referral</span> and the recruiter can
                            reward you with credit points.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
