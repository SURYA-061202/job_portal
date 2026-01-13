import openai, { isOpenAIConfigured } from './openai';
import type { Candidate } from '@/types';
import { db } from '@/lib/firebase';
import { doc, updateDoc, getDoc, Timestamp } from 'firebase/firestore';

export async function analyzeCandidateScores(
    candidates: Candidate[],
    jobDescription: string,
    jobId: string,
    jobTitle: string
): Promise<Candidate[]> {
    if (!isOpenAIConfigured()) {
        throw new Error("OpenAI API Key is missing. Please set VITE_OPENAI_API_KEY in your .env file.");
    }
    if (!candidates || candidates.length === 0) return [];
    if (!jobDescription) throw new Error("Job Description is required for analysis");

    console.log(`[AI Service] Analyzing ${candidates.length} candidates for Job: ${jobTitle} (${jobId})`);

    const updatedCandidates = await Promise.all(
        candidates.map(async (candidate) => {
            try {
                // 1. Check if score already exists for this job
                if (candidate.rankings && candidate.rankings[jobId]) {
                    console.log(`[AI Service] Skipping ${candidate.id} - already scored for ${jobId}`);
                    return candidate;
                }

                // Construct prompt
                const candidateProfile = `
                    Name: ${candidate.name}
                    Role: ${candidate.role}
                    Experience: ${candidate.experience}
                    Skills: ${candidate.skills?.join(', ')}
                    Summary: ${candidate.extractedData?.summary || ''}
                    Work History: ${candidate.extractedData?.workExperience?.map(w => `${w.position} at ${w.company}`).join('; ')}
                `;

                const prompt = `
                    You are an expert technical recruiter. Analyze the following candidate against the Job Description.
                    
                    JOB TITLE: ${jobTitle}
                    JOB DESCRIPTION:
                    ${jobDescription.substring(0, 2000)}... (truncated)

                    CANDIDATE PROFILE:
                    ${candidateProfile}

                    Provide a JSON response with:
                    - "score": integer 0-100 (Relevance match)
                    - "reasoning": string (1 concise sentence explaining the score)
                `;

                const completion = await openai.chat.completions.create({
                    messages: [
                        { role: "system", content: "You are a helpful assistant that outputs JSON only." },
                        { role: "user", content: prompt }
                    ],
                    model: "gpt-3.5-turbo", // Cost-effective for bulk
                    response_format: { type: "json_object" }
                });

                const content = completion.choices[0].message.content;
                if (!content) throw new Error("No response from AI");

                const result = JSON.parse(content);
                const score = typeof result.score === 'number' ? result.score : 0;
                const reasoning = result.reasoning || "Analyzed by AI";

                // Determine collection: 'candidates' vs 'users'
                let collectionName = 'candidates';
                let candidateRef = doc(db, 'candidates', candidate.id);
                let docSnap = await getDoc(candidateRef);

                if (!docSnap.exists()) {
                    // Try 'users' collection
                    candidateRef = doc(db, 'users', candidate.id);
                    docSnap = await getDoc(candidateRef);
                    if (docSnap.exists()) {
                        collectionName = 'users';
                    } else {
                        console.warn(`[AI Service] Candidate ${candidate.id} not found in 'candidates' or 'users'. Skipping update.`);
                        return candidate;
                    }
                }

                const rankingData = {
                    score,
                    reasoning,
                    updatedAt: Timestamp.now()
                };

                // Firestore update path: "rankings.jobId"
                await updateDoc(candidateRef, {
                    [`rankings.${jobId}`]: rankingData
                });

                console.log(`[AI Service] Updated score for ${candidate.name} in '${collectionName}'`);

                // Return updated candidate object locally
                return {
                    ...candidate,
                    rankings: {
                        ...candidate.rankings,
                        [jobId]: rankingData
                    }
                };

            } catch (error) {
                console.error(`[AI Service] Failed to score candidate ${candidate.id}:`, error);
                return candidate; // Return original if failed
            }
        })
    );

    return updatedCandidates;
}
