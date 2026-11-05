import type { Candidate } from '@/types';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore';
import { clusterCandidatesOnServer } from './aiFunctions';

/** Groups candidates by similarity. Embeddings, k-means and labels run in the `clusterCandidates` Cloud Function. */
export async function clusterCandidates(candidates: Candidate[]) {
    if (candidates.length < 3) throw new Error('Need at least 3 candidates to cluster.');
    try {
        return await clusterCandidatesOnServer(
            candidates.map(c => ({
                id: c.id,
                role: c.role,
                skills: c.skills,
                experience: c.experience,
                summary: c.extractedData?.summary || '',
            }))
        );
    } catch (e) {
        console.error('Clustering Error:', e);
        throw new Error(`Clustering failed: ${(e as Error)?.message || 'unknown error'}`);
    }
}

export async function saveClusters(clusters: { id: number; label: string; candidateIds: string[] }[]) {
    try {
        const ref = collection(db, 'candidate_clusters');
        const q = query(ref);
        const snapshot = await getDocs(q);

        // Batch delete old (cleanup)
        const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);

        // Add new
        await addDoc(ref, {
            data: clusters,
            createdAt: Timestamp.now()
        });

        console.log("Clusters saved to database.");
    } catch (e) {
        console.error("Failed to save clusters:", e);
    }
}

export async function fetchClusters() {
    try {
        const ref = collection(db, 'candidate_clusters');
        const q = query(ref, orderBy('createdAt', 'desc')); // Get latest
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            return {
                clusters: data.data as { id: number; label: string; candidateIds: string[] }[],
                lastUpdated: data.createdAt?.toDate ? data.createdAt.toDate() : new Date()
            };
        }
        return { clusters: [], lastUpdated: null };
    } catch (e) {
        console.error("Failed to fetch clusters:", e);
        return { clusters: [], lastUpdated: null };
    }
}
