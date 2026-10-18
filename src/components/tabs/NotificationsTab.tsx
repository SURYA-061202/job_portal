import { useEffect, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { useSkin } from '@/styles/skin';
import { stripEmoji } from '@/lib/format';

interface Notification {
  id: string;
  message: string;
  createdAt: any;
  viewed: boolean;
  ref: any;
  title?: string;
  userId?: string;
  type?: string;
}

export default function NotificationsTab() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
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
          const data: any = docSnap.data();
          list.push({ id: docSnap.id, ref: docSnap.ref, ...data });
        });
        list.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setNotifications(list);
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

  return (
    <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-6 flex-1 min-h-0 flex flex-col`}>
      {/* Header - Posts masthead recipe: brand-washed title over a
          description line, with no separator or extra gap between them. */}
      <div className={`shrink-0 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash} px-4 py-3.5 sm:px-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className={skin.heading}>Notifications</h2>
            <span role="status" aria-atomic="true" className={`inline-flex shrink-0 items-center gap-1.5 ${skin.count} rounded-lg`}>
              {notifications.length}
            </span>
          </div>
        </div>
        <p className={`mt-1.5 ${skin.body}`}>New applications, interview responses, submitted details and premium requests.</p>
      </div>

      {/* Body - separate panel from the header. Fills the remaining height;
          when empty, the message is centered in the full-height panel. */}
      <div className={`border ${skin.edge} bg-surface ${skin.radius} p-2 sm:p-3 overflow-hidden flex-1 min-h-0${notifications.length === 0 ? ' flex items-center justify-center' : ''}`}>
        {notifications.length === 0 ? (
          <p className={`p-4 sm:p-6 ${skin.body}`}>No notifications.</p>
        ) : (
          <div className="h-full overflow-y-auto scrollbar-hide">
            <ul className={`overflow-hidden ${skin.radius}`}>
              {notifications.map((n) => (
                <li key={n.id} className={`px-4 sm:px-6 py-4 bg-muted ${skin.rowHover}`}>
                  {n.title && <p className="text-sm font-medium text-ink">{stripEmoji(n.title)}</p>}
                  <p className="text-sm text-ink/80 mt-0.5">{stripEmoji(n.message)}</p>
                  <p className={`mt-1 ${skin.meta}`}>{n.createdAt?.seconds ? new Date(n.createdAt.seconds * 1000).toLocaleString() : ''}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
} 