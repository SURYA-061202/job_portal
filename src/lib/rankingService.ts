import { db } from './firebase';
import openai from './openai';
import { doc, updateDoc, Timestamp, getDoc } from 'firebase/firestore';
import type { Candidate, RecruitmentRequest } from '@/types';
import { supabase } from './supabase';

export async function rankCandidatesForJob(jobId: string) {
    try {
        // 1. Fetch the Job Description
        const jobDoc = await getDoc(doc(db, 'recruits', jobId));
        if (!jobDoc.exists()) throw new Error('Job not found');
        const jobData = jobDoc.data() as RecruitmentRequest;

        // Construct JD text
        const jdText = `
      Title: ${jobData.jobTitle}
      Role: ${jobData.department}
      Level: ${jobData.positionLevel}
      Skills Required: ${jobData.skills}
      Experience Required: ${jobData.yearsExperience}
      Qualification: ${jobData.qualification}
      Description: ${jobData.description || 'N/A'}
    `;

        // 2. Fetch Applicants for this Job
        // First get the user_ids from supabase job_applications table
        const { data: apps, error: appsError } = await supabase
            .from('job_applications')
            .select('user_id')
            .eq('post_id', jobId);

        if (appsError) throw appsError;
        if (!apps || apps.length === 0) return { success: true, message: 'No applicants to rank', count: 0 };

        const userIds = apps.map(a => (a as any).user_id);

        let processedCount = 0;

        // 3. Process each candidate
        // Note: In a real batch job, we might do this in chunks or a background function.
        // Here we do it sequentially or in small parallel batches.
        for (const userId of userIds) {
            if (!userId) continue;

            const candidateRef = doc(db, 'users', userId);
            const candidateSnap = await getDoc(candidateRef);

            if (!candidateSnap.exists()) continue;
            const candidate = candidateSnap.data() as Candidate;

            // Skip if already ranked (optional check, currently we force re-rank if called, or we could add a flag)
            // For now, let's just rank everyone to "refresh" or "fill" the data.

            // Construct Candidate Profile from Extracted Data or basic fields
            const candidateText = `
           Name: ${candidate.name}
           Current Role: ${candidate.role}
           Experience: ${candidate.experience}
           Skills: ${candidate.skills?.join(', ') || ''}
           
           Extracted Resume Data:
           Summary: ${candidate.extractedData?.summary || ''}
           Work Experience: ${JSON.stringify(candidate.extractedData?.workExperience || [])}
           Projects: ${JSON.stringify(candidate.extractedData?.projects || [])}
           Education: ${JSON.stringify(candidate.extractedData?.education || [])}
        `;

            // 4. Call OpenAI
            try {
                const prompt = `
            You are an expert HR recruiter.
            Evaluate the following Candidate against the Job Description.

            JOB DESCRIPTION:
            ${jdText}

            CANDIDATE PROFILE:
            ${candidateText}

            Verify the candidate's skills, experience years, and qualifications match the JD.
            Data might be unstructured.

            Output strictly in JSON format:
            {
               "score": <number 0-100>,
               "reasoning": "<short concise justification 1-2 sentences>"
            }
            `;

                const completion = await openai.chat.completions.create({
                    messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: prompt }],
                    model: "gpt-4o",
                    response_format: { type: "json_object" },
                });

                const content = completion.choices[0].message.content;
                if (content) {
                    const result = JSON.parse(content);

                    // 5. Update Firestore
                    // We store it in a 'rankings' map keyed by jobId
                    // Note: Firestore field paths with dots need special handling or we use the map syntax explicitly if updating just one field.
                    // Using dot notation for nested fields update:

                    await updateDoc(candidateRef, {
                        [`rankings.${jobId}`]: {
                            score: result.score,
                            reasoning: result.reasoning,
                            updatedAt: Timestamp.now()
                        }
                    });
                    processedCount++;
                }

            } catch (err) {
                console.error(`Error ranking candidate ${userId}:`, err);
            }
        }

        return { success: true, count: processedCount };

    } catch (error) {
        console.error('Ranking Error:', error);
        throw error;
    }
}
