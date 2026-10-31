import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, Timestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { assessJob } from './jobMatch';
import { createNotification } from './notificationHelper';
import type { RecruitmentRequest } from '@/types';

/** A search a job seeker saved so new matching jobs reach them as notifications. */
export interface SavedSearch {
    id?: string;
    userId: string;
    name: string;
    /** Words that must all appear in the title, department, skills, company or description. */
    keywords: string;
    city: string;
    /** A job matches when it asks for at least one of these. */
    skills: string[];
    active: boolean;
    createdAt?: unknown;
    /** Only jobs posted after this are reported, so nothing is announced twice. */
    lastCheckedAt?: unknown;
}

export type SearchCriteria = Pick<SavedSearch, 'keywords' | 'city' | 'skills'>;

export const MAX_SAVED_SEARCHES = 10;
const CHECK_EVERY_MS = 90 * 1000;

const toMillis = (v: unknown): number => {
    if (!v) return 0;
    if (v instanceof Date) return v.getTime();
    const t = v as { toMillis?: () => number; seconds?: number };
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (typeof t.seconds === 'number') return t.seconds * 1000;
    return 0;
};

/** "civil engineer · Pune · AutoCAD, Revit" */
export const describeSearch = (s: SearchCriteria) =>
    [s.keywords.trim(), s.city.trim(), s.skills.join(', ')].filter(Boolean).join(' · ') || 'Any job';

export const searchName = (s: SearchCriteria) =>
    [s.keywords.trim(), s.city.trim() && `in ${s.city.trim()}`].filter(Boolean).join(' ') || s.skills.slice(0, 2).join(', ') || 'All jobs';

/**
 * Whether a post fits a saved search. Skills and city go through assessJob, the
 * same matcher the Recommendations tab uses, with the search standing in for a profile.
 */
export function matchesSearch(post: RecruitmentRequest, search: SearchCriteria): boolean {
    const terms = search.keywords.toLowerCase().split(/[\s,]+/).filter(t => t.length >= 2);
    if (terms.length) {
        const haystack = [post.jobTitle, post.department, post.skills, post.companyName, post.description].join(' ').toLowerCase();
        if (!terms.every(t => haystack.includes(t))) return false;
    }
    const city = search.city.trim();
    if (!city && search.skills.length === 0) return terms.length > 0;

    const fit = assessJob(post, { skills: search.skills, years: 99, address: city, role: '' });
    if (city && !fit.nearYou && !fit.remote) return false;
    if (search.skills.length && fit.matched.length === 0) return false;
    return true;
}

export async function listSavedSearches(userId: string): Promise<SavedSearch[]> {
    const snap = await getDocs(query(collection(db, 'saved_searches'), where('userId', '==', userId)));
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as SavedSearch)
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

export async function createSavedSearch(userId: string, criteria: SearchCriteria, name?: string): Promise<void> {
    const now = Timestamp.now();
    await addDoc(collection(db, 'saved_searches'), {
        userId,
        name: (name || '').trim() || searchName(criteria),
        keywords: criteria.keywords.trim(),
        city: criteria.city.trim(),
        skills: criteria.skills,
        active: true,
        createdAt: now,
        lastCheckedAt: now,
    });
}

export const setSavedSearchActive = (id: string, active: boolean) =>
    updateDoc(doc(db, 'saved_searches', id), { active, lastCheckedAt: Timestamp.now() });

export const deleteSavedSearch = (id: string) => deleteDoc(doc(db, 'saved_searches', id));

export async function listRecentPosts(): Promise<RecruitmentRequest[]> {
    const snap = await getDocs(query(collection(db, 'recruits'), orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }) as RecruitmentRequest);
}

/**
 * Looks for jobs posted since each saved search last ran and leaves one
 * notification per search that has new matches. Called when a job seeker opens
 * the app, at most every few minutes. Never throws.
 */
export async function checkJobAlerts(): Promise<void> {
    const user = auth.currentUser;
    if (!user?.email) return;
    const stampKey = `jobAlertsChecked:${user.uid}`;
    try {
        const last = Number(sessionStorage.getItem(stampKey) || 0);
        if (Date.now() - last < CHECK_EVERY_MS) return;
        sessionStorage.setItem(stampKey, String(Date.now()));
    } catch { /* storage unavailable: just check */ }

    try {
        const searches = (await listSavedSearches(user.uid)).filter(s => s.active);
        if (searches.length === 0) return;

        const since = (s: SavedSearch) => toMillis(s.lastCheckedAt) || toMillis(s.createdAt);
        const oldest = Math.min(...searches.map(since));
        const snap = await getDocs(query(collection(db, 'recruits'), where('createdAt', '>', Timestamp.fromMillis(oldest))));
        const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }) as RecruitmentRequest);

        for (const search of searches) {
            const fresh = posts.filter(p => toMillis(p.createdAt) > since(search) && matchesSearch(p, search));
            if (fresh.length > 0) {
                const titles = fresh.slice(0, 3).map(p => p.jobTitle).join(', ');
                await createNotification({
                    userId: user.email,
                    type: 'job_alert',
                    title: 'New jobs for your alert',
                    message: `${fresh.length} new ${fresh.length === 1 ? 'job matches' : 'jobs match'} "${search.name}": ${titles}${fresh.length > 3 ? ` and ${fresh.length - 3} more` : ''}.`,
                    metadata: { searchId: search.id, postIds: fresh.map(p => p.id) },
                });
            }
            await updateDoc(doc(db, 'saved_searches', search.id as string), { lastCheckedAt: Timestamp.now() });
        }
    } catch (err) {
        console.error('Failed to check job alerts:', err);
    }
}
