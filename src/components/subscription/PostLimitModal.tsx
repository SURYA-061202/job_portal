import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Crown, Lock, X } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';

interface PostLimitModalProps {
    isOpen: boolean;
    onClose: () => void;
    /** Posts the recruiter already has. */
    used: number;
    /** Posts their current plan allows. */
    limit: number;
    planName: string;
    onViewPlans: () => void;
}

/** Shown instead of the post form when a recruiter has used every post their plan allows. */
export default function PostLimitModal({ isOpen, onClose, used, limit, planName, onViewPlans }: PostLimitModalProps) {
    const skin = useSkin();

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const noPlan = limit === 0;
    const pct = Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-limit-title"
            onClick={onClose}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={`relative w-full max-w-sm overflow-hidden rounded-2xl border ${skin.edge} ${skin.surface} px-7 pb-6 pt-8 text-center shadow-2xl`}
            >
                <button
                    onClick={onClose}
                    aria-label="Close"
                    className={`absolute right-3 top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>

                <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ink/5 text-ink" aria-hidden="true">
                    {noPlan ? <Lock className="h-6 w-6" /> : <Crown className="h-6 w-6" />}
                </span>

                <h3 id="post-limit-title" className="mt-5 text-xl font-bold text-ink">
                    {noPlan ? 'Subscription required' : 'Post limit reached'}
                </h3>

                {noPlan ? (
                    <p className={`mx-auto mt-2 max-w-xs ${skin.body}`}>
                        The {planName} plan can't add job posts. Choose a plan to start posting jobs.
                    </p>
                ) : (
                    <>
                        <div className="mx-auto mt-4 max-w-xs">
                            <div className="flex items-baseline justify-between text-xs font-semibold text-ink/70">
                                <span>Job posts used</span>
                                <span className="text-ink">{used} / {limit}</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
                                <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
                            </div>
                        </div>
                        <p className={`mx-auto mt-4 max-w-xs ${skin.body}`}>
                            You've used every post on the {planName} plan. Upgrade to post more jobs.
                        </p>
                    </>
                )}

                <button
                    onClick={() => {
                        onClose();
                        onViewPlans();
                    }}
                    className={`mt-6 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg ${skin.cta} ${FOCUS}`}
                >
                    <Crown className="h-4 w-4" aria-hidden="true" />
                    View plans
                </button>
                <button
                    onClick={onClose}
                    className={`mt-2 h-10 w-full cursor-pointer rounded-lg text-sm font-semibold ${skin.subtle} hover:text-ink ${FOCUS}`}
                >
                    Maybe later
                </button>
            </div>
        </div>,
        document.body
    );
}
