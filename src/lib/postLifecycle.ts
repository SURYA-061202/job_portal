import type { PostStatus, RecruitmentRequest } from '@/types';

/**
 * Job post lifecycle - the pure rules, no Firestore. The writes live in
 * lib/postActions.ts.
 *
 *   active --pause--> paused --resume--> active
 *   active --time--> expired --repost--> active
 *   active|paused --close--> closed --repost--> active
 *   active --extend--> active (expiry pushed out)
 *
 * A post is OPEN (visible to job seekers, accepts applications) only while it
 * is active and before its expiry. Paused, expired and closed posts keep every
 * application they already have; they just stop taking new ones.
 *
 * Posts created before this existed have no `status`/`expiresAt`: they are
 * active and never expire until the recruiter gives them a validity.
 *
 * `expired` is derived here from the clock as well as stored by the daily
 * sweep, so the UI is right the moment a post passes its date instead of
 * waiting for the next run.
 */

export const DEFAULT_VALIDITY_DAYS = 30;
export const VALIDITY_OPTIONS = [15, 30, 45, 60, 90] as const;
export const EXTEND_OPTIONS = [7, 15, 30] as const;
/** A post this close to its expiry is flagged "expiring soon". */
export const EXPIRING_SOON_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Firestore Timestamp | Date | ISO string | millis -> Date (null when absent or unparsable). */
export function toDate(value: unknown): Date | null {
    if (!value) return null;
    const v = value as { toDate?: () => Date; seconds?: number };
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(value as string | number | Date);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Calendar days from one moment to another in the viewer's time zone (an expiry later today is 0, any time tomorrow is 1). */
function calendarDaysBetween(from: number, to: number): number {
    const midnight = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    // round, not floor: a daylight-saving change makes a calendar day 23 or 25 hours long.
    return Math.round((midnight(to) - midnight(from)) / DAY_MS);
}

export interface PostLifecycle {
    /** Effective status: `active` becomes `expired` once the date has passed. */
    status: PostStatus;
    expiresAt: Date | null;
    /** Calendar days until expiry (0 = expires today, 1 = tomorrow); null with no expiry; negative once past. */
    daysLeft: number | null;
    expiringSoon: boolean;
    /** Visible to job seekers and open to new applications. */
    open: boolean;
    /** Holds one of the recruiter's plan slots (active or paused, not expired/closed). */
    live: boolean;
    label: string;
}

export const STATUS_LABEL: Record<PostStatus, string> = {
    draft: 'Draft',
    active: 'Active',
    paused: 'Paused',
    expired: 'Expired',
    closed: 'Closed',
};

type LifecycleFields = Pick<RecruitmentRequest, 'status' | 'expiresAt' | 'publishAt' | 'pausedReason'>;

export function getPostLifecycle(
    post: Partial<LifecycleFields>,
    now: number = Date.now(),
): PostLifecycle {
    const stored: PostStatus = post.status ?? 'active';
    // A draft has not started: any closing date on it is only the plan for later.
    if (stored === 'draft') {
        const goLive = toDate(post.publishAt);
        return {
            status: 'draft',
            expiresAt: null,
            daysLeft: null,
            expiringSoon: false,
            open: false,
            live: false,
            label: goLive && goLive.getTime() > now ? 'Scheduled' : 'Draft',
        };
    }
    const expiresAt = toDate(post.expiresAt);
    const pastDue = expiresAt !== null && expiresAt.getTime() <= now;
    // Paused clocks are frozen: a paused post is never "expired" by the date alone.
    const status: PostStatus = stored === 'active' && pastDue ? 'expired' : stored;

    const daysLeft = expiresAt === null ? null : calendarDaysBetween(now, expiresAt.getTime());
    const expiringSoon = status === 'active' && daysLeft !== null && daysLeft <= EXPIRING_SOON_DAYS;

    return {
        status,
        expiresAt,
        daysLeft,
        expiringSoon,
        open: status === 'active',
        live: status === 'active' || status === 'paused',
        label: status === 'paused' && post.pausedReason === 'cap' ? 'Cap reached' : STATUS_LABEL[status],
    };
}

/** Job-seeker side: should this post be listed and accept applications? */
export const isPostOpen = (post: Pick<RecruitmentRequest, 'status' | 'expiresAt'>): boolean => getPostLifecycle(post).open;

/** Recruiter side: does this post use one of the plan's post slots? */
export const isPostLive = (post: Pick<RecruitmentRequest, 'status' | 'expiresAt'>): boolean => getPostLifecycle(post).live;

/** "Expires in 12 days" / "Expires tomorrow" / "Expires today" / "Expired 3 days ago" / "No expiry". */
export function describeExpiry(post: Partial<LifecycleFields>, now: number = Date.now()): string {
    const lc = getPostLifecycle(post, now);
    if (lc.status === 'draft') {
        const goLive = toDate(post.publishAt);
        return goLive && goLive.getTime() > now ? `Goes live ${formatDateTime(goLive)}` : 'Draft - not published';
    }
    if (lc.status === 'paused' && post.pausedReason === 'cap') return 'Paused - application cap reached';
    if (lc.status === 'closed') return 'Closed by recruiter';
    if (lc.status === 'paused') return 'Paused - not visible to candidates';
    if (lc.expiresAt === null || lc.daysLeft === null) return 'No expiry';
    if (lc.status === 'expired') {
        const ago = -lc.daysLeft;
        return ago <= 0 ? 'Expired today' : `Expired ${ago} ${ago === 1 ? 'day' : 'days'} ago`;
    }
    if (lc.daysLeft <= 0) return 'Expires today';
    if (lc.daysLeft === 1) return 'Expires tomorrow';
    return `Expires in ${lc.daysLeft} days`;
}

/** A job seeker's "Closing soon" filter: open posts that close within this many days. */
export const CLOSING_SOON_DAYS = 7;

type Dated = Pick<RecruitmentRequest, 'status' | 'expiresAt'>;

/** When the listing last went live, in ms: a repost moves it forward, createdAt never changes. */
export const postedTime = (post: Pick<RecruitmentRequest, 'postedAt' | 'createdAt'>): number =>
    toDate(post.postedAt)?.getTime() ?? toDate(post.createdAt)?.getTime() ?? 0;

/** Open post that closes within `days` (today counts). */
export function isClosingSoon(post: Dated, days: number = CLOSING_SOON_DAYS): boolean {
    const lc = getPostLifecycle(post);
    return lc.open && lc.daysLeft !== null && lc.daysLeft <= days;
}

/** "in 5 days" / "tomorrow" / "today"; null when the post has no expiry or is not open. */
export function closingIn(post: Dated): string | null {
    const lc = getPostLifecycle(post);
    if (!lc.open || lc.daysLeft === null) return null;
    if (lc.daysLeft <= 0) return 'today';
    if (lc.daysLeft === 1) return 'tomorrow';
    return `in ${lc.daysLeft} days`;
}

/** Candidate wording: "Closes in 5 days" / "Closes tomorrow" / "Closes today"; null with no deadline. */
export function describeClosing(post: Dated): string | null {
    const when = closingIn(post);
    return when ? `Closes ${when}` : null;
}

/** "14 Dec 2026, 9:30 am". */
export const formatDateTime = (value: unknown): string => {
    const d = toDate(value);
    return d ? d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '-';
};

/** The last moment of the day in `yyyy-mm-dd` (an <input type="date"> value), local time. Null if unparsable. */
export function endOfDay(dateInput: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 0);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** Short date, e.g. "14 Dec 2026". */
export const formatDate = (value: unknown): string => {
    const d = toDate(value);
    return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
};

export const addDays = (from: Date | number, days: number): Date =>
    new Date((typeof from === 'number' ? from : from.getTime()) + days * DAY_MS);

/** Counts per effective status, plus how many active posts are about to expire. */
export function countByStatus(posts: Partial<LifecycleFields>[]) {
    const counts = { all: posts.length, draft: 0, active: 0, paused: 0, expired: 0, closed: 0, expiringSoon: 0 };
    for (const p of posts) {
        const lc = getPostLifecycle(p);
        counts[lc.status] += 1;
        if (lc.expiringSoon) counts.expiringSoon += 1;
    }
    return counts;
}
