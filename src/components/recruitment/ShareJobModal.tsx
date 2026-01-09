import { X, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';

interface ShareJobModalProps {
    jobTitle: string;
    jobId: string;
    onClose: () => void;
}

export default function ShareJobModal({ jobTitle, jobId, onClose }: ShareJobModalProps) {
    const [copied, setCopied] = useState(false);
    const shareUrl = `${window.location.origin}/job/${jobId}`;

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
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-gray-900">Share Job</h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Job Title */}
                <div className="mb-6 p-4 bg-gradient-to-r from-orange-50 to-pink-50 rounded-lg border border-orange-200">
                    <p className="text-sm font-semibold text-gray-900 line-clamp-2">{jobTitle}</p>
                </div>

                {/* Copy Link Section */}
                <div className="space-y-3">
                    <p className="text-sm font-medium text-gray-700">Copy link to share</p>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={shareUrl}
                            readOnly
                            className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                        />
                        <button
                            onClick={handleCopyLink}
                            className={`px-5 py-3 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${copied
                                ? 'bg-green-500 text-white'
                                : 'bg-gradient-to-r from-orange-500 to-pink-600 text-white hover:shadow-lg hover:shadow-orange-500/30 hover:scale-105 active:scale-95'
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
