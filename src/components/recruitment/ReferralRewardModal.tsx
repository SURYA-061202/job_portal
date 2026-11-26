import { useState } from 'react';
import { X, Gift, Loader2, Sparkles } from 'lucide-react';
import type { ApplicationSource } from '@/types';
import { errorMessage } from '@/lib/errors';
import { rewardReferral } from '@/lib/referrals';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

interface Props {
    postId: string;
    applicantUid: string;
    applicantName?: string;
    /** Must be a referral source (the button only shows for those). */
    source: Extract<ApplicationSource, { type: 'referral' }>;
    onClose: () => void;
    /** Fired after a successful reward so the caller can refresh/lock the action. */
    onRewarded?: (points: number) => void;
}

const PRESETS = [5, 10, 20, 50];

/**
 * Rewards the person who referred a candidate: the points land on the referrer's
 * credit balance through the rewardReferral Cloud Function (the only writer of
 * `users/{uid}.bonusCredits`), and they get a notification.
 */
export default function ReferralRewardModal({ postId, applicantUid, applicantName, source, onClose, onRewarded }: Props) {
    const skin = useSkin();
    const [points, setPoints] = useState<number>(10);
    const [custom, setCustom] = useState('');
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);

    const effectivePoints = custom.trim() ? Number(custom) : points;

    const handleReward = async () => {
        if (sending) return;
        if (!Number.isFinite(effectivePoints) || effectivePoints < 1 || effectivePoints > 100) {
            popup.error('Choose between 1 and 100 credit points.');
            return;
        }
        setSending(true);
        try {
            const result = await rewardReferral({
                postId,
                applicantUid,
                referrerUid: source.referrerUid,
                points: Math.round(effectivePoints),
                note: note.trim() || undefined,
            });
            popup.success(
                `Reward sent: ${result.points} credit point${result.points === 1 ? '' : 's'} added to ${source.referrerName || 'the referrer'}'s balance.`
            );
            onRewarded?.(result.points);
            onClose();
        } catch (err) {
            console.error('Referral reward failed:', err);
            popup.error(errorMessage(err) || 'Could not send the reward. Please try again.');
        } finally {
            setSending(false);
        }
    };

    const field = `w-full rounded-lg px-3 py-2 ${skin.field} ${FOCUS}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Reward referrer">
            <div className={`relative w-full max-w-md p-6 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
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
                        <Gift className="h-4 w-4" />
                    </span>
                    <h2 className={skin.heading}>Reward Referral</h2>
                </div>
                <p className={`mb-4 text-sm ${skin.body}`}>
                    <span className="font-semibold text-ink">{source.referrerName || 'This user'}</span> referred
                    {applicantName ? <span className="font-semibold text-ink"> {applicantName}</span> : ' this candidate'}
                    {' '}through a shared job link. Send them credit points as a thank-you.
                </p>

                <div className="space-y-4">
                    <div>
                        <p className="mb-1.5 text-sm font-medium text-ink/80" id="reward-points-label">Credit points</p>
                        <div className="flex flex-wrap gap-2" role="group" aria-labelledby="reward-points-label">
                            {PRESETS.map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => { setPoints(p); setCustom(''); }}
                                    aria-pressed={!custom && points === p}
                                    className={`cursor-pointer rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${FOCUS} ${
                                        !custom && points === p
                                            ? 'border-brand bg-brand text-white'
                                            : `border-ink/20 bg-surface text-ink hover:border-ink/40`
                                    }`}
                                >
                                    {p}
                                </button>
                            ))}
                            <input
                                type="number"
                                min={1}
                                max={100}
                                placeholder="Custom"
                                aria-label="Custom credit points"
                                value={custom}
                                onChange={(e) => setCustom(e.target.value)}
                                className={`w-24 rounded-lg px-3 py-2 text-sm ${skin.field} ${FOCUS}`}
                            />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="reward-note" className="mb-1 block text-sm font-medium text-ink/80">Note (optional)</label>
                        <input
                            id="reward-note"
                            type="text"
                            className={field}
                            value={note}
                            maxLength={200}
                            placeholder="e.g. Great referral — joined the team"
                            onChange={(e) => setNote(e.target.value)}
                            disabled={sending}
                        />
                    </div>

                    <div className={`rounded-lg border ${skin.edge} bg-ink/[0.03] px-3.5 py-3 text-xs leading-relaxed text-ink/70`}>
                        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                            <Sparkles className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
                            {effectivePoints || 0} point{effectivePoints === 1 ? '' : 's'}
                        </span>
                        {' '}will be added to the referrer's balance and counted as bonus credits on top of their plan.
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onClose} disabled={sending} className={`cursor-pointer rounded-lg ${skin.secondary} ${FOCUS} disabled:opacity-50`}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleReward}
                        disabled={sending}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}
                    >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Gift className="h-4 w-4" aria-hidden="true" />}
                        {sending ? 'Sending…' : 'Send reward'}
                    </button>
                </div>
            </div>
        </div>
    );
}
