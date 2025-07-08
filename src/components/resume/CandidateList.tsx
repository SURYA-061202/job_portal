

import type { Candidate } from '@/types';
import { useMemo } from 'react';

interface CandidateListProps {
  candidates: Candidate[];
  onSelectCandidate: (candidate: Candidate) => void;
  loading: boolean;
  searchTerm?: string;
  onSearchTermChange?: (term: string) => void;
  emptyMessage?: string;
}

export default function CandidateList({ candidates, onSelectCandidate, loading, searchTerm = '', onSearchTermChange, emptyMessage }: CandidateListProps) {
  // Helper to decide if a candidate matches the current search term
  const candidateMatchesSearch = (candidate: Candidate, term: string) => {
    if (!term) return true;
    const q = term.toLowerCase();

    // Collect searchable strings
    const tokens: string[] = [];

    // Include name and role as searchable fields
    if (candidate.name) tokens.push(candidate.name);
    if (candidate.role) tokens.push(candidate.role);
    if (candidate.experience) tokens.push(candidate.experience);

    // Treat "place" as company/institution names in work experience & education
    (candidate.extractedData?.workExperience || []).forEach((we: any) => {
      if (we.company) tokens.push(we.company);
      if (we.location) tokens.push(we.location);
      if (we.position) tokens.push(we.position);
    });

    (candidate.education || []).forEach((edu: any) => {
      if (edu.institution) tokens.push(edu.institution);
      if (edu.field) tokens.push(edu.field);
    });

    return tokens.some((t) => t?.toLowerCase().includes(q));
  };

  // Memoised filtered list to avoid unnecessary recalculations
  const filteredCandidates = useMemo(
    () => candidates.filter((c) => candidateMatchesSearch(c, searchTerm)),
    [candidates, searchTerm]
  );

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-4">
              <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600 text-center">{emptyMessage || 'No candidates found. Upload a resume to get started.'}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header with title and search */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          Candidates{' '}
          {searchTerm && (
            <span>
              ({filteredCandidates.length}/{candidates.length})
            </span>
          )}
        </h3>

        {/* Search input aligned right */}
        <input
          type="text"
          placeholder="Search..."
          className="ml-auto w-full md:w-64 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          value={searchTerm}
          onChange={(e) => onSearchTermChange?.(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-center font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th scope="col" className="px-6 py-3 text-center font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th scope="col" className="px-6 py-3 text-center font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th scope="col" className="px-6 py-3 text-center font-medium text-gray-500 uppercase tracking-wider">Mobile</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredCandidates.map((candidate) => (
              <tr key={candidate.id} className="cursor-pointer hover:bg-primary-50" onClick={() => onSelectCandidate(candidate)}>
                <td className="px-6 py-4 whitespace-nowrap text-center text-gray-900">{candidate.name}</td>
                <td className="px-6 py-4 whitespace-nowrap text-center text-gray-500">{candidate.role}</td>
                <td className="px-6 py-4 whitespace-nowrap text-center text-gray-500">{candidate.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-center text-gray-500">{candidate.phone}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredCandidates.length === 0 && (
          <p className="text-center text-gray-600 py-6">No matching candidates found.</p>
        )}
      </div>
    </div>
  );
} 