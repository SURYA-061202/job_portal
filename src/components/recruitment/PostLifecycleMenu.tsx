import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus, Copy, Loader2, Pause, Pencil, Play, RefreshCw, Rocket, Settings2, Trash2, XCircle, type LucideIcon } from 'lucide-react';
import type { RecruitmentRequest } from '@/types';
import { getPostLifecycle } from '@/lib/postLifecycle';
import { FOCUS } from '@/styles/skin';

export type LifecycleAction = 'pause' | 'resume' | 'extend' | 'close' | 'repost' | 'publish';

interface Item { action: LifecycleAction; label: string; icon: LucideIcon; danger?: boolean }

/** What a post in each status can do. Repost is the way back from expired and closed. */
function lifecycleActionsFor(post: RecruitmentRequest): Item[] {
    const lc = getPostLifecycle(post);
    const extend: Item[] = lc.expiresAt ? [{ action: 'extend', label: 'Extend expiry', icon: CalendarPlus }] : [];
    switch (lc.status) {
        case 'draft':
            return [{ action: 'publish', label: 'Publish now', icon: Rocket }];
        case 'active':
            return [...extend, { action: 'pause', label: 'Pause', icon: Pause }, { action: 'close', label: 'Close post', icon: XCircle, danger: true }];
        case 'paused':
            return [{ action: 'resume', label: 'Resume', icon: Play }, ...extend, { action: 'close', label: 'Close post', icon: XCircle, danger: true }];
        case 'expired':
        case 'closed':
            return [{ action: 'repost', label: 'Repost', icon: RefreshCw }];
    }
}

interface Props {
    post: RecruitmentRequest;
    /** Pause / resume / extend / close / repost. Omit to leave those out of the menu. */
    onAction?: (post: RecruitmentRequest, action: LifecycleAction) => void;
    onEdit?: (post: RecruitmentRequest) => void;
    /** Opens the form pre-filled from this post, to save as a new draft or post. */
    onDuplicate?: (post: RecruitmentRequest) => void;
    /** Deleting asks for a confirmation inside the menu first. */
    onDelete?: (post: RecruitmentRequest) => Promise<void> | void;
    /** Renders the lifecycle actions as a row of labelled buttons instead of a menu (post detail header). */
    inline?: boolean;
}

const MENU_WIDTH = 192;
const ROW_HEIGHT = 36;

/**
 * Everything a recruiter can do to one post, behind one actions button: Edit,
 * the lifecycle actions that fit the post's status, and Delete. The menu is
 * rendered in a portal so the table's scroll area can't clip it.
 */
