import { Star } from 'lucide-react';
import { FOCUS } from '@/styles/skin';

interface StarRatingProps {
    /** 0 to 5; fractions fill part of a star. */
    value: number;
    /** Pass it to let people pick a rating; leave it out to just show one. */
    onChange?: (rating: number) => void;
    /** Tailwind size classes for each star. */
    size?: string;
    /** What is being rated, for screen readers. */
    label: string;
}

/** Five stars: a display when read-only, a picker when it has onChange. */
export default function StarRating({ value, onChange, size = 'h-4 w-4', label }: StarRatingProps) {
    return (
        <span className="inline-flex items-center gap-0.5" role={onChange ? 'radiogroup' : 'img'} aria-label={onChange ? label : `${label}: ${value.toFixed(1)} out of 5`}>
            {[1, 2, 3, 4, 5].map(n => {
                const fill = value >= n - 0.25 ? 'fill-amber-400 text-amber-400' : value >= n - 0.75 ? 'fill-amber-400/50 text-amber-400' : 'text-ink/25';
                const star = <Star className={`${size} ${fill}`} aria-hidden="true" />;
                return onChange ? (
                    <button key={n} type="button" role="radio" aria-checked={Math.round(value) === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => onChange(n)}
                        className={`cursor-pointer rounded p-0.5 transition-transform hover:scale-110 ${FOCUS}`}>{star}</button>
                ) : <span key={n}>{star}</span>;
            })}
        </span>
    );
}
