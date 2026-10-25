import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';

/** Three cards per view (two on tablets, one on phones) with arrows to slide to the next ones. */
export default function PlanSlider({ children }: { children: ReactNode }) {
    const skin = useSkin();
    const trackRef = useRef<HTMLDivElement>(null);
    const [canPrev, setCanPrev] = useState(false);
    const [canNext, setCanNext] = useState(false);
    const count = Children.count(children);

    const update = useCallback(() => {
        const el = trackRef.current;
        if (!el) return;
        setCanPrev(el.scrollLeft > 4);
        setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    }, []);

    useEffect(() => {
        update();
        const el = trackRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [count, update]);

    const slide = (dir: 1 | -1) => {
        const el = trackRef.current;
        if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' });
    };

    const arrow = `absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border ${skin.edge} bg-surface text-ink shadow-md transition-opacity duration-200 hover:border-ink/40 cursor-pointer ${FOCUS} disabled:pointer-events-none disabled:opacity-0`;

    return (
        <div className="relative">
            <button type="button" onClick={() => slide(-1)} disabled={!canPrev} aria-label="Previous plans" className={`${arrow} -left-3`}>
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => slide(1)} disabled={!canNext} aria-label="Next plans" className={`${arrow} -right-3`}>
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
            <div
                ref={trackRef}
                onScroll={update}
                className="grid grid-flow-col auto-cols-[100%] gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth scrollbar-hide md:auto-cols-[calc((100%-1rem)/2)] xl:auto-cols-[calc((100%-2rem)/3)]"
            >
                {Children.map(children, (child) => (
                    <div className="snap-start min-w-0">{child}</div>
                ))}
            </div>
        </div>
    );
}
