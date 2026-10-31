import { useEffect } from 'react';
import { collection, doc, getDoc, getDocs, increment, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db } from './firebase';

/** One recruiter's activity on one job seeker's profile (a single document per pair). */
export interface ProfileActivity {
    id: string;
    candidateId: string;
    viewerId: string;
    viewerName: string;
    companyName: string;
    lastViewedAt?: unknown;
    viewCount?: number;
    lastInvitedAt?: unknown;
    inviteRole?: string;
    inviteCount?: number;
}

const RECORD_EVERY_MS = 30 * 60 * 1000;
/** "recruiterId:candidateId" -> when it was last recorded, so reopening a profile doesn't inflate the count. */
const recentViews = new Map<string, number>();

export const toMillis = (v: unknown): number => {
    if (!v) return 0;
    if (v instanceof Date) return v.getTime();
    const t = v as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.seconds === 'number') return t.seconds * 1000;
    return 0;
};

/** When the latest thing happened: a view or an invite. */
export const lastActivityAt = (a: ProfileActivity) => Math.max(toMillis(a.lastViewedAt), toMillis(a.lastInvitedAt));

let viewer: { name: string; companyName: string } | null = null;

async function viewerInfo(uid: string) {
    if (viewer) return viewer;
    const snap = await getDoc(doc(db, 'users', uid));
    const d = snap.exists() ? snap.data() : {};
    viewer = {
        name: `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'A recruiter',
        companyName: String(d.companyName || ''),
    };
    return viewer;
}

const activityRef = (candidateId: string, viewerId: string) => doc(db, 'profile_views', `${candidateId}_${viewerId}`);

/**
 * Notes that the signed-in recruiter opened a candidate's profile. Only people
 * with a job seeker account can see it, so uploaded resumes are skipped. Opening
 * the same profile again within half an hour counts once. Never throws.
 */
export async function recordProfileView(candidateId: string): Promise<void> {
    const me = auth.currentUser;
    if (!me || !candidateId || me.uid === candidateId) {
        console.info('[profile-view] skipped: no signed-in viewer, or viewing own profile', { signedIn: !!me, candidateId });
        return;
    }
    // Kept in memory (not sessionStorage) so a stale stamp from an earlier failed
    // attempt can never block recording after a reload.
    const stampKey = `${me.uid}:${candidateId}`;
    if (Date.now() - (recentViews.get(stampKey) ?? 0) < RECORD_EVERY_MS) {
        console.info('[profile-view] skipped: already recorded in the last 30 minutes', candidateId);
        return;
    }
    recentViews.set(stampKey, Date.now());
    try {
        console.info('[profile-view] checking candidate', candidateId);
        const target = await getDoc(doc(db, 'users', candidateId));
        if (!target.exists() || target.data().role !== 'user') {
            console.info('[profile-view] skipped: not a job seeker account', { exists: target.exists(), role: target.data()?.role });
            return;
        }
        const info = await viewerInfo(me.uid);
        console.info('[profile-view] saving', `profile_views/${candidateId}_${me.uid}`);
        await setDoc(activityRef(candidateId, me.uid), {
            candidateId,
            viewerId: me.uid,
            viewerName: info.name,
            companyName: info.companyName,
            lastViewedAt: serverTimestamp(),
            viewCount: increment(1),
        }, { merge: true });
        console.info('[profile-view] saved');
    } catch (err) {
        recentViews.delete(stampKey); // let the next open try again
        console.error('Could not record profile view:', err);
    }
}

/** Records that the recruiter looking at this screen opened the candidate's profile. */
export function useRecordProfileView(candidateId?: string | null) {
    useEffect(() => {
        if (candidateId) void recordProfileView(candidateId);
    }, [candidateId]);
}

/** Notes that the signed-in recruiter invited a candidate to interview. Never throws. */
export async function recordProfileInvite(candidateId: string, role: string): Promise<void> {
    const me = auth.currentUser;
    if (!me || !candidateId) return;
    try {
        const info = await viewerInfo(me.uid);
        await setDoc(activityRef(candidateId, me.uid), {
            candidateId,
            viewerId: me.uid,
            viewerName: info.name,
            companyName: info.companyName,
            lastInvitedAt: serverTimestamp(),
            inviteRole: role,
            inviteCount: increment(1),
        }, { merge: true });
    } catch (err) {
        console.error('Could not record profile invite:', err);
    }
}

/** Everyone who viewed or invited this job seeker, most recent first. */
export async function listProfileActivity(userId: string): Promise<ProfileActivity[]> {
    const snap = await getDocs(query(collection(db, 'profile_views'), where('candidateId', '==', userId)));
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as ProfileActivity)
        .sort((a, b) => lastActivityAt(b) - lastActivityAt(a));
}

/** Whether recruiters can find this job seeker in candidate search. On unless turned off. */
export const setSearchable = (userId: string, searchable: boolean) =>
    updateDoc(doc(db, 'users', userId), { searchable });

/** "5m ago", "3h ago", "2d ago", or a date for anything older than a month. */
export function timeAgo(ms: number): string {
    if (!ms) return '';
    const diff = Date.now() - ms;
    const min = Math.floor(diff / 60_000);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d ago`;
    return new Date(ms).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
