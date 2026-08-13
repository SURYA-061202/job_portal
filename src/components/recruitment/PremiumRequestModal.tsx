import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Crown, Loader2, CheckCircle, Clock, XCircle } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { createPremiumRequestNotification } from '@/lib/notificationHelper';
import toast from 'react-hot-toast';
import type { PremiumRequestStatus } from '@/types';

interface PremiumRequestModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentStatus: PremiumRequestStatus;
    onStatusChange: (status: PremiumRequestStatus) => void;
}

interface AdminUser {
    firstName: string;
    lastName: string;
    email: string;
}

export default function PremiumRequestModal({ isOpen, onClose, currentStatus, onStatusChange }: PremiumRequestModalProps) {
    const [loading, setLoading] = useState(false);
    const [admin, setAdmin] = useState<AdminUser | null>(null);
    const [fetchingAdmin, setFetchingAdmin] = useState(true);

    useEffect(() => {
        if (!isOpen) return;
        const fetchAdmin = async () => {
            try {
                setFetchingAdmin(true);
                const q = query(collection(db, 'users'), where('role', '==', 'admin'));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const adminDoc = snapshot.docs[0];
                    const data = adminDoc.data();
                    setAdmin({
                        firstName: data.firstName || '',
                        lastName: data.lastName || '',
                        email: data.email || '',
                    });
                }
            } catch (error) {
                console.error('Error fetching admin:', error);
            } finally {
                setFetchingAdmin(false);
            }
        };
        fetchAdmin();
    }, [isOpen]);

    const handleRequestPremium = async () => {
        const user = auth.currentUser;
        if (!user || !admin) return;

        setLoading(true);
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            const userData = userDoc.data();
            const userName = `${userData?.firstName || ''} ${userData?.lastName || ''}`.trim();

            await updateDoc(doc(db, 'users', user.uid), {
                premiumRequestStatus: 'pending',
                premiumRequestedAt: serverTimestamp(),
            });

            await createPremiumRequestNotification(admin.email, userName, user.email || '');

            onStatusChange('pending');
            toast.success('Premium request sent to admin!');
            onClose();
        } catch (error) {
            console.error('Error requesting premium:', error);
            toast.error('Failed to send premium request');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
                {/* Header */}
                <div className="bg-brand px-6 py-5 rounded-t-2xl flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                            <Crown className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-white">Premium Access</h3>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                        <X className="w-5 h-5 text-white" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    {currentStatus === 'pending' ? (
                        <div className="text-center py-4">
                            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Clock className="w-8 h-8 text-amber-600" />
                            </div>
                            <h4 className="text-lg font-bold text-gray-900 mb-2">Request Pending</h4>
                            <p className="text-sm text-gray-500 mb-4">
                                Your premium access request is already submitted and waiting for admin approval.
                            </p>
                            {admin && (
                                <div className="bg-gray-50 rounded-lg p-4 mt-4">
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Sent to</p>
                                    <p className="text-sm font-medium text-gray-900">{admin.firstName} {admin.lastName}</p>
                                    <p className="text-xs text-gray-500">{admin.email}</p>
                                </div>
                            )}
                        </div>
                    ) : currentStatus === 'approved' ? (
                        <div className="text-center py-4">
                            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-8 h-8 text-green-600" />
                            </div>
                            <h4 className="text-lg font-bold text-gray-900 mb-2">Premium Active</h4>
                            <p className="text-sm text-gray-500">
                                You have premium access. You can post unlimited jobs.
                            </p>
                        </div>
                    ) : currentStatus === 'rejected' ? (
                        <div className="text-center py-4">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <XCircle className="w-8 h-8 text-red-600" />
                            </div>
                            <h4 className="text-lg font-bold text-gray-900 mb-2">Request Declined</h4>
                            <p className="text-sm text-gray-500 mb-4">
                                Your previous premium request was declined. You can submit a new request.
                            </p>
                            {admin && (
                                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Contact Admin</p>
                                    <p className="text-sm font-medium text-gray-900">{admin.firstName} {admin.lastName}</p>
                                    <p className="text-xs text-gray-500">{admin.email}</p>
                                </div>
                            )}
                            <button
                                onClick={handleRequestPremium}
                                disabled={loading || fetchingAdmin}
                                className="w-full py-3 bg-brand text-white font-bold rounded-lg hover:shadow-lg hover:shadow-brand/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                                ) : (
                                    <><Crown className="w-4 h-4" /> Request Premium Again</>
                                )}
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Crown className="w-8 h-8 text-amber-600" />
                                </div>
                                <h4 className="text-lg font-bold text-gray-900 mb-2">Post Limit Reached</h4>
                                <p className="text-sm text-gray-500">
                                    You've reached the free limit of 5 posts. Request premium access from admin to post more jobs.
                                </p>
                            </div>

                            {fetchingAdmin ? (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                                </div>
                            ) : admin ? (
                                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-2">Your Admin</p>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-brand/20 rounded-full flex items-center justify-center text-brand font-bold text-sm">
                                            {admin.firstName?.[0]}{admin.lastName?.[0]}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{admin.firstName} {admin.lastName}</p>
                                            <p className="text-xs text-gray-500">{admin.email}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-gray-50 rounded-lg p-4 mb-6 text-center">
                                    <p className="text-sm text-gray-500">No admin found. Contact support.</p>
                                </div>
                            )}

                            <button
                                onClick={handleRequestPremium}
                                disabled={loading || fetchingAdmin || !admin}
                                className="w-full py-3 bg-brand text-white font-bold rounded-lg hover:shadow-lg hover:shadow-brand/20 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending Request...</>
                                ) : (
                                    <><Crown className="w-4 h-4" /> Get Premium</>
                                )}
                            </button>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-6">
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all"
                    >
                        {currentStatus === 'pending' || currentStatus === 'approved' ? 'Close' : 'Maybe Later'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
