import type { TimestampLike } from '@/types';
import { useEffect, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, updateDoc, deleteDoc, type DocumentData, type DocumentReference } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { MoreVertical, Trash2, BriefcaseBusiness, CalendarClock, CreditCard, BadgeCheck, MessageSquare, UserCheck, type LucideIcon } from 'lucide-react';
import { useSkin, FOCUS } from '@/styles/skin';
import { stripEmoji, timeAgo } from '@/lib/format';

interface Notification {
  id: string;
  message: string;
  createdAt: TimestampLike | null;
  viewed: boolean;
  ref: DocumentReference;
  title?: string;
  userId?: string;
  type?: string;
}

/** Short category shown under each notification ("Interview • 5m ago") with a matching icon. */
function categoryOf(type?: string): { label: string; Icon: LucideIcon } {
  const t = type ?? '';
  if (t.startsWith('interview') || t === 'round_moved') return { label: 'Interview', Icon: CalendarClock };
  if (t.startsWith('subscription') || t.startsWith('premium')) return { label: 'Subscription', Icon: CreditCard };
  if (t.startsWith('company')) return { label: 'Company', Icon: BadgeCheck };
  if (t === 'new_message') return { label: 'Message', Icon: MessageSquare };
  if (t === 'manager_invite') return { label: 'Team', Icon: UserCheck };
  if (t === 'job_alert') return { label: 'Job alert', Icon: BriefcaseBusiness };
  return { label: 'Application', Icon: BriefcaseBusiness };
}

/** Where the open three-dot menu is drawn (fixed, so a scrolling list can't clip it). */
interface MenuState { id: string; top: number; right: number; up: boolean }

export default function NotificationsTab({ embedded = false }: { embedded?: boolean }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  // Ids that were unread when first loaded. They are marked read straight away,
  // so this keeps them highlighted for as long as the panel stays open.
  const [highlightIds, setHighlightIds] = useState<Set<string>>(new Set());
  // Deleted in this session: hidden at once, and put back if Firestore refuses.
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const skin = useSkin();

  // Get current user's email
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user?.email) {
        setCurrentUserEmail(user.email);
      } else {
        setCurrentUserEmail(null);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!currentUserEmail) {
      setNotifications([]);
      return;
    }

    // No orderBy(): the compound query needs a composite index that isn't
    // provisioned and would fail the listener outright; the list is sorted
    // client-side instead. Emails are lowercased to match how notifications
    // are written.
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUserEmail.trim().toLowerCase())
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Notification[] = [];
        snap.forEach((docSnap) => {
          const data: DocumentData = docSnap.data();
          list.push({ id: docSnap.id, ref: docSnap.ref, ...data } as Notification);
        });
        list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setNotifications(list);
        const fresh = list.filter((n) => !n.viewed).map((n) => n.id);
        if (fresh.length) {
          setHighlightIds((prev) => {
            const next = new Set(prev);
            fresh.forEach((id) => next.add(id));
            return next;
          });
        }
        // Mark all as viewed
        list.forEach((n) => {
          if (!n.viewed) {
            updateDoc(n.ref, { viewed: true, read: true })
              .catch(err => console.error('Failed to mark notification as viewed:', n.id, err));
          }
        });
      },
      (err) => console.error('Failed to load notifications:', err)
    );
    return () => unsub();
  }, [currentUserEmail]);

  // Any outside click, scroll or resize closes the row menu.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  const visible = notifications.filter((n) => !deletedIds.has(n.id));

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, id: string) => {
    e.stopPropagation();
    if (menu?.id === id) {
      setMenu(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    // Flip upward when there isn't room for the menu below the button.
    const up = window.innerHeight - r.bottom < 80;
    setMenu({ id, top: up ? r.top : r.bottom, right: window.innerWidth - r.right, up });
  };

  const handleDelete = async (n: Notification) => {
    setMenu(null);
    setDeletedIds((prev) => new Set(prev).add(n.id));
    try {
      await deleteDoc(n.ref);
    } catch (err) {
      console.error('Could not delete notification:', err);
      setDeletedIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
    }
  };

  const renderList = (rowPad: string) => (
    <>
      <ul className={`divide-y ${skin.divide}`}>
        {visible.map((n) => {
          const { label, Icon } = categoryOf(n.type);
          return (
            <li key={n.id} className={`flex items-start gap-3 ${rowPad} ${highlightIds.has(n.id) ? 'bg-sky-50' : ''} ${skin.rowHover}`}>
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm text-ink/80">
                  {n.title && <span className="font-semibold text-ink">{stripEmoji(n.title)} </span>}
                  {stripEmoji(n.message)}
                </p>
                <p className={`mt-1 ${skin.meta}`}>{label} &bull; {timeAgo(n.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={(e) => openMenu(e, n.id)}
                aria-label="Notification options"
                aria-haspopup="menu"
                aria-expanded={menu?.id === n.id}
                className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink/50 transition-colors hover:bg-ink/10 hover:text-ink ${FOCUS}`}
              >
                <MoreVertical className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {menu && (() => {
        const target = visible.find((n) => n.id === menu.id);
        if (!target) return null;
        return (
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', right: menu.right, top: menu.up ? undefined : menu.top + 4, bottom: menu.up ? window.innerHeight - menu.top + 4 : undefined }}
            className={`z-[210] min-w-[9rem] overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} py-1`}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => handleDelete(target)}
              className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-ink/5 ${FOCUS}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete
            </button>
          </div>
        );
      })()}
    </>
  );

  if (embedded) {
    return visible.length === 0 ? (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className={skin.body}>No notifications.</p>
      </div>
    ) : (
      renderList('px-5 py-4')
    );
  }

  return (
    <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-6 flex-1 min-h-0 flex flex-col`}>
      {/* Body - separate panel from the header. Fills the remaining height;
          when empty, the message is centered in the full-height panel. */}
      <div className={`border ${skin.edge} bg-surface ${skin.radius} p-2 sm:p-3 overflow-hidden flex-1 min-h-0${visible.length === 0 ? ' flex items-center justify-center' : ''}`}>
        {visible.length === 0 ? (
          <p className={`p-4 sm:p-6 ${skin.body}`}>No notifications.</p>
        ) : (
          <div className="h-full overflow-y-auto scrollbar-hide">
            <div className={`overflow-hidden ${skin.radius} bg-muted`}>{renderList('px-4 sm:px-6 py-4')}</div>
          </div>
        )}
      </div>
    </div>
  );
} 