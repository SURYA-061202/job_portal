import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useSkin, FOCUS } from '@/styles/skin';

interface SkillsLineProps {
  skills: string[];
  /** Lines of text shown before the "…" appears. */
  lines?: 1 | 2;
  /** Text size/colour of the line; the label is always bolder. */
  textClass?: string;
  /** Background that masks the text behind the "…" - match the card's surface. */
  maskClass?: string;
  className?: string;
  label?: string;
  /** Renders one skill, e.g. to highlight search keywords. */
  render?: (skill: string) => ReactNode;
}

/**
 * "Skills: a, b, c" as plain text, held to `lines` lines. When the list is
 * longer, a "…" sits at the end of the last line; hovering (or focusing/tapping)
 * it opens a popover with every skill. The popover is portalled to <body>
 * because cards clip their overflow.
 */
export default function SkillsLine({
  skills,
  lines = 2,
  textClass = 'text-xs leading-5 text-ink/80',
  maskClass = 'bg-surface',
  className = 'mt-3',
  label = 'Skills',
  render,
}: SkillsLineProps) {
  const skin = useSkin();
  const textRef = useRef<HTMLParagraphElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [overflow, setOverflow] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => setOverflow(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [skills, lines]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const open = () => {
    window.clearTimeout(closeTimer.current);
    if (triggerRef.current) setAnchor(triggerRef.current.getBoundingClientRect());
  };
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setAnchor(null), 120);
  };

  const width = 288;
  const popStyle: React.CSSProperties | undefined = anchor
    ? {
        width,
        left: Math.min(Math.max(8, anchor.right - width), window.innerWidth - width - 8),
        // Opens below the dots, or above them when there is no room underneath.
        ...(anchor.bottom > window.innerHeight - 240
          ? { bottom: window.innerHeight - anchor.top + 8 }
          : { top: anchor.bottom + 8 }),
      }
    : undefined;

  return (
    <div className={`relative ${className} ${textClass}`}>
      {/* One line = 1.25rem (leading-5), two = 2.5rem; the text is cut there. */}
      <p ref={textRef} className={`${lines === 1 ? 'max-h-5' : 'max-h-10'} overflow-hidden break-words`}>
        <span className="font-semibold text-ink">{label}: </span>
        {skills.map((s, i) => (
          <Fragment key={`${s}-${i}`}>{i > 0 && ', '}{render ? render(s) : s}</Fragment>
        ))}
      </p>
      {overflow && (
        <button
          ref={triggerRef}
          type="button"
          aria-label={`Show all ${skills.length} skills`}
          aria-expanded={!!anchor}
          onClick={(e) => { e.stopPropagation(); if (anchor) setAnchor(null); else open(); }}
          onKeyDown={(e) => e.stopPropagation()}
          onMouseEnter={open}
          onMouseLeave={closeSoon}
          onFocus={open}
          onBlur={closeSoon}
          className={`absolute bottom-0 right-0 cursor-pointer rounded pl-3 pr-1 font-bold leading-5 tracking-widest text-ink hover:text-brand ${maskClass} ${FOCUS}`}
        >
          …
        </button>
      )}
      {anchor && popStyle && createPortal(
        <div
          role="tooltip"
          style={popStyle}
          onMouseEnter={open}
          onMouseLeave={closeSoon}
          onClick={(e) => e.stopPropagation()}
          className={`fixed z-[300] border ${skin.edge} bg-surface ${skin.radius} p-3 shadow-xl`}
        >
          <p className={`mb-2 ${skin.micro}`}>{label} ({skills.length})</p>
          <div className="thin-scrollbar flex max-h-52 flex-wrap gap-1.5 overflow-y-auto">
            {skills.map((s, i) => (
              <span key={`${s}-${i}`} className="rounded-md bg-ink/5 px-2 py-0.5 text-[11px] font-medium text-ink/80">{render ? render(s) : s}</span>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
