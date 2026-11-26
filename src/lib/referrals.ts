import { doc, getDoc, increment, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from './firebase';
import type { ApplicationSource } from '@/types';

/**
 * Referral & sharing: a job seeker shares a post through a personal link
 * (`/job/{id}?ref={uid}`), the visitor's application is stamped with
 * `source: { type: 'referral', ... }`, and the recruiter can reward the referrer
 * with credit points (granted by the rewardReferral Cloud Function, which is the
 * only writer of `users/{uid}.bonusCredits`).
 *
 * Firestore:
 *   referrals/{postId}__{referrerUid}  — one doc per (post, sharer) share link
 *   job_applications/{postId}_{uid}.source — the acquisition source
 */

/** One shareable link instance: `${postId}__${referrerUid}`. */
export function referralDocId(postId: string, referrerUid: string): string {
    return `${postId}__${referrerUid}`;
}

/** The referral code is the sharer's uid: stable, collision-free and already known to the app. */
export const referralCodeFor = (uid: string): string => uid;

/** The tracked share URL for a post. */
export function buildJobShareUrl(jobId: string, code?: string | null): string {
    const base = `${window.location.origin}/job/${jobId}`;
    return code ? `${base}?ref=${encodeURIComponent(code)}` : base;
}

interface StoredAttribution {
    referrerUid: string;
    referrerName?: string;
    code: string;
    postId: string;
    at: string;
}

const attributionKey = (postId: string) => `iij-ref:${postId}`;

/**
 * Reads `?ref=` from the address bar and remembers it for the apply step.
 * Runs before the auth check on the job page, and sessionStorage survives the
 * redirect to the login screen, so the credit still lands on the application.
 */
export function captureReferralFromUrl(postId: string): void {
    if (!postId) return;
    try {
        const code = new URLSearchParams(window.location.search).get('ref')?.trim();
        if (!code) return;
        const attribution: StoredAttribution = {
            referrerUid: code,
            code,
            postId,
            at: new Date().toISOString(),
        };
        window.sessionStorage.setItem(attributionKey(postId), JSON.stringify(attribution));
    } catch {
        /* storage unavailable — the application simply won't be attributed */
    }
}

/** The remembered attribution for a post, without clearing it. */
export function getReferralAttribution(postId: string): StoredAttribution | null {
    if (!postId) return null;
    try {
        const raw = window.sessionStorage.getItem(attributionKey(postId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<StoredAttribution>;
        if (!parsed.referrerUid) return null;
        return {
            referrerUid: parsed.referrerUid,
            referrerName: parsed.referrerName,
            code: parsed.code || parsed.referrerUid,
            postId: parsed.postId || postId,
            at: parsed.at || new Date().toISOString(),
        };
    } catch {
        return null;
    }
}

/** Drops the remembered attribution once it has been used. */
export function clearReferralAttribution(postId: string): void {
    try {
        window.sessionStorage.removeItem(attributionKey(postId));
    } catch {
        /* ignore */
    }
}

/** Display name of the signed-in sharer, for the referral doc and the recruiter's badge. */
async function ownDisplayName(uid: string): Promise<string> {
    try {
        const snap = await getDoc(doc(db, 'users', uid));
        if (snap.exists()) {
            const d = snap.data();
            return `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.name || '';
        }
    } catch (err) {
        console.warn('Could not read profile for referral name:', err);
    }
    return '';
}

/**
 * Records that the signed-in user shared this post. Called from an explicit
 * share action (copy / native share) so the counter tracks real shares.
 * Never throws — a tracking failure must not break sharing.
 */
export async function recordJobShare(postId: string, postTitle?: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !postId) return;
    try {
        const ref = doc(db, 'referrals', referralDocId(postId, user.uid));
        const existing = await getDoc(ref);
        const referrerName = (existing.exists() ? String(existing.data()?.referrerName || '') : '') || await ownDisplayName(user.uid);
        await setDoc(
            ref,
            {
                postId,
                ...(postTitle ? { postTitle } : {}),
                referrerUid: user.uid,
                ...(referrerName ? { referrerName } : {}),
                code: referralCodeFor(user.uid),
                shares: increment(1),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            },
            { merge: true }
        );
    } catch (err) {
        console.warn('Could not record job share:', err);
    }
}

/**
 * Records that someone applied through a referral link: bumps the link's
 * conversion counter. Best-effort and never throws (the application itself has
 * already been written with `source` by then).
 */
export async function recordReferralConversion(
    postId: string,
    source: ApplicationSource,
    applicantUid: string,
    applicantName?: string
): Promise<void> {
    if (source.type !== 'referral' || !source.referrerUid || source.referrerUid === applicantUid) return;
    try {
        await updateDoc(doc(db, 'referrals', referralDocId(postId, source.referrerUid)), {
            applications: increment(1),
            lastApplicant: {
                uid: applicantUid,
                ...(applicantName ? { name: applicantName } : {}),
                at: new Date().toISOString(),
            },
            updatedAt: serverTimestamp(),
        });
    } catch (err) {
        // The link doc may not exist yet (shared before this feature, or a
        // direct ?ref= URL nobody shared from the UI) — attribution still lives
        // on the application document, so this is safe to ignore.
        console.warn('Could not record referral conversion:', err);
    }
}

const rewardReferralFn = httpsCallable<
    { postId: string; applicantUid: string; referrerUid: string; points: number; note?: string },
    { success: boolean; points: number }
>(functions, 'rewardReferral');

/**
 * Lets a recruiter reward the person who referred a candidate: adds `points` to
 * the referrer's credit balance (bonusCredits) and notifies them. The Cloud
 * Function validates that the application really carries this referral source.
 */
export async function rewardReferral(params: {
    postId: string;
    applicantUid: string;
    referrerUid: string;
    points: number;
    note?: string;
}): Promise<{ points: number }> {
    const result = await rewardReferralFn(params);
    return result.data;
}

/** Badge for "source: referral" on a candidate/application row. */
export function referralSourceBadge(source?: ApplicationSource | null): { label: string; title: string; className: string } | null {
    if (!source || source.type !== 'referral') return null;
    const by = source.referrerName || 'another user';
    return {
        label: 'Referral',
        title: `Referred by ${by} through a shared job link`,
        className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    };
}
