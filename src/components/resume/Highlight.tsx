import { Fragment } from 'react';

/** Wraps every match of `regex` (one capture group, case-insensitive) in a <mark>. */
export default function Highlight({ text, regex }: { text: string; regex: RegExp | null }) {
    if (typeof text !== 'string') text = text === undefined || text === null ? '' : String(text);
    if (!regex || !text) return <>{text}</>;
    // split() with a capture group puts the matches at the odd indices.
    const parts = text.split(regex);
    return (
        <>
            {parts.map((part, i) =>
                i % 2 === 1 ? (
                    <mark key={i} className="rounded-sm bg-brand/30 px-0.5 font-semibold text-ink">
                        {part}
                    </mark>
                ) : (
                    <Fragment key={i}>{part}</Fragment>
                )
            )}
        </>
    );
}
