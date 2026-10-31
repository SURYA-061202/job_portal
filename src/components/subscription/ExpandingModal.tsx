import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';

interface ExpandingModalProps {
    title: string;
    subtitle?: string;
    /** Screen point (the clicked button's centre) the dialog grows out of. */
    origin: { x: number; y: number };
    onClose: () => void;
    /** Tailwind max-width class for the panel; defaults to the wide table size. */
    widthClass?: string;
    /** Tailwind height classes for the panel; defaults to the full height of the screen. */
    heightClass?: string;
    /** Small control shown right beside the title (for example an edit icon). */
    titleAction?: ReactNode;
    children: ReactNode;
}

/** Tall panel on the right side that scales up from the button that opened it. Rendered on <body> so nothing can sit over it. */
export default function ExpandingModal({ title, subtitle, origin, onClose, widthClass = 'max-w-[46rem]', heightClass = 'h-full', titleAction, children }: ExpandingModalProps) {
    const skin = useSkin();
    const dialogRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = dialogRef.current;
        if (el) {
            const r = el.getBoundingClientRect();
            el.style.transformOrigin = `${origin.x - r.left}px ${origin.y - r.top}px`;
            if (typeof el.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                el.animate(
                    [{ transform: 'scale(0.15)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
                    { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
                );
            }
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-stretch justify-end bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onClick={(e) => e.stopPropagation()}
                className={`flex ${heightClass} w-full ${widthClass} flex-col overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}
            >
                <div className={`flex shrink-0 items-center justify-between border-b ${skin.edge} px-5 py-4`}>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className={skin.heading}>{title}</h3>
                            {titleAction}
                        </div>
                        {subtitle && <p className={`mt-0.5 ${skin.meta}`}>{subtitle}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
                <div className="thin-scrollbar flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
            </div>
        </div>,
        document.body
    );
}
