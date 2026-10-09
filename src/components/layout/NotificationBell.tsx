import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useSkin, FOCUS } from '@/styles/skin';

interface Notification {
  id: string;
  message: string;
  createdAt: any;
  viewed: boolean;
  ref: any;
}

interface Props {
  className?: string;
}

export default function NotificationBell({ className = '', simpleMode = false }: Props & { simpleMode?: boolean }) {
  const [open, setOpen] = useState(false);
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

    // Query notifications where userId matches current user's email
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUserEmail),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: Notification[] = [];
      snap.forEach(docSnap => {
        const data: any = docSnap.data();
        list.push({ id: docSnap.id, ref: docSnap.ref, ...data });
      });
      setNotifications(list);
    });
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
    setOpen((prev) => !prev);
  };

  if (simpleMode) {
    return (
      <div className={`relative flex items-center justify-center ${className}`}>
        {/* The parent button already carries the accessible name and colour. */}
        <Bell aria-hidden="true" className="icon-lg" />
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

      {open && (
        <div className={`absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-[28rem] border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} z-50 flex flex-col max-h-[70vh]`}>
          {/* Header stays put while the list below it scrolls */}
          <div className={`px-4 py-3 border-b ${skin.edge} flex justify-between items-center gap-3 flex-shrink-0`}>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-ink">Notifications</span>
              <span className={`${skin.count} rounded-lg`}>
                {notifications.length}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className={`p-1.5 ${skin.radius} text-ink/60 hover:text-ink hover:bg-ink/5 transition-colors ${FOCUS}`}
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <p className={`p-4 ${skin.body}`}>No notifications</p>
            ) : (
              <ul className={`divide-y ${skin.divide}`}>
                {notifications.map((n) => (
                  <li key={n.id} className={`px-4 py-3 text-sm text-ink/80 ${skin.rowHover}`}>
                    {n.message}
                    <div className={`mt-1 ${skin.meta}`}>{new Date(n.createdAt?.seconds * 1000).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 