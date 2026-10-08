import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSkin, FOCUS } from '@/styles/skin';

interface ShareJobModalProps {
    jobTitle: string;
    jobId: string;
    onClose: () => void;
}

export default function ShareJobModal({ jobTitle, jobId, onClose }: ShareJobModalProps) {
    const [copied, setCopied] = useState(false);
    const shareUrl = `${window.location.origin}/job/${jobId}`;
    const skin = useSkin();

    const handleCopyLink = async () => {
        try {
            const textToCopy = `${jobTitle}\n${shareUrl}`;
            await navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            toast.success('Link copied to clipboard!');
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast.error('Failed to copy link');
        }
    };

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
                    <p className="text-sm font-medium text-ink/80">Copy link to share</p>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={shareUrl}
                            readOnly
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
                </div>
            </div>
        </div>
    );
}
