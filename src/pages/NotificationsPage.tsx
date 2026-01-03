import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import UserHeader from '@/components/layout/UserHeader';
import { Bell, CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';

interface Notification {
    id: string;
    type: 'success' | 'warning' | 'info';
    title: string;
    message: string;
    time: string;
    read: boolean;
    createdAt: any;
}

export default function NotificationsPage() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                await fetchNotifications(user.email!);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const fetchNotifications = async (email: string) => {
        try {
            setLoading(true);
            const notificationsRef = collection(db, 'notifications');
            const q = query(
                notificationsRef,
                where('userId', '==', email),
                orderBy('createdAt', 'desc')
            );

            const snapshot = await getDocs(q);
            const notificationsData = snapshot.docs.map(doc => {
                const data = doc.data();
                const createdAt = data.createdAt?.toDate?.() || new Date();

                return {
                    id: doc.id,
                    type: getNotificationType(data.type),
                    title: data.title,
                    message: data.message,
                    time: formatTimeAgo(createdAt),
                    read: data.read || false,
                    createdAt: data.createdAt,
                } as Notification;
            });

            setNotifications(notificationsData);
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            setLoading(false);
        }
    };

    const getNotificationType = (type: string): 'success' | 'warning' | 'info' => {
        if (type === 'congratulations') return 'success';
        if (type === 'verify_details') return 'warning';
        return 'info';
    };

    const formatTimeAgo = (date: Date): string => {
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
        return date.toLocaleDateString();
    };

    const markAsRead = async (notificationId: string) => {
        try {
            await updateDoc(doc(db, 'notifications', notificationId), {
                read: true,
            });

            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
            );
        } catch (error) {
            console.error('Error marking notification as read:', error);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <UserHeader />

            <main className="flex-1 w-full px-6 lg:px-12 py-8">
                {/* Page Header */}
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 mb-2">Notifications</h1>
                    <p className="text-gray-600">Stay updated with your application status and new opportunities</p>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <Loader2 className="w-12 h-12 text-primary-600 animate-spin mb-4" />
                        <p className="text-gray-500 font-medium">Loading notifications...</p>
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
                        <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Bell className="w-10 h-10 text-gray-400" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">No Notifications</h3>
                        <p className="text-gray-500 max-w-md mx-auto">
                            You're all caught up! We'll notify you when there are updates on your applications or new job opportunities.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {notifications.map((notification) => (
                            <div
                                key={notification.id}
                                onClick={() => !notification.read && markAsRead(notification.id)}
                                className={`bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-all cursor-pointer ${!notification.read ? 'border-l-4 border-l-primary-500' : ''
                                    }`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${notification.type === 'success' ? 'bg-green-100' :
                                        notification.type === 'warning' ? 'bg-orange-100' :
                                            'bg-blue-100'
                                        }`}>
                                        {notification.type === 'success' ? (
                                            <CheckCircle2 className="w-5 h-5 text-green-600" />
                                        ) : notification.type === 'warning' ? (
                                            <AlertCircle className="w-5 h-5 text-orange-600" />
                                        ) : (
                                            <Info className="w-5 h-5 text-blue-600" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <h4 className="font-bold text-gray-900 mb-1">{notification.title}</h4>
                                            {!notification.read && (
                                                <span className="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-2"></span>
                                            )}
                                        </div>
                                        <p className="text-gray-600 text-sm mb-2">{notification.message}</p>
                                        <span className="text-xs text-gray-400">{notification.time}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
