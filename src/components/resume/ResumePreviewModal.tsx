import { X } from 'lucide-react';

interface ResumePreviewModalProps {
    url: string;
    onClose: () => void;
}

/** Full-screen overlay that previews a stored resume (PDF) inline instead of opening a new browser tab. */
export default function ResumePreviewModal({ url, onClose }: ResumePreviewModalProps) {
    const isPdf = /\.pdf(\?|#|$)/i.test(url);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-surface rounded-2xl w-full max-w-3xl p-6 relative z-10 shadow-2xl h-[90vh] max-h-[90vh] flex flex-col border border-border">
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-xl font-bold text-ink">Resume Preview</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-ink/5 rounded-full transition-colors" aria-label="Close preview"><X className="w-5 h-5 text-ink/60" /></button>
                </div>
                <div className="flex-1 min-h-0 rounded-xl border border-border bg-muted overflow-hidden">
                    {isPdf ? (
                        <iframe src={url} title="Resume Preview" className="w-full h-full" />
                    ) : (
                        <div className="h-full w-full flex flex-col items-center justify-center gap-4 p-6 text-center">
                            <p className="text-sm text-ink/60">This file type can't be previewed inline.</p>
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold border border-border bg-surface text-ink hover:border-ink px-6 py-2 rounded-xl transition-colors">
                                Open in new tab
                            </a>
                        </div>
                    )}
                </div>
                <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border flex-shrink-0">
                    <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-ink/60 hover:bg-ink/5 hover:text-ink rounded-xl transition-colors">Close</button>
                </div>
            </div>
        </div>
    );
}
