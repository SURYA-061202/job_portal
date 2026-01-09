import { useEffect, useState } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, updateDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

interface Notification {
  id: string;
  message: string;
  createdAt: any;
  viewed: boolean;
  ref: any;
  title?: string;
  userId?: string;
}

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
        if (!n.viewed) updateDoc(n.ref, { viewed: true });
      });
    });
    return () => unsub();
  }, [currentUserEmail]);

  return (
    <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
      <div className="px-4 sm:px-6 py-4">
        <h2 className="text-base sm:text-lg font-semibold text-gray-900">Notifications ({notifications.length})</h2>
      </div>
      {notifications.length === 0 ? (
        <p className="p-4 sm:p-6 text-gray-600 text-sm sm:text-base">No notifications.</p>
      ) : (
        <ul>
          {notifications.map((n) => (
            <li key={n.id} className="px-4 sm:px-6 py-4 hover:bg-gray-50">
              {n.title && <p className="text-sm font-medium text-primary-700">{n.title}</p>}
              <p className="text-sm text-gray-800 mt-0.5">{n.message}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt?.seconds * 1000).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
} 