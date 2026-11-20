import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import type { PostCloseReason, RecruitmentRequest } from '@/types';
import { DEFAULT_VALIDITY_DAYS, EXTEND_OPTIONS, VALIDITY_OPTIONS, addDays, endOfDay, formatDate, getPostLifecycle } from '@/lib/postLifecycle';
import { useSkin, FOCUS } from '@/styles/skin';

export type LifecycleDialogKind = 'close' | 'extend' | 'repost';

export type LifecycleDialogResult =
    | { kind: 'close'; reason: PostCloseReason }
    /** Either days to add, or an exact closing date (single post only). */
    | { kind: 'extend'; days?: number; until?: Date }
    | { kind: 'repost'; days?: number; until?: Date };

interface Props {
    kind: LifecycleDialogKind;
    /** The post being changed. Omit for a bulk action and pass `count` instead. */
    post?: RecruitmentRequest;
    count?: number;
    onCancel: () => void;
    onConfirm: (result: LifecycleDialogResult) => Promise<void>;
}

const CLOSE_REASONS: { value: PostCloseReason; label: string; hint: string }[] = [
    { value: 'filled', label: 'Position filled', hint: 'You hired for this role.' },
    { value: 'cancelled', label: 'Hiring cancelled', hint: 'The role is no longer open.' },
    { value: 'other', label: 'Other reason', hint: 'Closed for another reason.' },
];

const toInputDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * One small confirm dialog for the lifecycle actions that need a choice:
 * close (why), extend (by how long, or until a date) and repost (for how long,
 * or until a date). Works for one post or, with `count`, for a selection.
 * Pause and resume need no choice and act straight from the menu.
 */
