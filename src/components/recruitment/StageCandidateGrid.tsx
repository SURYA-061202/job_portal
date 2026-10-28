import { useMemo, useState, type ReactNode, type MouseEvent } from 'react';
import { Mail, Phone, Clock, Check, X, Trash2, Loader2, UserX } from 'lucide-react';
import { deleteDoc, doc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import type { Candidate } from '@/types';
import { usePopup } from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';
import { candidateMatchesSearch } from '@/components/resume/CandidateList';

const toTitleCase = (s?: string) =>
    (s || '').split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

const expLabel = (e?: string) => {
    const t = (e || '').toString().trim();
    if (!t) return '';
    return /^[\d.]+$/.test(t) ? `${t} ${Number(t) === 1 ? 'yr' : 'yrs'}` : t;
};

interface StageCandidateGridProps {
    candidates: Candidate[];
    loading: boolean;
    search: string;
    onSelect?: (candidate: Candidate) => void;
    emptyText: string;
    /** Post title per post id; shows which post each candidate belongs to. */
    postTitles?: Record<string, string>;
    /** Extra per-card actions, shown before the remove button. */
    extraActions?: (candidate: Candidate) => ReactNode;
    /** Called after a candidate is removed so the parent can reload. */
    onRefresh?: () => void;
}

/** Remove-with-confirm logic shared by the grid and the table. */
export function useCandidateRemoval(onRefresh?: () => void) {
    const { showSuccess, showError } = usePopup();
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const remove = async (e: MouseEvent, candidate: Candidate) => {
        e.stopPropagation();
        setDeletingId(candidate.id);
        try {
            await deleteDoc(doc(db, 'candidates', candidate.id));
            if (candidate.resumeUrl) {
                const match = candidate.resumeUrl.match(/resumes\/([^/?#]+)/);
                if (match) await deleteObject(ref(storage, `resumes/${match[1]}`)).catch(() => {});
            }
            showSuccess('Candidate removed successfully');
            onRefresh?.();
        } catch (error) {
            console.error('Error removing candidate:', error);
            showError('Failed to remove candidate');
        } finally {
            setDeletingId(null);
            setConfirmId(null);
        }
    };

    return { confirmId, setConfirmId, deletingId, remove };
}

/** Candidates at a stage as a grid of white cards (Shortlisted, Interview, Selected). */
export default function StageCandidateGrid({ candidates, loading, search, onSelect, emptyText, postTitles, extraActions, onRefresh }: StageCandidateGridProps) {
    const skin = useSkin();
    const { confirmId, setConfirmId, deletingId, remove } = useCandidateRemoval(onRefresh);

    const shown = useMemo(
        () => candidates.filter((c) => candidateMatchesSearch(c, search, postTitles)),
        [candidates, search, postTitles]
    );

    if (loading) {
        return (
            <div role="status" aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <span className="sr-only">Loading candidates…</span>
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} aria-hidden="true" className={`animate-pulse border ${skin.edge} bg-surface ${skin.radius} p-4`}>
                        <div className="flex items-center gap-3">
                            <div className={`h-11 w-11 ${skin.skeleton}`} />
                            <div className="flex-1 space-y-2">
                                <div className={`h-4 w-1/2 ${skin.skeleton}`} />
                                <div className={`h-3 w-1/3 ${skin.skeleton}`} />
                            </div>
                        </div>
                        <div className={`mt-4 h-3 w-2/3 ${skin.skeleton}`} />
                        <div className={`mt-2 h-3 w-1/2 ${skin.skeleton}`} />
                    </div>
                ))}
            </div>
        );
    }

    if (shown.length === 0) {
        return (
            <div className={`flex flex-col items-center justify-center border ${skin.edge} bg-surface ${skin.radius} px-6 py-16 text-center`}>
                <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink/5 text-ink/50" aria-hidden="true">
                    <UserX className="h-6 w-6" />
                </span>
                <h3 className={skin.emptyTitle}>{search && candidates.length > 0 ? 'No matching candidates' : 'No candidates found'}</h3>
                <p className={`mt-1 max-w-sm ${skin.body}`}>{search && candidates.length > 0 ? 'Try a different name, role, email or company.' : emptyText}</p>
            </div>
        );
    }

    return (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((c) => {
                const postId = (c as { postId?: string }).postId;
                const postTitle = postId ? postTitles?.[postId] : undefined;
                const exp = expLabel(c.experience);
                const confirming = confirmId === c.id;
                const deleting = deletingId === c.id;
                return (
                    <li key={c.id}>
                        <article
                            role={onSelect ? 'button' : undefined}
                            tabIndex={onSelect ? 0 : undefined}
                            onClick={onSelect ? () => onSelect(c) : undefined}
                            onKeyDown={onSelect ? (e) => {
                                if (e.target !== e.currentTarget) return;
                                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(c); }
                            } : undefined}
                            className={`group flex h-full flex-col border ${skin.edge} bg-surface ${skin.radius} p-4 transition-colors duration-200 hover:border-ink/40 ${onSelect ? 'cursor-pointer' : ''} ${FOCUS}`}
                        >
                            <div className="flex items-center gap-3">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink/5 text-base font-bold text-ink/70" aria-hidden="true">
                                    {c.name?.charAt(0).toUpperCase() || 'U'}
                                </span>
                                <div className="min-w-0">
                                    <h3 className="truncate text-sm font-semibold text-ink">{toTitleCase(c.name) || 'Unnamed'}</h3>
                                    {c.role && <p className={`truncate ${skin.meta}`}>{toTitleCase(c.role)}</p>}
                                </div>
                            </div>

                            <div className={`mt-4 space-y-1.5 ${skin.body}`}>
                                <p className="flex min-w-0 items-center gap-2" title={c.email}>
                                    <Mail className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                    <span className="truncate">{c.email || '-'}</span>
                                </p>
                                <p className="flex items-center gap-2">
                                    <Phone className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                    <span>{c.phone || 'N/A'}</span>
                                </p>
                            </div>

                            <div className="mt-4 flex flex-1 flex-wrap items-end gap-1.5">
                                {exp && (
                                    <span className="inline-flex items-center gap-1 rounded-lg bg-border px-2 py-1 text-xs font-medium text-ink/70">
                                        <Clock className="h-3 w-3" aria-hidden="true" />{exp}
                                    </span>
                                )}
                                {postTitle && (
                                    <span className="max-w-full truncate rounded-lg bg-border px-2 py-1 text-xs font-medium text-ink/70" title={postTitle}>{postTitle}</span>
                                )}
                            </div>

                            <div className="mt-4 flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                {extraActions?.(c)}
                                {confirming ? (
                                    <>
                                        <button type="button" disabled={deleting} onClick={(e) => remove(e, c)} aria-label="Confirm remove" title="Confirm remove"
                                            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-50 ${FOCUS}`}>
                                            {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                                        </button>
                                        <button type="button" disabled={deleting} onClick={() => setConfirmId(null)} aria-label="Cancel" title="Cancel"
                                            className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border ${skin.edge} text-ink/60 hover:text-ink ${FOCUS}`}>
                                            <X className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </>
                                ) : (
                                    <button type="button" onClick={() => setConfirmId(c.id)} aria-label={`Remove ${c.name}`} title="Remove candidate"
                                        className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border ${skin.edge} text-ink/50 transition-colors hover:border-destructive/50 hover:text-destructive ${FOCUS}`}>
                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                )}
                            </div>
                        </article>
                    </li>
                );
            })}
        </ul>
    );
}
