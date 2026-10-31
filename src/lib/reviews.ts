import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from './firebase';
import { getUserApplications } from './jobApplications';
import type { RecruitmentRequest } from '@/types';

/** URL-safe id for a company, derived from the name recruiters typed. */
export const companySlug = (name: string) =>
    name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The parts of a hiring process job seekers rate, each 1 to 5. */
export const RATING_ASPECTS = [
    { key: 'communication', label: 'Communication' },
    { key: 'clarity', label: 'Process clarity' },
    { key: 'interview', label: 'Interview experience' },
    { key: 'speed', label: 'Speed of response' },
    { key: 'respect', label: 'Respect for candidates' },
] as const;

export type AspectKey = (typeof RATING_ASPECTS)[number]['key'];

export const OUTCOMES = [
    { value: 'hired', label: 'I got the job' },
    { value: 'rejected', label: 'I was not selected' },
    { value: 'in-process', label: 'Still in process' },
    { value: 'withdrew', label: 'I withdrew' },
] as const;

export interface CompanyReview {
    id: string;
    companySlug: string;
    companyName: string;
    userId: string;
    /** A job at this company the reviewer applied to; the rules check the application exists. */
    postId: string;
    ratings: Record<AspectKey, number>;
    overall: number;
    comment: string;
    outcome: (typeof OUTCOMES)[number]['value'];
    anonymous: boolean;
    authorName: string;
    createdAt?: unknown;
    updatedAt?: unknown;
}

export const MAX_COMMENT = 1500;

export const reviewId = (slug: string, userId: string) => `${slug}_${userId}`;

export async function fetchCompanyReviews(slug: string): Promise<CompanyReview[]> {
    const snap = await getDocs(query(collection(db, 'company_reviews'), where('companySlug', '==', slug)));
    return snap.docs
        .map(d => ({ id: d.id, ...d.data() }) as CompanyReview)
        .sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
}

function ms(v: unknown): number {
    const t = v as { toMillis?: () => number } | null;
    return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
}

export interface ReviewSummary {
    count: number;
    overall: number;
    aspects: Record<AspectKey, number>;
}

export function summarize(reviews: CompanyReview[]): ReviewSummary {
    const avg = (pick: (r: CompanyReview) => number) =>
        reviews.length ? reviews.reduce((n, r) => n + pick(r), 0) / reviews.length : 0;
    const aspects = {} as Record<AspectKey, number>;
    for (const { key } of RATING_ASPECTS) aspects[key] = avg(r => r.ratings?.[key] ?? 0);
    return { count: reviews.length, overall: avg(r => r.overall), aspects };
}

export async function saveReview(review: Omit<CompanyReview, 'id' | 'createdAt' | 'updatedAt'>, isNew: boolean): Promise<void> {
    await setDoc(
        doc(db, 'company_reviews', reviewId(review.companySlug, review.userId)),
        { ...review, ...(isNew ? { createdAt: serverTimestamp() } : {}), updatedAt: serverTimestamp() },
        { merge: true },
    );
}

export const deleteReview = (slug: string, userId: string) => deleteDoc(doc(db, 'company_reviews', reviewId(slug, userId)));

/** The most recent job at this company the person applied to, or null when they never did. */
export async function findAppliedPostAt(slug: string, userId: string): Promise<RecruitmentRequest | null> {
    const apps = await getUserApplications(userId);
    const posts = await Promise.all(apps.map(async a => {
        try {
            const snap = await getDoc(doc(db, 'recruits', a.post_id));
            return snap.exists() ? ({ id: snap.id, ...snap.data() } as RecruitmentRequest) : null;
        } catch {
            return null;
        }
    }));
    return posts.find(p => p && companySlug(p.companyName || '') === slug) ?? null;
}
