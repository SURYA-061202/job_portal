import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, Download } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface ResumePreviewModalProps {
    url: string;
    onClose: () => void;
    title?: string;
    /** Name for the downloaded file, without extension. */
    fileName?: string;
    /** Runs before a download starts; return false to cancel it (e.g. when credit points are short). */
    onBeforeDownload?: () => Promise<boolean> | boolean;
    /** Small note on the download button, e.g. "5 credits". */
    downloadHint?: string;
}

type PreviewStatus = 'loading' | 'ready' | 'failed';

/** Full-screen overlay that previews a stored resume (PDF) inline instead of opening a new browser tab. */
export default function ResumePreviewModal({ url, onClose, title = 'Resume Preview', fileName, onBeforeDownload, downloadHint }: ResumePreviewModalProps) {
    const isPdf = /\.pdf(\?|#|$)/i.test(url);
    const [downloading, setDownloading] = useState(false);

    const handleDownload = async () => {
        if (downloading) return;
        setDownloading(true);
        try {
            if (onBeforeDownload && !(await onBeforeDownload())) return;
            const ext = isPdf ? 'pdf' : (url.split('?')[0].split('.').pop() || 'pdf').slice(0, 5);
            const name = `${(fileName || 'Resume').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Resume'}.${ext}`;
            try {
                // Fetching as a blob forces a real download (a plain link to another origin would just open).
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Download failed (${response.status})`);
                const objectUrl = URL.createObjectURL(await response.blob());
                const link = document.createElement('a');
                link.href = objectUrl;
                link.download = name;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
            } catch (error) {
                console.error('Blob download failed, opening the file instead:', error);
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        } finally {
            setDownloading(false);
        }
    };
    const [status, setStatus] = useState<PreviewStatus>(isPdf ? 'loading' : 'failed');
    const scrollRef = useRef<HTMLDivElement>(null);
    const stackRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!isPdf) {
            setStatus('failed');
            return;
        }

        let cancelled = false;
        let destroyDoc: (() => void) | null = null;
        setStatus('loading');

        (async () => {
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`Resume fetch failed (${response.status})`);
                const buffer = await response.arrayBuffer();
                const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
                destroyDoc = () => doc.destroy();

                const scroll = scrollRef.current;
                const stack = stackRef.current;
                if (!scroll || !stack) throw new Error('Preview container missing');
                stack.innerHTML = '';

                // Pages are painted at the container's content width (scroll padding is 16px a side).
                const pageWidth = Math.max(320, scroll.clientWidth - 32);
                const dpr = Math.min(window.devicePixelRatio || 1, 2);

                for (let i = 1; i <= doc.numPages; i++) {
                    if (cancelled) return;
                    const page = await doc.getPage(i);
                    const base = page.getViewport({ scale: 1 });
                    const viewport = page.getViewport({ scale: (pageWidth / base.width) * dpr });

                    const canvas = document.createElement('canvas');
                    canvas.width = Math.floor(viewport.width);
                    canvas.height = Math.floor(viewport.height);
                    canvas.style.width = '100%';
                    canvas.style.height = 'auto';
                    canvas.className = 'block rounded-sm bg-white shadow-md';
                    stack.appendChild(canvas);

                    const ctx = canvas.getContext('2d');
                    if (!ctx) throw new Error('Canvas unavailable');
                    await page.render({ canvasContext: ctx, viewport }).promise;
                }

                if (!cancelled) setStatus('ready');
            } catch (error) {
                console.error('In-app resume preview failed, falling back to browser viewer:', error);
                if (!cancelled) setStatus('failed');
            }
        })();

        return () => {
            cancelled = true;
            try {
                destroyDoc?.();
            } catch {
                /* ignore teardown errors */
            }
        };
    }, [url, isPdf]);

    // Portal to <body>: an ancestor stacking context (page content) would otherwise keep the overlay under the header.
    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="bg-surface rounded-2xl w-full max-w-4xl p-6 relative z-10 shadow-2xl h-[90vh] max-h-[90vh] flex flex-col border border-border resume-preview-scroll">
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-xl font-bold text-ink">{title}</h2>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={downloading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold border border-border bg-surface text-ink hover:border-ink rounded-lg transition-colors disabled:opacity-60"
                        >
                            {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Download
                            {downloadHint && <span className="text-[11px] font-semibold text-ink/50">({downloadHint})</span>}
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-ink/5 rounded-full transition-colors" aria-label="Close preview"><X className="w-5 h-5 text-ink/60" /></button>
                    </div>
                </div>
                <div className="flex-1 min-h-0 rounded-xl border border-border bg-muted overflow-hidden relative">
                    {!isPdf ? (
                        <div className="h-full w-full flex flex-col items-center justify-center gap-4 p-6 text-center">
                            <p className="text-sm text-ink/60">This file type can't be previewed inline.</p>
                            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold border border-border bg-surface text-ink hover:border-ink px-6 py-2 rounded-xl transition-colors">
                                Open in new tab
                            </a>
                        </div>
                    ) : status === 'failed' ? (
                        <iframe src={url} title={title} className="w-full h-full" />
                    ) : (
                        <>
                            <div ref={scrollRef} className="h-full w-full overflow-y-auto resume-preview-scroll">
                                <div ref={stackRef} className="flex min-h-full w-full flex-col items-center gap-4 p-4" />
                            </div>
                            {status === 'loading' && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/90">
                                    <Loader2 className="w-6 h-6 text-brand animate-spin" />
                                    <span className="text-xs font-bold text-ink/60">Preparing preview…</span>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
