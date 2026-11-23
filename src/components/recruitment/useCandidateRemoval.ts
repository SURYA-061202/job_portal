import { useState, type MouseEvent } from 'react';
import { deleteDoc, doc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import type { Candidate } from '@/types';
import { usePopup } from '@/components/ui/Popup';

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