export default function PostLifecycleMenu({ post, onAction, onEdit, onDelete, onDuplicate, inline = false }: Props) {
    const lifecycleItems = onAction ? lifecycleActionsFor(post) : [];
    const [open, setOpen] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const close = () => { setOpen(false); setConfirmingDelete(false); };

    useEffect(() => {
        if (!open) return;
        const dismiss = () => { if (!deleting) close(); };
        const onDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (!menuRef.current?.contains(t) && !buttonRef.current?.contains(t)) dismiss();
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { dismiss(); buttonRef.current?.focus(); } };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        // Scrolling or resizing would leave the menu floating away from its button.
        window.addEventListener('resize', dismiss);
        window.addEventListener('scroll', dismiss, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('resize', dismiss);
            window.removeEventListener('scroll', dismiss, true);
        };
    }, [open, deleting]);

    if (inline) {
        return (
            <>
                {lifecycleItems.map(({ action, label, icon: Icon, danger }) => (
                    <button
                        key={action}
                        type="button"
                        onClick={() => onAction?.(post, action)}
                        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-xs font-bold uppercase tracking-wider transition-colors duration-200 ${danger ? 'border-destructive text-destructive hover:bg-destructive/10' : 'border-ink/30 text-ink hover:bg-ink/5'} ${FOCUS}`}
                    >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        {label}
                    </button>
                ))}
            </>
        );
    }

    if (!onEdit && !onDelete && !onDuplicate && lifecycleItems.length === 0) return null;

    const toggle = () => {
        if (open) { close(); return; }
        const r = buttonRef.current?.getBoundingClientRect();
        if (r) {
            const rows = lifecycleItems.length + (onEdit ? 1 : 0) + (onDuplicate ? 1 : 0) + (onDelete ? 1 : 0);
            const estimatedHeight = rows * ROW_HEIGHT + 12;
            const below = r.bottom + 4 + estimatedHeight <= window.innerHeight;
            setPos({
                top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - estimatedHeight),
                left: Math.min(Math.max(8, r.right - MENU_WIDTH), window.innerWidth - MENU_WIDTH - 8),
            });
        }
        setOpen(true);
    };

    const itemClass = (danger?: boolean) =>
        `flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] font-medium transition-colors ${danger ? 'text-destructive hover:bg-destructive/10' : 'text-ink hover:bg-ink/5'} ${FOCUS}`;

    const confirmDelete = async () => {
        if (!onDelete) return;
        setDeleting(true);
        try { await onDelete(post); } finally { setDeleting(false); close(); }
    };

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`Actions for ${post.jobTitle}`}
                title="Actions"
                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink/60 transition-colors duration-200 hover:bg-ink/10 hover:text-ink ${open ? 'bg-ink/10 text-ink' : ''} ${FOCUS}`}
            >
                <Settings2 className="h-4 w-4" aria-hidden="true" />
            </button>
            {open && pos && createPortal(
                <div
                    ref={menuRef}
                    role="menu"
                    style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
                    className="fixed z-50 rounded-lg border border-ink/15 bg-surface p-1 shadow-xl"
                >
                    {confirmingDelete ? (
                        <div className="p-2">
                            <p className="text-[13px] font-semibold text-ink">Delete this post?</p>
                            <p className="mt-0.5 text-xs text-ink/60">This can't be undone. To keep it, close the post instead.</p>
                            <div className="mt-2.5 flex gap-2">
                                <button
                                    type="button"
                                    disabled={deleting}
                                    onClick={confirmDelete}
                                    className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-destructive px-2 py-1.5 text-xs font-bold text-white disabled:opacity-60 ${FOCUS}`}
                                >
                                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                                    Delete
                                </button>
                                <button
                                    type="button"
                                    disabled={deleting}
                                    onClick={() => setConfirmingDelete(false)}
                                    className={`flex-1 cursor-pointer rounded-md border border-ink/20 px-2 py-1.5 text-xs font-bold text-ink hover:bg-ink/5 disabled:opacity-60 ${FOCUS}`}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {onEdit && (
                                <button type="button" role="menuitem" onClick={() => { close(); onEdit(post); }} className={itemClass()}>
                                    <Pencil className="h-4 w-4" aria-hidden="true" />
                                    Edit
                                </button>
                            )}
                            {onDuplicate && (
                                <button type="button" role="menuitem" onClick={() => { close(); onDuplicate(post); }} className={itemClass()}>
                                    <Copy className="h-4 w-4" aria-hidden="true" />
                                    Duplicate
                                </button>
                            )}
                            {lifecycleItems.map(({ action, label, icon: Icon, danger }) => (
                                <button key={action} type="button" role="menuitem" onClick={() => { close(); onAction?.(post, action); }} className={itemClass(danger)}>
                                    <Icon className="h-4 w-4" aria-hidden="true" />
                                    {label}
                                </button>
                            ))}
                            {onDelete && (
                                <>
                                    {(onEdit || onDuplicate || lifecycleItems.length > 0) && <div role="separator" className="my-1 h-px bg-ink/10" />}
                                    <button type="button" role="menuitem" onClick={() => setConfirmingDelete(true)} className={itemClass(true)}>
                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        Delete
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>,
                document.body,
            )}
        </>
    );
}
