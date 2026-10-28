import BackRow from '@/components/layout/BackRow';
import type { Candidate } from '@/types';
import React, { useMemo, useState } from 'react';
import { Trash2, Loader2, Search, Mail, Phone, User, ChevronDown } from 'lucide-react';
import { deleteDoc, doc } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref, deleteObject } from 'firebase/storage';
import { usePopup } from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

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
    return cleanExp.length > 20 ? `${cleanExp.substring(0, 17)}...` : cleanExp;
  }

  // If it looks like a pure number (e.g. "2.5", "3"), append " Years"
  if (/^[\d.]+$/.test(cleanExp)) {
    return `${cleanExp} Years`;
  }

  // Otherwise return as is, truncated
  return cleanExp.length > 20 ? `${cleanExp.substring(0, 17)}...` : cleanExp;
}

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
}

interface CandidateListProps {
  candidates: Candidate[];
  onSelectCandidate?: (candidate: Candidate) => void;
  loading: boolean;
  searchTerm?: string;
  onSearchTermChange?: (term: string) => void;
  emptyMessage?: string;
  onRefresh?: () => void;
  onEdit?: (candidate: Candidate) => void;
  title?: string;
  /** Optional description line rendered under the header title row. */
  description?: string;
  filterValue?: string;
  filterOptions?: { value: string; label: string }[];
  onFilterChange?: (value: string) => void;
  jobId?: string | null;  // For specific ranking display
  /** When set, a back arrow is rendered inside the list header. */
  onBack?: () => void;
  /** Hides the role line under each name (and the "/ Role" column label). */
  hideRole?: boolean;
  /** Hides the illustration icon in the empty state message. */
  hideEmptyIcon?: boolean;
  /** Tailwind width class for the search field (applied at sm+; full width below). */
  searchWidth?: string;
  /** Post title per post id — adds a "Post" column to the table when provided. */
  postTitles?: Record<string, string>;
  /** Extra per-row actions rendered in the Actions column, before the delete button. */
  extraActions?: (candidate: Candidate) => React.ReactNode;
  /** Fill the height the parent gives it and scroll only the table (header row included). */
  fillHeight?: boolean;
}

