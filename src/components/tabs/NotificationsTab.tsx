import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collectionGroup, onSnapshot, updateDoc } from 'firebase/firestore';

interface Notification {
  id: string;
  message: string;
  createdAt: any;
  viewed: boolean;
  ref: any;
  name?: string;
  email?: string;
}

export default function NotificationsTab() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const q = collectionGroup(db, 'notifications');
    const unsub = onSnapshot(q, (snap) => {
      const list: Notification[] = [];
      snap.forEach((docSnap) => {
        const data: any = docSnap.data();
        list.push({ id: docSnap.id, ref: docSnap.ref, ...data });
      });
      list.sort((a,b)=> (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      setNotifications(list);
      // Mark all as viewed
      list.forEach((n) => {
        if (!n.viewed) updateDoc(n.ref, { viewed: true });
      });
    });
    return () => unsub();
  }, []);

  return (
    <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
      <div className="px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Notifications ({notifications.length})</h2>
      </div>
      {notifications.length === 0 ? (
        <p className="p-6 text-gray-600">No notifications.</p>
      ) : (
        <ul>
          {notifications.map((n) => (
            <li key={n.id} className="px-6 py-4 hover:bg-gray-50">
              <p className="text-sm font-medium text-primary-700">{n.name} {n.email && <span className='text-gray-500'>({n.email})</span>}</p>
              <p className="text-sm text-gray-800 mt-0.5">{n.message}</p>
              <p className="text-xs text-gray-400 mt-1">{new Date(n.createdAt?.seconds * 1000).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
} 