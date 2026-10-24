import { ArrowLeft } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';

interface BackRowProps {
  onBack?: () => void;
  /** Where the arrow goes, for screen readers and the tooltip. */
  label?: string;
  /** Optional plain text beside the arrow (the post or round being viewed). */
  title?: string;
  className?: string;
}

/** A back arrow with an optional plain title - no banner - for tabs that drill into a post. */
export default function BackRow({ onBack, label = 'Back', title, className = '' }: BackRowProps) {
  const skin = useSkin();
  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={onBack}
        title={label}
        aria-label={label}
        className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} rounded-lg cursor-pointer transition-colors duration-200 hover:border-ink/40 hover:text-ink ${FOCUS}`}
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
      </button>
      {title && <h2 className={`${skin.cardTitle} min-w-0 truncate`}>{title}</h2>}
    </div>
  );
}
