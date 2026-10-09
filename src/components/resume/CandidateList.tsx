import type { Candidate } from '@/types';
import React, { useMemo, useState } from 'react';
import { Trash2, Loader2, Search, Mail, Phone, User, ArrowLeft, ChevronDown } from 'lucide-react';
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

interface CandidateListProps {
  candidates: Candidate[];
  onSelectCandidate: (candidate: Candidate) => void;
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
  title,
  description,
  filterValue,
  filterOptions,
  onFilterChange,
  onBack,
  hideRole = false,
  hideEmptyIcon = false,
  searchWidth = 'sm:w-72'
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

  // Memoised filtered list
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => candidateMatchesSearch(c, searchTerm));
  }, [candidates, searchTerm]);

  return (
    <div className="space-y-4">
      {/* Header with Search and Optional Filter — always shown, even while loading or empty,
          so filter/search controls (e.g. the Selected/Rejected toggle) never disappear.
          Posts masthead recipe: brand-washed title row with heading, count badge,
          filter and search at the right end. */}
      {!hideHeader && (
        <div className={`shrink-0 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash}`}>
          <div className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5${description ? ` border-b ${skin.edge}` : ''}`}>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              {onBack && (
                <button
                  onClick={onBack}
                  className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} ${skin.radius} cursor-pointer transition-colors duration-200 hover:border-brand hover:text-brand ${FOCUS}`}
                  title="Back to posts"
                  aria-label="Back to posts"
                >
                  <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
                </button>
              )}
              <h2 className={skin.heading}>{title || 'Candidates'}</h2>
              <span role="status" aria-atomic="true" className={`inline-flex shrink-0 items-center gap-1.5 ${skin.count} rounded-lg`}>
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 shrink-0 rounded-full animate-pulse motion-reduce:animate-none ${skin.countDot}`}
                />
                {searchTerm ? `${filteredCandidates.length} found` : candidates.length}
              </span>
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:gap-3 min-w-0">
              {filterOptions && onFilterChange && (
                <div className="relative">
                  <select
                    value={filterValue}
                    onChange={(e) => onFilterChange(e.target.value)}
                    className={`cursor-pointer appearance-none pl-3 pr-8 py-2 w-52 rounded-lg ${skin.field} ${FOCUS}`}
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

              <div className={`relative w-full ${searchWidth}`}>
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-ink/40" />
                </div>
                <input
                  type="text"
                  placeholder="Search candidates..."
                  className={`block w-full pl-10 pr-3 py-2 leading-5 sm:text-sm rounded-lg ${skin.field} ${FOCUS}`}
                  value={searchTerm}
                  onChange={(e) => onSearchTermChange?.(e.target.value)}
                />
              </div>
            </div>
          </div>

          {description && (
            <div className="px-4 py-2.5 sm:px-5">
              <p className={skin.body}>{description}</p>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} overflow-hidden transition-colors duration-200 ${skin.cardHover}`}>
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center space-x-4 animate-pulse">
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
        <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} p-12 text-center transition-colors duration-200 ${skin.cardHover}`}>
          {!hideEmptyIcon && (
            <div className="mx-auto h-12 w-12 text-ink/30 mb-4">
              <User className="h-full w-full" />
            </div>
          )}
          <h3 className={skin.emptyTitle}>No candidates found</h3>
          <p className={`mt-1 ${skin.body}`}>{emptyMessage || 'Upload a resume to get started.'}</p>
        </div>
      ) : (
      <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} overflow-hidden transition-colors duration-200 ${skin.cardHover}`}>
        <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(100vh - 160px)' }}>
          <table className={`min-w-full divide-y ${skin.divide}`}>
            <thead className={`${skin.canvas} sticky top-0 z-10`}>
              <tr>
                <th scope="col" className={`px-6 py-4 text-left ${skin.micro} ${skin.canvas}`}>{hideRole ? 'Name' : 'Name / Role'}</th>
                <th scope="col" className={`px-6 py-4 text-left ${skin.micro} ${skin.canvas}`}>Contact Info</th>
                <th scope="col" className={`px-6 py-4 text-left ${skin.micro} ${skin.canvas}`}>Experience</th>
                <th scope="col" className={`px-6 py-4 text-center ${skin.micro} ${skin.canvas}`}>Actions</th>
              </tr>
            </thead>
            <tbody className={`${skin.surface} divide-y ${skin.divide}`}>
              {filteredCandidates.map((candidate) => {
                return (
                  <tr
                    key={candidate.id}
                    className={`group ${skin.rowHover} transition-colors duration-150 cursor-pointer`}
                    onClick={() => onSelectCandidate(candidate)}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-brand/20 text-brand flex items-center justify-center text-sm font-bold shadow-sm">
                            {candidate.name?.charAt(0).toUpperCase() || 'U'}
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-semibold text-ink group-hover:text-brand transition-colors">
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
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex items-center justify-center gap-2 transition-opacity">
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

        {filteredCandidates.length === 0 && searchTerm && (
          <div className="p-12 text-center">
            <p className={skin.body}>No candidates match your search.</p>
          </div>
        )}
      </div>
      )}
    </div>
  );
}