export default function CandidateList({
  candidates,
  onSelectCandidate,
  loading,
  searchTerm = '',
  onSearchTermChange,
  emptyMessage,
  onRefresh,
  hideHeader = false,
  filterValue,
  filterOptions,
  onFilterChange,
  onBack,
  hideRole = false,
  hideEmptyIcon = false,
  searchWidth = 'sm:w-72',
  postTitles,
  extraActions,
  fillHeight = false
}: CandidateListProps & { hideHeader?: boolean }) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { showSuccess, showError } = usePopup();
  const skin = useSkin();

  const handleRemove = async (e: React.MouseEvent, candidate: Candidate) => {
    e.stopPropagation();
    setDeletingId(candidate.id);
    try {
      // 1. Delete from Firestore
      await deleteDoc(doc(db, 'candidates', candidate.id));

      // 2. Delete resume from Firebase Storage if exists
      if (candidate.resumeUrl) {
        const match = candidate.resumeUrl.match(/resumes\/([^/?#]+)/);
        const fileName = match ? match[1] : null;
        if (fileName) {
          const fileRef = ref(storage, `resumes/${fileName}`);
          await deleteObject(fileRef).catch(() => {});
        }
      }

      showSuccess('Candidate removed successfully');
      onRefresh?.();
    } catch (error: any) {
      console.error('Error removing candidate:', error);
      showError('Failed to remove candidate');
    } finally {
      setDeletingId(null);
    }
  };

  // Memoised filtered list
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => candidateMatchesSearch(c, searchTerm, postTitles));
  }, [candidates, searchTerm, postTitles]);

  return (
    <div className={`space-y-4 flex flex-col flex-1${fillHeight ? ' min-h-0' : ''}`}>
      {!hideHeader && onBack && <BackRow onBack={onBack} label="Back to posts" className="shrink-0" />}

      {/* Controls row below the header: search at the left end; the candidate
          count followed by the filter dropdown at the right. */}
      {!hideHeader && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className={`relative w-full ${searchWidth}`}>
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-ink/40" />
            </div>
            <input
              type="text"
              placeholder="Search candidates..."
              className={`block w-full h-9 pl-10 pr-3 sm:text-sm rounded-lg ${skin.field} ${FOCUS}`}
              value={searchTerm}
              onChange={(e) => onSearchTermChange?.(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span role="status" aria-atomic="true" className={`inline-flex h-9 min-w-24 shrink-0 items-center justify-center gap-1.5 ${skin.count} rounded-lg`}>
              {searchTerm
                ? `${filteredCandidates.length} of ${candidates.length} ${candidates.length === 1 ? 'Candidate' : 'Candidates'}`
                : `${candidates.length} ${candidates.length === 1 ? 'Candidate' : 'Candidates'}`}
            </span>

            {filterOptions && onFilterChange && (
              <div className="relative">
                <select
                  value={filterValue}
                  onChange={(e) => onFilterChange(e.target.value)}
                  className={`cursor-pointer appearance-none h-9 pl-3 pr-8 w-52 rounded-lg ${skin.field} ${FOCUS}`}
                >
                  {filterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 ${skin.subtle}`}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Body - white results panel wrapping the grey list, the same
          grey-on-white treatment as the other modules; consumers that pass
          hideHeader bring their own panel around the list. The panel grows
          with the flex chain while loading so the skeleton fills the body. */}
      <div className={hideHeader ? 'flex-1 min-h-0 flex flex-col' : `border ${skin.edge} ${skin.resultsPanel} ${skin.radius} p-3 md:p-4${loading || candidates.length === 0 ? ' flex-1 min-h-0 flex flex-col' : ''}`}>
      {loading ? (
        <div role="status" aria-busy="true" className={`flex-1 min-h-[320px] flex flex-col border ${skin.edge} ${skin.cardSurface} ${skin.radius} overflow-hidden transition-colors duration-200 ${skin.cardHover}`}>
          <span className="sr-only">Loading candidates…</span>
          <div className="flex-1 p-6 flex flex-col justify-between">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} aria-hidden="true" className="flex items-center space-x-4 animate-pulse">
                <div className={`h-10 w-10 ${skin.skeleton} rounded-full`}></div>
                <div className="flex-1 space-y-2">
                  <div className={`h-4 ${skin.skeleton} rounded w-1/4`}></div>
                  <div className={`h-3 ${skin.skeleton} rounded w-1/3`}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : candidates.length === 0 ? (
        <div className={`flex-1 min-h-[320px] flex items-center justify-center border ${skin.edge} ${skin.cardSurface} ${skin.radius} p-12 text-center transition-colors duration-200 ${skin.cardHover}`}>
          <div>
            {!hideEmptyIcon && (
              <div className="mx-auto h-12 w-12 text-ink/30 mb-4">
                <User className="h-full w-full" />
              </div>
            )}
            <h3 className={skin.emptyTitle}>No candidates found</h3>
            <p className={`mt-1 ${skin.body}`}>{emptyMessage || 'Upload a resume to get started.'}</p>
          </div>
        </div>
      ) : filteredCandidates.length === 0 && searchTerm ? (
        <div className={`flex-1 min-h-[320px] flex items-center justify-center border ${skin.edge} ${skin.cardSurface} ${skin.radius} p-12 text-center transition-colors duration-200 ${skin.cardHover}`}>
          <p className={skin.body}>No candidates match your search.</p>
        </div>
      ) : (
      <div className={`border ${skin.edge} ${skin.cardSurface} ${skin.radius} overflow-hidden transition-colors duration-200 ${skin.cardHover}${fillHeight ? ' flex-1 min-h-0 flex flex-col' : ''}`}>
        <div className={fillHeight ? 'flex-1 min-h-0 overflow-y-auto custom-scrollbar' : 'overflow-y-auto custom-scrollbar'} style={fillHeight ? undefined : { maxHeight: 'calc(100vh - 160px)' }}>
          <table className={`min-w-full divide-y ${skin.divide}`}>
            <thead className={fillHeight ? 'bg-ink/5' : 'bg-ink/5 sticky top-0 z-10'}>
              <tr>
                <th scope="col" className={`px-6 py-4 text-left ${skin.micro}`}>{hideRole ? 'Name' : 'Name / Role'}</th>
                <th scope="col" className={`px-6 py-4 text-left ${skin.micro}`}>Contact Info</th>
                <th scope="col" className={`px-6 py-4 text-left ${skin.micro}`}>Experience</th>
                {postTitles && (
                  <th scope="col" className={`px-6 py-4 text-left ${skin.micro}`}>Post</th>
                )}
                <th scope="col" className={`px-6 py-4 text-center ${skin.micro}`}>Actions</th>
              </tr>
            </thead>
            <tbody className={`${skin.cardSurface} divide-y ${skin.divide}`}>
              {filteredCandidates.map((candidate) => {
                const postId = (candidate as { postId?: string }).postId;
                return (
                  <tr
                    key={candidate.id}
                    className={`group ${skin.rowHover} transition-colors duration-150${onSelectCandidate ? ' cursor-pointer' : ''}`}
                    onClick={onSelectCandidate ? () => onSelectCandidate(candidate) : undefined}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-brand/20 text-brand flex items-center justify-center text-sm font-bold shadow-sm">
                            {candidate.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-ink group-hover:text-ink transition-colors">
                            {toTitleCase(candidate.name)}
                          </div>
                          {!hideRole && (
                            <div className={`mt-0.5 max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap ${skin.meta}`} title={toTitleCase(candidate.role) || 'No Role'}>
                              {toTitleCase(candidate.role) || 'No Role'}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center text-sm text-ink/70">
                          <Mail className="w-3.5 h-3.5 mr-2 text-ink/40" />
                          {candidate.email}
                        </div>
                        <div className="flex items-center text-sm text-ink/70">
                          <Phone className="w-3.5 h-3.5 mr-2 text-ink/40" />
                          {candidate.phone || 'N/A'}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium ${skin.surface} text-ink/70 border ${skin.edge} max-w-[150px] truncate`} title={candidate.experience}>
                        {formatExperience(candidate.experience)}
                      </span>
                    </td>
                    {postTitles && (
                      <td className="px-6 py-4">
                        <div className="text-sm text-ink/70 max-w-[200px] truncate" title={postId ? (postTitles[postId] || '') : ''}>
                          {(postId && postTitles[postId]) || '-'}
                        </div>
                      </td>
                    )}
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex items-center justify-center gap-2 transition-opacity">
                        {extraActions?.(candidate)}
                        <button
                          onClick={(e) => handleRemove(e, candidate)}
                          disabled={deletingId === candidate.id}
                          className={`p-2 border border-destructive bg-surface text-destructive ${skin.radius} hover:bg-destructive/10 cursor-pointer transition-colors duration-200 ${FOCUS}`}
                          title="Remove Candidate"
                        >
                          {deletingId === candidate.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-destructive" />
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
      </div>
      )}
      </div>
    </div>
  );
}