import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collectionGroup, onSnapshot, updateDoc } from 'firebase/firestore';

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

  const unreadCount = notifications.filter(n => !n.viewed).length;

  useEffect(() => {
    const q = collectionGroup(db, 'notifications');
    const unsub = onSnapshot(q, (snap) => {
      const list: Notification[] = [];
      snap.forEach(docSnap => {
        const data: any = docSnap.data();
        list.push({ id: docSnap.id, ref: docSnap.ref, ...data });
      });
      // sort by createdAt desc client-side
      list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setNotifications(list);
    });
    return () => unsub();
  }, []);

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent parent click
    setOpen((prev) => !prev);
    // If opening, mark unread as viewed
    if (!open) {
      const batch: Promise<any>[] = [];
      notifications.forEach(n => {
        if (!n.viewed) {
          batch.push(updateDoc(n.ref, { viewed: true }));
        }
      });
      if (batch.length) {
        try { await Promise.all(batch); } catch (err) { console.error(err); }
      }
    }
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
      <button onClick={handleToggle} className={`relative p-2 rounded-full hover:bg-primary-50 ${className}`}>
        <Bell className="h-5 w-5 text-primary-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs rounded-full px-1.5">{unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border border-gray-200 rounded-md shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="px-4 py-2 border-b flex justify-between items-center">
            <span className="font-semibold text-gray-700">Notifications</span>
            <span className="text-sm text-gray-500">{notifications.length}</span>
          </div>
          {notifications.length === 0 ? (
            <p className="p-4 text-sm text-gray-600">No notifications</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {notifications.map((n) => (
                <li key={n.id} className="p-3 text-sm text-gray-700 hover:bg-gray-50">
                  {n.message}
                  <div className="text-xs text-gray-400 mt-1">{new Date(n.createdAt?.seconds * 1000).toLocaleString()}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
} 