/** A Firestore Timestamp, a Date, or anything Date can parse. */
type Timeish = { toDate: () => Date } | Date | string | number | null | undefined;

function toDate(value: Timeish): Date | null {
    if (!value) return null;
    if (typeof value === 'object' && !(value instanceof Date) && 'toDate' in value) {
        return value.toDate();
    }
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** "Just now" / "4m ago" / "3h ago" / "2d ago" / locale date. */
export function timeAgo(date: Timeish): string {
    const d = toDate(date);
    if (!d) return 'Recently';

    const diffInSeconds = Math.floor((Date.now() - d.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return d.toLocaleDateString();
}
