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
    const shareText = `Check out this job opportunity: ${jobTitle}`;

    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            toast.success('Link copied to clipboard!');
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast.error('Failed to copy link');
        }
    };

    const shareOptions = [
        {
            name: 'WhatsApp',
            icon: '📱',
            color: 'bg-green-500 hover:bg-green-600',
            onClick: () => {
                window.open(`https://wa.me/?text=${encodeURIComponent(shareText + '\n' + shareUrl)}`, '_blank');
            }
        },
        {
            name: 'Telegram',
            icon: '✈️',
            color: 'bg-blue-500 hover:bg-blue-600',
            onClick: () => {
                window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`, '_blank');
            }
        },
        {
            name: 'Email',
            icon: '📧',
            color: 'bg-gray-600 hover:bg-gray-700',
            onClick: () => {
                window.location.href = `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(shareUrl)}`;
            }
        },
        {
            name: 'LinkedIn',
            icon: '💼',
            color: 'bg-blue-700 hover:bg-blue-800',
            onClick: () => {
                window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank');
            }
        },
        {
            name: 'Twitter',
            icon: '🐦',
            color: 'bg-sky-500 hover:bg-sky-600',
            onClick: () => {
                window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
            }
        },
        {
            name: 'Facebook',
            icon: '👥',
            color: 'bg-blue-600 hover:bg-blue-700',
            onClick: () => {
                window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank');
            }
        }
    ];

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
                <div className="mb-6 p-4 bg-orange-50 rounded-lg border border-orange-100">
                    <p className="text-sm font-semibold text-gray-900 line-clamp-2">{jobTitle}</p>
                </div>

                {/* Share Options */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                    {shareOptions.map((option) => (
                        <button
                            key={option.name}
                            onClick={option.onClick}
                            className={`flex flex-col items-center justify-center p-4 rounded-xl ${option.color} text-white transition-all hover:scale-105 active:scale-95`}
                        >
                            <span className="text-2xl mb-2">{option.icon}</span>
                            <span className="text-xs font-medium">{option.name}</span>
                        </button>
                    ))}
                </div>

                {/* Copy Link Section */}
                <div className="border-t border-gray-200 pt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Or copy link</p>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            value={shareUrl}
                            readOnly
                            className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <button
                            onClick={handleCopyLink}
                            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${copied
                                    ? 'bg-green-500 text-white'
                                    : 'bg-orange-600 text-white hover:bg-orange-700'
                                }`}
                        >
                            {copied ? (
                                <Check className="w-4 h-4" />
                            ) : (
                                <Copy className="w-4 h-4" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
