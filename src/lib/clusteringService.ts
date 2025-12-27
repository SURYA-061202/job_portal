import openai from './openai';
import type { Candidate } from '@/types';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, deleteDoc, query, orderBy, Timestamp } from 'firebase/firestore';

// Simple K-Means implementation
function kMeans(vectors: number[][], k: number, maxIterations = 20) {
    if (vectors.length < k) return Array(vectors.length).fill(0); // Not enough points

    // Initialize centroids randomly
    let centroids = vectors.slice(0, k);
    const assignments = new Array(vectors.length).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
        // Assign points to nearest centroid
        let changed = false;
        for (let i = 0; i < vectors.length; i++) {
            let minDist = Infinity;
            let cluster = 0;
            for (let j = 0; j < k; j++) {
                const dist = cosineDistance(vectors[i], centroids[j]);
                if (dist < minDist) {
                    minDist = dist;
                    cluster = j;
                }
            }
            if (assignments[i] !== cluster) {
                assignments[i] = cluster;
                changed = true;
            }
        }

        if (!changed) break;

        // specific check: avoid empty clusters if possible or just mitigate
        // Recompute centroids
        const newCentroids = Array(k).fill(0).map(() => Array(vectors[0].length).fill(0));
        const counts = Array(k).fill(0);

        for (let i = 0; i < vectors.length; i++) {
            const cluster = assignments[i];
            counts[cluster]++;
            for (let d = 0; d < vectors[0].length; d++) {
                newCentroids[cluster][d] += vectors[i][d];
            }
        }

        for (let j = 0; j < k; j++) {
            if (counts[j] > 0) {
                for (let d = 0; d < vectors[0].length; d++) {
                    newCentroids[j][d] /= counts[j];
                }
            } else {
                newCentroids[j] = vectors[Math.floor(Math.random() * vectors.length)];
            }
        }
        centroids = newCentroids;
    }

    return assignments;
}

// 1 - Cosine Similarity
function cosineDistance(a: number[], b: number[]) {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    return 1 - (dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1));
}

export async function clusterCandidates(candidates: Candidate[]) {
    try {
        if (candidates.length < 3) throw new Error("Need at least 3 candidates to cluster.");

        // 1. Prepare Text
        const inputs = candidates.map(c =>
            `Role: ${c.role || ''}, Skills: ${(c.skills || []).join(', ')}, Exp: ${c.experience || ''}, Summary: ${c.extractedData?.summary || ''}`
        );

        // 2. Generate Embeddings
        console.log("Generating embeddings for", inputs.length, "candidates...");
        const response = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: inputs,
        });

        const vectors = response.data.map(d => d.embedding);

        // 3. Cluster
        const k = Math.min(Math.max(3, Math.floor(Math.sqrt(candidates.length))), 6);
        console.log(`Clustering into ${k} groups...`);
        const assignments = kMeans(vectors, k);

        // 4. Group and Label
        const clusters: { id: number; label: string; candidateIds: string[] }[] = [];

        // Group
        const groups: Record<number, Candidate[]> = {};
        assignments.forEach((clusterIdx, i) => {
            if (!groups[clusterIdx]) groups[clusterIdx] = [];
            groups[clusterIdx].push(candidates[i]);
        });

        // Label each group
        for (const [key, group] of Object.entries(groups)) {
            const clusterId = parseInt(key);
            const profiles = group.slice(0, 5).map(c => `${c.role} (${c.skills?.slice(0, 3).join(',')})`).join('; ');
            const labelPrompt = `Analyze these job profiles: [${profiles}]. Give a single short descriptive label (MAX 3 words) for this group (e.g., "Frontend Developers", "Senior Managers"). Output only the label.`;

            try {
                const completion = await openai.chat.completions.create({
                    messages: [{ role: "user", content: labelPrompt }],
                    model: "gpt-4o-mini",
                });
                const label = completion.choices[0].message.content?.trim() || `Group ${clusterId + 1}`;
                clusters.push({
                    id: clusterId,
                    label: label.replace(/['"]/g, ''),
                    candidateIds: group.map(c => c.id)
                });
            } catch (e) {
                console.error("Labeling error:", e);
                clusters.push({
                    id: clusterId,
                    label: `Group ${clusterId + 1}`,
                    candidateIds: group.map(c => c.id)
                });
            }
        }

        return clusters;

    } catch (e: any) {
        console.error("Clustering Critical Error:", e);
        const msg = e?.response?.data?.error?.message || e?.error?.message || e.message || JSON.stringify(e);
        throw new Error(`Clustering failed: ${msg}`);
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