export default function PostLifecycleDialog({ kind, post, count = 1, onCancel, onConfirm }: Props) {
    const skin = useSkin();
    const bulk = !post;
    const [busy, setBusy] = useState(false);
    const [reason, setReason] = useState<PostCloseReason>('filled');
    const [days, setDays] = useState<number>(kind === 'extend' ? EXTEND_OPTIONS[1] : (post?.validityDays ?? DEFAULT_VALIDITY_DAYS));
    // "Pick a date" replaces the day buttons with a date field.
    const [useDate, setUseDate] = useState(false);
    const tomorrow = toInputDate(addDays(Date.now(), 1));
    const [dateText, setDateText] = useState(tomorrow);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [busy, onCancel]);

    const lc = post ? getPostLifecycle(post) : null;
    const options: readonly number[] = kind === 'extend' ? EXTEND_OPTIONS : VALIDITY_OPTIONS;
    const picked = useDate ? endOfDay(dateText) : null;
    const dateValid = !useDate || (picked !== null && picked.getTime() > Date.now());
    // What the new expiry will be, so the choice is concrete.
    const newExpiry: Date | null = useDate
        ? picked
        : kind === 'extend'
            ? (lc?.expiresAt ? addDays(lc.expiresAt, days) : null)
            : addDays(Date.now(), days);

    const noun = bulk ? `${count} ${count === 1 ? 'post' : 'posts'}` : post!.jobTitle;
    const title = kind === 'close' ? (bulk ? `Close ${noun}?` : 'Close this post?') : kind === 'extend' ? (bulk ? `Extend ${noun}` : 'Extend this post') : 'Repost this job';
    const confirmLabel = kind === 'close' ? (bulk ? `Close ${count}` : 'Close post') : kind === 'extend' ? 'Extend' : 'Repost';

    const submit = async () => {
        if (!dateValid) return;
        setBusy(true);
        try {
            if (kind === 'close') await onConfirm({ kind, reason });
            else await onConfirm(useDate && picked ? { kind, until: picked } : { kind, days });
        } finally {
            setBusy(false);
        }
    };

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-lifecycle-title"
            onClick={() => { if (!busy) onCancel(); }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
            <div onClick={(e) => e.stopPropagation()} className={`relative w-full max-w-md rounded-2xl border ${skin.edge} ${skin.surface} p-6 shadow-2xl`}>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={busy}
                    aria-label="Close dialog"
                    className={`absolute right-3 top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>

                <h3 id="post-lifecycle-title" className="pr-8 text-lg font-bold text-ink">{title}</h3>
                {!bulk && <p className="mt-1 truncate text-sm text-ink/60" title={post!.jobTitle}>{post!.jobTitle}</p>}

                {kind === 'close' && (
                    <>
                        <p className="mt-4 text-sm text-ink/70">
                            Candidates will no longer see {bulk ? 'these posts' : 'this post'} or be able to apply. Applications you already have stay in your pipeline, and you can repost later.
                        </p>
                        <fieldset className="mt-4 space-y-2">
                            <legend className="sr-only">Reason for closing</legend>
                            {CLOSE_REASONS.map((r) => (
                                <label key={r.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${reason === r.value ? 'border-ink bg-ink/5' : `${skin.edge}`}`}>
                                    <input type="radio" name="close-reason" value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="mt-1" />
                                    <span>
                                        <span className="block text-sm font-semibold text-ink">{r.label}</span>
                                        <span className="block text-xs text-ink/60">{r.hint}</span>
                                    </span>
                                </label>
                            ))}
                        </fieldset>
                    </>
                )}

                {kind !== 'close' && (
                    <>
                        <p className="mt-4 text-sm text-ink/70">
                            {kind === 'extend'
                                ? (bulk
                                    ? 'Add more time to each selected post that is active or paused and has an expiry:'
                                    : `This post currently ${lc?.status === 'paused' ? 'would expire' : 'expires'} on ${formatDate(lc?.expiresAt)}. Add more time:`)
                                : 'The post goes live again today with a new expiry. Its applicants and history are kept. Run it for:'}
                        </p>
                        <div role="radiogroup" aria-label={kind === 'extend' ? 'Days to add' : 'Listing validity'} className="mt-3 flex flex-wrap gap-2">
                            {options.map((d) => (
                                <button
                                    key={d}
                                    type="button"
                                    role="radio"
                                    aria-checked={!useDate && days === d}
                                    onClick={() => { setUseDate(false); setDays(d); }}
                                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${!useDate && days === d ? 'border-ink bg-ink text-surface' : `${skin.edge} text-ink hover:bg-ink/5`} ${FOCUS}`}
                                >
                                    {kind === 'extend' ? `+${d} days` : `${d} days`}
                                </button>
                            ))}
                            {!bulk && (
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={useDate}
                                    onClick={() => setUseDate(true)}
                                    className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${useDate ? 'border-ink bg-ink text-surface' : `${skin.edge} text-ink hover:bg-ink/5`} ${FOCUS}`}
                                >
                                    Pick a date
                                </button>
                            )}
                        </div>
                        {useDate && (
                            <div className="mt-3">
                                <label htmlFor="post-closing-date" className="block text-xs font-medium text-ink/70">Closes at the end of</label>
                                <input
                                    id="post-closing-date"
                                    type="date"
                                    min={tomorrow}
                                    value={dateText}
                                    onChange={(e) => setDateText(e.target.value)}
                                    className={`mt-1 w-full rounded-lg px-3 py-2 ${skin.field} !font-normal ${FOCUS}`}
                                />
                                {!dateValid && <p className="mt-1 text-xs text-destructive">Pick a date after today.</p>}
                            </div>
                        )}
                        {newExpiry && dateValid && <p className="mt-3 text-xs text-ink/60">{useDate ? 'Closing date' : 'New expiry'}: <span className="font-semibold text-ink">{formatDate(newExpiry)}</span></p>}
                    </>
                )}

                <div className="mt-6 flex justify-end gap-3">
                    <button type="button" onClick={onCancel} disabled={busy} className={`cursor-pointer rounded-lg ${skin.secondary} ${FOCUS}`}>Cancel</button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={busy || !dateValid}
                        className={`inline-flex cursor-pointer items-center gap-2 rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}
                    >
                        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
