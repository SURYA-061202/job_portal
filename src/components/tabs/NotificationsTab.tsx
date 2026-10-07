import { useEffect, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Crown, CheckCircle, XCircle, Bell } from 'lucide-react';
import { useSkin } from '@/styles/skin';

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

const notificationStyles: Record<string, { icon: React.ReactNode; bgClass: string; borderClass: string }> = {
  premium_request: {
    icon: <Crown className="w-5 h-5 text-brand" />,
    bgClass: 'bg-brand/10',
    borderClass: 'border-brand/30',
  },
  premium_approved: {
    icon: <CheckCircle className="w-5 h-5 text-ink" />,
    bgClass: 'bg-ink/5',
    borderClass: 'border-ink/20',
  },
  premium_rejected: {
    icon: <XCircle className="w-5 h-5 text-destructive" />,
    bgClass: 'bg-destructive/10',
    borderClass: 'border-destructive/20',
  },
};

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

    // Query notifications where userId matches current user's email
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', currentUserEmail),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: Notification[] = [];
      snap.forEach((docSnap) => {
        const data: any = docSnap.data();
        list.push({ id: docSnap.id, ref: docSnap.ref, ...data });
      });
      setNotifications(list);
      // Mark all as viewed
      list.forEach((n) => {
        if (!n.viewed) {
          updateDoc(n.ref, { viewed: true, read: true })
            .catch(err => console.error('Failed to mark notification as viewed:', n.id, err));
        }
      });
    });
    return () => unsub();
  }, [currentUserEmail]);

  return (
    <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-6 flex-1 flex flex-col`}>
      {/* Header - Posts masthead recipe: separate brand-washed panel above the
          body, so the title row (heading + count badge) sits over a
          description row while the notification list lives in its own card. */}
      <div className={`shrink-0 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash}`}>
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${skin.edge} px-4 py-3.5 sm:px-5`}>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className={skin.heading}>Notifications</h2>
            <span role="status" aria-atomic="true" className={`inline-flex shrink-0 items-center gap-1.5 ${skin.count}`}>
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full animate-pulse motion-reduce:animate-none ${skin.countDot}`}
              />
              {notifications.length}
            </span>
          </div>
        </div>

        <div className="px-4 py-2.5 sm:px-5">
          <p className={skin.body}>Updates on premium requests and approval status.</p>
        </div>
      </div>

      {/* Body - separate panel from the header. Fills the remaining height;
          when empty, the message is centered in the full-height panel. */}
      <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} overflow-hidden flex-1${notifications.length === 0 ? ' flex items-center justify-center' : ''}`}>
        {notifications.length === 0 ? (
          <p className={`p-4 sm:p-6 ${skin.body}`}>No notifications.</p>
        ) : (
          <ul className={`divide-y ${skin.divide}`}>
            {notifications.map((n) => {
              const style = n.type && notificationStyles[n.type] ? notificationStyles[n.type] : null;
              return (
                <li
                  key={n.id}
                  className={`px-4 sm:px-6 py-4 ${skin.rowHover} ${style ? `${style.bgClass} border-l-4 ${style.borderClass}` : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      {style ? style.icon : <Bell className="w-4 h-4 text-ink/40" />}
                    </div>
                    <div className="flex-1">
                      {n.title && <p className="text-sm font-medium text-brand">{n.title}</p>}
                      <p className="text-sm text-ink/80 mt-0.5">{n.message}</p>
                      <p className={`mt-1 ${skin.meta}`}>{new Date(n.createdAt?.seconds * 1000).toLocaleString()}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
} 