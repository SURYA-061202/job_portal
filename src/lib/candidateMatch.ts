import type { Candidate, WorkExperience } from '@/types';

// Helper to decide if a candidate matches the current search term
export function candidateMatchesSearch(candidate: Candidate, term: string, postTitles?: Record<string, string>) {
  if (!term) return true;
  const q = term.toLowerCase();

  // Collect searchable strings
  const tokens: string[] = [];

  // Include name and role as searchable fields
  if (candidate.name) tokens.push(candidate.name);
  if (candidate.role) tokens.push(candidate.role);
  if (candidate.experience) tokens.push(candidate.experience);
  if (candidate.email) tokens.push(candidate.email);

  // Include the post title when a post map is provided (Selected Candidates)
  const postId = (candidate as { postId?: string }).postId;
  if (postTitles && postId && postTitles[postId]) tokens.push(postTitles[postId]);

  // Treat "place" as company/institution names in work experience & education
  (candidate.extractedData?.workExperience || []).forEach((we: WorkExperience & { location?: string }) => {
    if (we.company) tokens.push(we.company);
    if (we.location) tokens.push(we.location);
    if (we.position) tokens.push(we.position);
  });

  (candidate.education || []).forEach((edu) => {
    if (edu.institution) tokens.push(edu.institution);
    if (edu.field) tokens.push(edu.field);
  });

  return tokens.some((t) => t?.toLowerCase().includes(q));
}
