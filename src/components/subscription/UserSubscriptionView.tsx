import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useSubscription } from '@/lib/useSubscription';
import RecruiterSubscriptionTab from './RecruiterSubscriptionTab';

/** The Subscription page for job seekers: current plan, available user plans, request history. */
export default function UserSubscriptionView() {
    const [userId, setUserId] = useState<string | null>(auth.currentUser?.uid ?? null);
    useEffect(() => onAuthStateChanged(auth, (user) => setUserId(user?.uid ?? null)), []);
    const subscription = useSubscription(userId, 'user');
    return <RecruiterSubscriptionTab userId={userId} subscription={subscription} audience="user" />;
}
