import { createPortal } from 'react-dom';
import { Crown, X } from 'lucide-react';
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
    if (!isOpen) return null;

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-limit-title"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        >
            <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} w-full max-w-md`}>
                <div className={`flex items-center justify-between border-b ${skin.edge} px-6 py-5`}>
                    <h3 id="post-limit-title" className={skin.heading}>Post limit reached</h3>
                    <button onClick={onClose} aria-label="Close" className={`shrink-0 cursor-pointer rounded-lg p-1 ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 text-center">
                    <p className="text-4xl font-black text-ink">{used}<span className="text-ink/40"> / {limit}</span></p>
                    <p className={`mt-1 ${skin.micro}`}>Job posts used on the {planName} plan</p>
                    <p className={`mt-4 ${skin.body}`}>
                        You cannot add more job posts on your current plan. Subscribe to a higher plan to post more jobs.
                    </p>
                </div>

                <div className="flex gap-3 px-6 pb-6">
                    <button onClick={onClose} className={`flex-1 cursor-pointer ${skin.secondary} ${FOCUS}`}>
                        Maybe later
                    </button>
                    <button
                        onClick={() => {
                            onClose();
                            onViewPlans();
                        }}
                        className={`flex-1 inline-flex items-center justify-center gap-2 cursor-pointer ${skin.cta} ${FOCUS}`}
                    >
                        <Crown className="w-4 h-4" aria-hidden="true" />
                        View plans
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
