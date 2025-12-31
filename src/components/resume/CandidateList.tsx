import type { Candidate } from '@/types';
import { useMemo, useState } from 'react';
import { Trash2, Loader2, Search, Mail, Phone, User } from 'lucide-react';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';

// Helper to convert to Title Case
function toTitleCase(str?: string) {
  if (!str) return '';
  return str
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Helper to format experience string
function formatExperience(exp?: string) {
  if (!exp) return 'N/A';
  const cleanExp = exp.trim();

  // If it already contains "year", return as is (truncated if too long)
  if (cleanExp.toLowerCase().includes('year')) {
    return cleanExp.length > 30 ? `${cleanExp.substring(0, 30)}...` : cleanExp;
  }

  // If it looks like a pure number (e.g. "2.5", "3"), append " Years"
  if (/^[\d.]+$/.test(cleanExp)) {
    return `${cleanExp} Years`;
  }

  // Otherwise return as is, truncated
  return cleanExp.length > 30 ? `${cleanExp.substring(0, 30)}...` : cleanExp;
}



interface CandidateListProps {
  candidates: Candidate[];
  onSelectCandidate: (candidate: Candidate) => void;
  loading: boolean;
  searchTerm?: string;
  onSearchTermChange?: (term: string) => void;
  emptyMessage?: string;
  isRemoveMode?: boolean;
  onRefresh?: () => void;
  onEdit?: (candidate: Candidate) => void;
}

export default function CandidateList({
  candidates,
  onSelectCandidate,
  loading,
  searchTerm = '',
  onSearchTermChange,
  emptyMessage,
  isRemoveMode = false,
  onRefresh,
  onEdit,
  hideHeader = false
}: CandidateListProps & { hideHeader?: boolean }) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleRemove = async (e: React.MouseEvent, candidate: Candidate) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to remove ${candidate.name}?`)) return;

    setDeletingId(candidate.id);
    try {
      // 1. Delete from Firestore
      await deleteDoc(doc(db, 'candidates', candidate.id));

      // 2. Delete resume from Supabase if exists
      if (candidate.resumeUrl) {
        const url = candidate.resumeUrl;
        const fileName = url.split('/').pop()?.split('?')[0];
        if (fileName) {
          await supabase.storage.from('resumes').remove([fileName]);
        }
      }

      toast.success('Candidate removed successfully');
      onRefresh?.();
    } catch (error: any) {
      console.error('Error removing candidate:', error);
      toast.error('Failed to remove candidate');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (e: React.MouseEvent, candidate: Candidate) => {
    e.stopPropagation();
    if (onEdit) {
      onEdit(candidate);
    }
  };

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
    if (candidate.email) tokens.push(candidate.email);

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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center space-x-4 animate-pulse">
              <div className="h-10 w-10 bg-gray-100 rounded-full"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-100 rounded w-1/4"></div>
                <div className="h-3 bg-gray-100 rounded w-1/3"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
        <div className="mx-auto h-12 w-12 text-gray-300 mb-4">
          <User className="h-full w-full" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">No candidates found</h3>
        <p className="mt-1 text-gray-500">{emptyMessage || 'Upload a resume to get started.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Search */}
      {!hideHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            Candidates
            <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-700 border border-primary-100">
              {searchTerm ? `${filteredCandidates.length} found` : candidates.length}
            </span>
          </h3>

          <div className="relative w-full sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search candidates..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 sm:text-sm transition-all duration-200"
              value={searchTerm}
              onChange={(e) => onSearchTermChange?.(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50/50">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name / Role</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact Info</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Experience</th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">AI Score</th>
                <th scope="col" className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredCandidates.map((candidate) => {
                // Find latest rank score if available
                let aiScore = null;
                if (candidate.rankings) {
                  const keys = Object.keys(candidate.rankings);
                  if (keys.length > 0) {
                    aiScore = candidate.rankings[keys[0]].score;
                  }
                }

                return (
                  <tr
                    key={candidate.id}
                    className="group hover:bg-gray-50/80 transition-colors duration-150 cursor-pointer"
                    onClick={() => onSelectCandidate(candidate)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center text-sm font-bold shadow-sm">
                            {candidate.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
                            {toTitleCase(candidate.name)}
                          </div>
                          <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            {toTitleCase(candidate.role) || 'No Role'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center text-sm text-gray-600">
                          <Mail className="w-3.5 h-3.5 mr-2 text-gray-400" />
                          {candidate.email}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <Phone className="w-3.5 h-3.5 mr-2 text-gray-400" />
                          {candidate.phone || 'N/A'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200 max-w-[150px] truncate" title={candidate.experience}>
                        {formatExperience(candidate.experience)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {aiScore !== null ? (
                        <div className="flex items-center">
                          <div className={`flex-shrink-0 h-2 w-2 rounded-full mr-2 ${aiScore >= 80 ? 'bg-green-500' : aiScore >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                            }`}></div>
                          <span className={`text-sm font-semibold ${aiScore >= 80 ? 'text-green-700' : aiScore >= 50 ? 'text-yellow-700' : 'text-red-700'
                            }`}>
                            {aiScore}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex items-center justify-center gap-2 transition-opacity">
                        <button
                          onClick={(e) => handleRemove(e, candidate)}
                          disabled={deletingId === candidate.id}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Remove Candidate"
                        >
                          {deletingId === candidate.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredCandidates.length === 0 && searchTerm && (
          <div className="p-12 text-center">
            <p className="text-gray-500">No candidates match your search.</p>
          </div>
        )}
      </div>
    </div>
  );
} 