import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Crown, Loader2, CheckCircle, Clock, XCircle } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { createPremiumRequestNotification } from '@/lib/notificationHelper';
import toast from 'react-hot-toast';
import type { PremiumRequestStatus } from '@/types';
import { useSkin, FOCUS } from '@/styles/skin';

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
    const skin = useSkin();

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
            <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} w-full max-w-md`}>
                {/* Header */}
                <div className="bg-brand px-6 py-5 rounded-t-2xl flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                            <Crown className="w-5 h-5 text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-white">Premium Access</h3>
                    </div>
                    <button onClick={onClose} className={`p-1 hover:bg-white/20 ${skin.radius} cursor-pointer transition-colors ${FOCUS}`}>
                        <X className="w-5 h-5 text-white" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6">
                    {currentStatus === 'pending' ? (
                        <div className="text-center py-4">
                            <div className={`w-16 h-16 ${skin.canvas} rounded-full flex items-center justify-center mx-auto mb-4`}>
                                <Clock className="w-8 h-8 text-ink/60" />
                            </div>
                            <h4 className={`${skin.cardTitle} mb-2`}>Request Pending</h4>
                            <p className={`${skin.body} mb-4`}>
                                Your premium access request is already submitted and waiting for admin approval.
                            </p>
                            {admin && (
                                <div className={`border ${skin.edge} ${skin.canvas} ${skin.radius} p-4 mt-4`}>
                                    <p className={`mb-1 ${skin.micro}`}>Sent to</p>
                                    <p className="text-sm font-medium text-ink">{admin.firstName} {admin.lastName}</p>
                                    <p className={skin.meta}>{admin.email}</p>
                                </div>
                            )}
                        </div>
                    ) : currentStatus === 'approved' ? (
                        <div className="text-center py-4">
                            <div className="w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="w-8 h-8 text-brand" />
                            </div>
                            <h4 className={`${skin.cardTitle} mb-2`}>Premium Active</h4>
                            <p className={skin.body}>
                                You have premium access. You can post unlimited jobs.
                            </p>
                        </div>
                    ) : currentStatus === 'rejected' ? (
                        <div className="text-center py-4">
                            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                <XCircle className="w-8 h-8 text-destructive" />
                            </div>
                            <h4 className={`${skin.cardTitle} mb-2`}>Request Declined</h4>
                            <p className={`${skin.body} mb-4`}>
                                Your previous premium request was declined. You can submit a new request.
                            </p>
                            {admin && (
                                <div className={`border ${skin.edge} ${skin.canvas} ${skin.radius} p-4 mb-4`}>
                                    <p className={`mb-1 ${skin.micro}`}>Contact Admin</p>
                                    <p className="text-sm font-medium text-ink">{admin.firstName} {admin.lastName}</p>
                                    <p className={skin.meta}>{admin.email}</p>
                                </div>
                            )}
                            <button
                                onClick={handleRequestPremium}
                                disabled={loading || fetchingAdmin}
                                className={`w-full inline-flex items-center justify-center gap-2 cursor-pointer ${skin.cta} ${FOCUS} disabled:opacity-50`}
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
                                <div className="w-16 h-16 bg-brand/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Crown className="w-8 h-8 text-brand" />
                                </div>
                                <h4 className={`${skin.cardTitle} mb-2`}>Post Limit Reached</h4>
                                <p className={skin.body}>
                                    You've reached the free limit of 5 posts. Request premium access from admin to post more jobs.
                                </p>
                            </div>

                            {fetchingAdmin ? (
                                <div className="flex justify-center py-4">
                                    <Loader2 className="w-6 h-6 animate-spin text-ink/40" />
                                </div>
                            ) : admin ? (
                                <div className={`border ${skin.edge} ${skin.canvas} ${skin.radius} p-4 mb-6`}>
                                    <p className={`mb-2 ${skin.micro}`}>Your Admin</p>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-brand/20 rounded-full flex items-center justify-center text-brand font-bold text-sm">
                                            {admin.firstName?.[0]}{admin.lastName?.[0]}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-ink">{admin.firstName} {admin.lastName}</p>
                                            <p className={skin.meta}>{admin.email}</p>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className={`border ${skin.edge} ${skin.canvas} ${skin.radius} p-4 mb-6 text-center`}>
                                    <p className={skin.body}>No admin found. Contact support.</p>
                                </div>
                            )}

                            <button
                                onClick={handleRequestPremium}
                                disabled={loading || fetchingAdmin || !admin}
                                className={`w-full inline-flex items-center justify-center gap-2 cursor-pointer ${skin.cta} ${FOCUS} disabled:opacity-50`}
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
                        className={`w-full cursor-pointer ${skin.secondary} ${FOCUS}`}
                    >
                        {currentStatus === 'pending' || currentStatus === 'approved' ? 'Close' : 'Maybe Later'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
