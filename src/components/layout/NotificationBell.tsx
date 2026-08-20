import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

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
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full px-1.5 flex items-center justify-center" style={{ minWidth: '16px', height: '16px' }}>
            {unreadCount}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button onClick={handleToggle} className={`relative p-2 rounded-full hover:bg-brand/10 ${className}`}>
        <Bell className="h-5 w-5 text-brand" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full px-1.5">{unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[calc(100vw-2rem)] sm:w-[28rem] bg-surface border border-gray-200 rounded-lg z-50 flex flex-col max-h-[70vh]">
          {/* Header stays put while the list below it scrolls */}
          <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-700">Notifications</span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold border border-gray-200">
                {notifications.length}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="p-1.5 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-y-auto custom-scrollbar">
            {notifications.length === 0 ? (
              <p className="p-4 text-sm text-gray-600">No notifications</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {notifications.map((n) => (
                  <li key={n.id} className="px-4 py-3 text-sm text-gray-700 hover:bg-gray-50">
                    {n.message}
                    <div className="text-xs text-gray-400 mt-1">{new Date(n.createdAt?.seconds * 1000).toLocaleString()}</div>
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