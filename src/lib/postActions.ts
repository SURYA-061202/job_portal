import { deleteField, doc, increment, Timestamp, updateDoc, type UpdateData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { addDays, getPostLifecycle, toDate, DEFAULT_VALIDITY_DAYS } from '@/lib/postLifecycle';
import type { PostCloseReason, RecruitmentRequest } from '@/types';

/**
 * Lifecycle writes for a job post (the rules are in lib/postLifecycle.ts).
 * Every function re-reads nothing: it works from the post the caller holds, so
 * callers refresh their list afterwards. Firestore rules still decide who may
 * write (the owner or an admin).
 *
 * There is no plan slot to fit into any more: posts are metered by credit
 * points when they are added (CREDIT_COST.post), not by a per-plan count.
 */

/** A rule of the lifecycle was not met; the message is safe to show the recruiter. */
export class PostActionError extends Error { }

const fail = (message: string): never => { throw new PostActionError(message); };

const requireId = (post: RecruitmentRequest): string => post.id ?? fail('This post has no id.');

/**
 * Lifecycle fields for a post going live now. `validity` is a number of days from
 * now, or the exact date it should close.
 */
export function newPostLifecycleFields(validity: number | Date = DEFAULT_VALIDITY_DAYS) {
    const now = Timestamp.now();
    const closes = typeof validity === 'number' ? addDays(now.toDate(), validity) : validity;
    return {
        status: 'active' as const,
        ...(typeof validity === 'number' ? { validityDays: validity } : {}),
        postedAt: now,
        expiresAt: Timestamp.fromDate(closes),
        repostCount: 0,
    };
}

/**
 * Lifecycle fields for a draft. `publishAt` makes it a scheduled post. A chosen
 * closing date is kept; otherwise the expiry is worked out from `validityDays`
 * when the post goes live. Drafts are not live, so they cost nothing extra.
 *
 * `forUpdate` adds deleteField() for anything left out, so editing a draft can
 * clear an old schedule or date (deleteField is not allowed on a new document).
 */
export function draftLifecycleFields(opts: { validityDays: number; closesOn?: Date | null; publishAt?: Date | null }, forUpdate = false) {
    const out: Record<string, unknown> = { status: 'draft', validityDays: opts.validityDays, repostCount: 0 };
    if (opts.closesOn) out.expiresAt = Timestamp.fromDate(opts.closesOn); else if (forUpdate) out.expiresAt = deleteField();
    if (opts.publishAt) out.publishAt = Timestamp.fromDate(opts.publishAt); else if (forUpdate) out.publishAt = deleteField();
    return out;
}

/** Put a draft live now (a scheduled one goes early). */
export async function publishPost(post: RecruitmentRequest): Promise<void> {
    const id = requireId(post);
    if (post.status !== 'draft') fail('Only a draft can be published.');
    const now = Timestamp.now();
    const planned = toDate(post.expiresAt);
    const closes = planned && planned.getTime() > now.toMillis() ? planned : addDays(now.toDate(), post.validityDays ?? DEFAULT_VALIDITY_DAYS);
    await updateDoc(doc(db, 'recruits', id), {
        status: 'active',
        postedAt: now,
        expiresAt: Timestamp.fromDate(closes),
        publishAt: deleteField(),
    });
}

/** Set the exact day the post closes (end of that day). Active or paused posts only. */
export async function setPostExpiry(post: RecruitmentRequest, closesOn: Date): Promise<void> {
    const id = requireId(post);
    if (!getPostLifecycle(post).live) fail('Only an active or paused post can have its closing date changed. Repost it instead.');
    if (closesOn.getTime() <= Date.now()) fail('Pick a closing date in the future.');
    await updateDoc(doc(db, 'recruits', id), { expiresAt: Timestamp.fromDate(closesOn) });
}

/** Hide an active post from candidates without losing it. Its expiry clock stops until it is resumed. */
export async function pausePost(post: RecruitmentRequest): Promise<void> {
    const id = requireId(post);
    if (getPostLifecycle(post).status !== 'active') fail('Only an active post can be paused.');
    await updateDoc(doc(db, 'recruits', id), { status: 'paused', pausedAt: Timestamp.now(), pausedReason: deleteField() });
}

/** Back to active. The time spent paused is added to the expiry, so pausing never costs days. */
export async function resumePost(post: RecruitmentRequest): Promise<void> {
    const id = requireId(post);
    if (post.status !== 'paused') fail('Only a paused post can be resumed.');
    if (post.pausedReason === 'cap' && post.applicationCap && (post.applicantCount ?? 0) >= post.applicationCap) {
        fail(`This post stopped at its limit of ${post.applicationCap} applications. Edit it and raise or remove the cap, then resume.`);
    }
    const paused = toDate(post.pausedAt);
    const expires = toDate(post.expiresAt);
    const update: UpdateData<RecruitmentRequest> = { status: 'active', pausedAt: deleteField(), pausedReason: deleteField() };
    if (paused && expires) {
        const away = Math.max(0, Date.now() - paused.getTime());
        update.expiresAt = Timestamp.fromMillis(expires.getTime() + away);
    }
    await updateDoc(doc(db, 'recruits', id), update);
}

/** Push the expiry out by `days` (from the current expiry, or from today if it just lapsed). Active or paused posts only. */
export async function extendPost(post: RecruitmentRequest, days: number): Promise<void> {
    const id = requireId(post);
    const lc = getPostLifecycle(post);
    if (!lc.live) fail('Only an active or paused post can be extended. Repost it instead.');
    if (!lc.expiresAt) fail('This post has no expiry to extend.');
    if (!(days > 0)) fail('Choose how many days to add.');
    await updateDoc(doc(db, 'recruits', id), {
        expiresAt: Timestamp.fromDate(addDays(lc.expiresAt!, days)),
    });
}

/** Stop taking applications for good (until reposted). Existing applications are untouched. */
export async function closePost(post: RecruitmentRequest, reason: PostCloseReason): Promise<void> {
    const id = requireId(post);
    if (getPostLifecycle(post).status === 'closed') fail('This post is already closed.');
    await updateDoc(doc(db, 'recruits', id), {
        status: 'closed',
        closeReason: reason,
        closedAt: Timestamp.now(),
        pausedAt: deleteField(),
        pausedReason: deleteField(),
    });
}

/**
 * Run an expired or closed post again for `validityDays`. The post keeps its id,
 * applicants and history; it counts as a fresh listing from today.
 */
export async function repostPost(post: RecruitmentRequest, validity: number | Date): Promise<void> {
    const id = requireId(post);
    const status = getPostLifecycle(post).status;
    if (status !== 'expired' && status !== 'closed') fail('Only an expired or closed post can be reposted.');

    const now = Timestamp.now();
    if (validity instanceof Date && validity.getTime() <= now.toMillis()) fail('Pick a closing date in the future.');
    const closes = typeof validity === 'number' ? addDays(now.toDate(), validity) : validity;
    await updateDoc(doc(db, 'recruits', id), {
        status: 'active',
        ...(typeof validity === 'number' ? { validityDays: validity } : {}),
        postedAt: now,
        expiresAt: Timestamp.fromDate(closes),
        lastRepostedAt: now,
        repostCount: increment(1),
        closedAt: deleteField(),
        closeReason: deleteField(),
        expiredAt: deleteField(),
        pausedAt: deleteField(),
        pausedReason: deleteField(),
    });
}
