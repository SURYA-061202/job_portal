import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useSkin, FOCUS } from '@/styles/skin';
import { stripEmoji } from '@/lib/format';
import ExpandingModal from '@/components/subscription/ExpandingModal';

interface Notification {
  id: string;
  title?: string;
  message: string;
  createdAt: any;
  viewed: boolean;
  ref: any;
}

/** Newest first — done in the client so the query needs no composite index. */
const byNewestFirst = (a: Notification, b: Notification) =>
  (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0);

interface Props {
  className?: string;
}

export default function NotificationBell({ className = '', simpleMode = false, filled = false }: Props & { simpleMode?: boolean; filled?: boolean }) {
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const open = !!origin;
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  // Ids marked read in this session. Held locally so the badge clears the moment
  // the panel opens and can't be resurrected by the next snapshot — the write to
  // Firestore may be rejected by rules, which used to leave the badge stuck.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const skin = useSkin();

  const unreadCount = notifications.filter(n => !n.viewed && !dismissedIds.has(n.id)).length;

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

    // No orderBy(): `where + orderBy(createdAt)` needs a composite index, and
    // without it Firestore answers FAILED_PRECONDITION — the listener never
    // fires and the bell silently shows nothing. The equality filter runs on
    // the automatic single-field index; order is applied in the client.
    // Emails are lowercased to match how notifications are written.
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUserEmail.trim().toLowerCase())
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Notification[] = [];
        snap.forEach(docSnap => {
          const data: any = docSnap.data();
          list.push({ id: docSnap.id, ref: docSnap.ref, ...data });
        });
        list.sort(byNewestFirst);
        setNotifications(list);
      },
      (err) => console.error('Failed to load notifications:', err)
    );
    return () => unsub();
  }, [currentUserEmail]);

  // Mark everything on show as read once the panel opens. Each notification is
  // attempted once per session, so a rejected write can't spin into a retry loop.
  useEffect(() => {
    if (!open) return;
    const unread = notifications.filter(n => !n.viewed && !dismissedIds.has(n.id));
    if (unread.length === 0) return;

    setDismissedIds(prev => {
      const next = new Set(prev);
      unread.forEach(n => next.add(n.id));
      return next;
    });

    Promise.allSettled(unread.map(n => updateDoc(n.ref, { viewed: true, read: true })))
      .then(results => {
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length) {
          console.error(
            `Could not mark ${failed.length} notification(s) as read in Firestore ` +
            '(the badge was cleared locally). Check the notifications write rules.',
            failed
          );
        }
      });
  }, [open, notifications, dismissedIds]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent parent click
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  if (simpleMode) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        {/* The parent button already carries the accessible name and colour. */}
        {filled ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="h-6 w-6" fill="currentColor">
            <path d="M12 2.4c-.95 0-1.7.75-1.7 1.65v.4C7.5 5.15 5.9 7.5 5.9 10.4v3.2l-1.75 3c-.45.75.1 1.7.95 1.7h13.8c.85 0 1.4-.95.95-1.7l-1.75-3v-3.2c0-2.9-1.6-5.25-4.4-5.95v-.4c0-.9-.75-1.65-1.7-1.65Z" />
            <path d="M9.4 19.7a2.6 2.6 0 0 0 5.2 0Z" />
          </svg>
        ) : (
          <Bell aria-hidden="true" className="icon-lg" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-xs font-semibold text-surface">
            {unreadCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button onClick={handleToggle} className={`relative p-2 ${skin.radius} text-ink/60 hover:bg-ink/5 hover:text-ink transition-colors ${FOCUS} ${className}`}>
        <Bell className="h-5 w-5 text-brand" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-brand text-surface text-xs rounded-full px-1.5">{unreadCount}</span>
        )}
      </button>

      {origin && (
        <ExpandingModal
          title="Notifications"
          subtitle={`${notifications.length} in total`}
          origin={origin}
          onClose={() => setOrigin(null)}
          widthClass="max-w-[28rem]"
        >
          {notifications.length === 0 ? (
            <p className={`p-4 ${skin.body}`}>No notifications</p>
          ) : (
            <ul className={`divide-y ${skin.divide}`}>
              {notifications.map((n) => (
                <li key={n.id} className={`px-5 py-3 text-sm text-ink/80 ${skin.rowHover}`}>
                  {n.title && <p className="mb-0.5 font-semibold text-ink">{stripEmoji(n.title)}</p>}
                  <p>{stripEmoji(n.message)}</p>
                  <div className={`mt-1 ${skin.meta}`}>{n.createdAt?.seconds ? new Date(n.createdAt.seconds * 1000).toLocaleString() : ''}</div>
                </li>
              ))}
            </ul>
          )}
        </ExpandingModal>
      )}
    </div>
  );
} 