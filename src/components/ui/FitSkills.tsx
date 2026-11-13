import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface FitSkillsProps {
  skills: string[];
  /** Renders a skill's text, e.g. to highlight search keywords. */
  render?: (skill: string) => ReactNode;
}

const GAP = 6;
const CHIP = 'whitespace-nowrap rounded-md bg-ink/5 px-2 py-0.5 text-xs font-medium text-ink/80';

/**
 * Skill chips on one line, as many as the cell is wide enough for; only what does
 * not fit is folded into "+N more" (the full list is in the hover title).
 * A hidden copy of the chips is measured, so the count follows the column width.
 * The wrapper clips that copy; unclipped it would widen the table and cause a horizontal scrollbar.
 */
export default function FitSkills({ skills, render }: FitSkillsProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(skills.length);
  const total = skills.length;
  const key = skills.join('\u0000');

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const measure = measureRef.current;
    if (!wrap || !measure) return;
    const compute = () => {
      const kids = Array.from(measure.children) as HTMLElement[];
      const probe = kids.pop();
      const widths = kids.map((k) => k.offsetWidth);
      const moreWidth = (probe?.offsetWidth ?? 0) + GAP;
      const available = wrap.clientWidth;
      let used = 0;
      let fit = 0;
      for (let i = 0; i < widths.length; i++) {
        const w = widths[i] + (i > 0 ? GAP : 0);
        const reserve = i < widths.length - 1 ? moreWidth : 0;
        if (used + w + reserve > available) break;
        used += w;
        fit = i + 1;
      }
      setVisible(widths.length ? Math.max(1, fit) : 0);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [key, total]);

  const shown = skills.slice(0, visible);
  const hidden = total - shown.length;

  return (
    <div ref={wrapRef} className="relative w-0 min-w-full overflow-hidden" title={skills.join(', ')}>
      <div className="flex items-center gap-1.5 overflow-hidden">
        {shown.map((s, i) => (
          <span key={`${s}-${i}`} className={`${CHIP} min-w-0 truncate`}>{render ? render(s) : s}</span>
        ))}
        {hidden > 0 && <span className="shrink-0 whitespace-nowrap text-xs font-medium text-ink/50">+{hidden} more</span>}
      </div>
      <div ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 flex gap-1.5">
        {skills.map((s, i) => (
          <span key={`${s}-${i}`} className={CHIP}>{s}</span>
        ))}
        <span className="whitespace-nowrap text-xs font-medium">+{total} more</span>
      </div>
    </div>
  );
}
