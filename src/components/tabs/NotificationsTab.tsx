import { useEffect, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { Crown, CheckCircle, XCircle, Bell } from 'lucide-react';

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
    icon: <CheckCircle className="w-5 h-5 text-green-600" />,
    bgClass: 'bg-green-50',
    borderClass: 'border-green-200',
  },
  premium_rejected: {
    icon: <XCircle className="w-5 h-5 text-red-600" />,
    bgClass: 'bg-red-50',
    borderClass: 'border-red-200',
  },
};

export default function NotificationsTab() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

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
    <div className="bg-surface rounded-lg border border-gray-200 divide-y divide-gray-200">
      <div className="px-4 sm:px-6 py-4">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900">Notifications ({notifications.length})</h2>
      </div>
      {notifications.length === 0 ? (
        <p className="p-4 sm:p-6 text-gray-600 text-sm sm:text-base">No notifications.</p>
      ) : (
        <ul>
          {notifications.map((n) => {
            const style = n.type && notificationStyles[n.type] ? notificationStyles[n.type] : null;
            return (
              <li
                key={n.id}
                className={`px-4 sm:px-6 py-4 hover:bg-gray-50 ${style ? `${style.bgClass} border-l-4 ${style.borderClass}` : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {style ? style.icon : <Bell className="w-4 h-4 text-gray-400" />}
                  </div>
                  <div className="flex-1">
                    {n.title && <p className="text-sm font-medium text-brand">{n.title}</p>}
                    <p className="text-sm text-gray-800 mt-0.5">{n.message}</p>
                    <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt?.seconds * 1000).toLocaleString()}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
} 