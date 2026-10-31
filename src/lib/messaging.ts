import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { auth, db } from './firebase';
import { createNotification } from './notificationHelper';
import { toMillis } from './profileViews';

/**
 * Support messaging between the admin and everyone else (job seekers and
 * recruiters). Each person has one thread with the admin, keyed by their own
 * user id, and can write to the admin at any time. The admin sees every thread.
 */
export type SenderRole = 'admin' | 'user';

export interface SupportThread {
    /** The person's user id; the thread document uses the same id. */
    id: string;
    userId: string;
    userName: string;
    /** Their account role: 'user', 'recruiter' or 'manager'. */
    userRole: string;
    userEmail: string;
    companyName?: string;
    lastMessage?: string;
    lastMessageAt?: unknown;
    lastSenderId?: string;
    lastSenderRole?: SenderRole;
    /** When the person last opened the thread. */
    readAt?: unknown;
    /** When any admin last opened it. */
    adminReadAt?: unknown;
    createdAt?: unknown;
}

export interface ChatMessage {
    id: string;
    senderId: string;
    senderRole: SenderRole;
    text: string;
    createdAt?: unknown;
}

/** Details of the signed-in person, kept on their thread so the admin knows who is writing. */
export interface MessagingProfile {
    uid: string;
    isAdmin: boolean;
    name: string;
    email: string;
    userRole: string;
    companyName?: string;
}

export const MAX_MESSAGE = 2000;

const threadRef = (id: string) => doc(db, 'support_threads', id);

const snapOptions = { serverTimestamps: 'estimate' } as const;

/** Name, email and role of the signed-in person, for the thread header and for the admin. */
export async function loadMessagingProfile(uid: string): Promise<MessagingProfile> {
    const snap = await getDoc(doc(db, 'users', uid));
    const d = snap.exists() ? snap.data() : {};
    const role = String(d.role || 'user');
    return {
        uid,
        isAdmin: role === 'admin',
        name: `${d.firstName || ''} ${d.lastName || ''}`.trim() || String(d.name || d.email || 'User'),
        email: String(d.email || auth.currentUser?.email || '').toLowerCase(),
        userRole: role,
        companyName: d.companyName ? String(d.companyName) : undefined,
    };
}

async function adminEmails(): Promise<string[]> {
    const snap = await getDocs(query(collection(db, 'users'), where('role', '==', 'admin')));
    return snap.docs.map(d => String(d.data().email || '').trim().toLowerCase()).filter(Boolean);
}

/**
 * Sends a message in a thread. A member's first message creates their thread.
 * `thread` is null until it exists. One notification goes out when the other
 * side's turn begins, not one per message.
 */
export async function sendMessage(profile: MessagingProfile, threadId: string, thread: SupportThread | null, text: string): Promise<void> {
    const body = text.trim().slice(0, MAX_MESSAGE);
    if (!body) return;
    const role: SenderRole = profile.isAdmin ? 'admin' : 'user';

    if (!thread && !profile.isAdmin) {
        await setDoc(threadRef(threadId), {
            userId: profile.uid,
            userName: profile.name,
            userRole: profile.userRole,
            userEmail: profile.email,
            ...(profile.companyName ? { companyName: profile.companyName } : {}),
            createdAt: serverTimestamp(),
        });
    }

    await addDoc(collection(db, 'support_threads', threadId, 'messages'), {
        senderId: profile.uid,
        senderRole: role,
        text: body,
        createdAt: serverTimestamp(),
    });
    await updateDoc(threadRef(threadId), {
        lastMessage: body.slice(0, 140),
        lastMessageAt: serverTimestamp(),
        lastSenderId: profile.uid,
        lastSenderRole: role,
        [profile.isAdmin ? 'adminReadAt' : 'readAt']: serverTimestamp(),
    });

    if (thread?.lastSenderRole === role) return;
    try {
        const preview = body.length > 100 ? `${body.slice(0, 100)}…` : body;
        const recipients = profile.isAdmin ? [thread?.userEmail ?? ''] : await adminEmails();
        const from = profile.isAdmin ? 'Admin' : profile.name;
        for (const to of recipients.filter(Boolean)) {
            await createNotification({
                userId: to,
                type: 'new_message',
                title: `New message from ${from}`,
                message: preview,
                metadata: { threadId },
            });
        }
    } catch (err) {
        console.warn('Could not notify of new message:', err);
    }
}

export const markRead = (threadId: string, asAdmin: boolean) =>
    updateDoc(threadRef(threadId), { [asAdmin ? 'adminReadAt' : 'readAt']: serverTimestamp() })
        .catch(err => console.warn('Could not mark read:', err));

/** Whether the other side wrote last and the viewer has not opened the thread since. */
export function isUnread(thread: SupportThread, asAdmin: boolean): boolean {
    const theirRole: SenderRole = asAdmin ? 'user' : 'admin';
    if (thread.lastSenderRole !== theirRole) return false;
    return toMillis(thread.lastMessageAt) > toMillis(asAdmin ? thread.adminReadAt : thread.readAt);
}

/** Admin: every member's thread, most recent activity first. */
export function subscribeThreads(onData: (list: SupportThread[]) => void): () => void {
    return onSnapshot(
        collection(db, 'support_threads'),
        snap => onData(snap.docs
            .map(d => ({ id: d.id, ...d.data(snapOptions) }) as SupportThread)
            .filter(t => t.lastMessageAt)
            .sort((a, b) => toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt))),
        err => console.error('Threads listener failed:', err),
    );
}

/** Member: their own thread with the admin, or null before the first message. */
export function subscribeThread(uid: string, onData: (thread: SupportThread | null) => void): () => void {
    return onSnapshot(
        threadRef(uid),
        snap => onData(snap.exists() ? ({ id: snap.id, ...snap.data(snapOptions) }) as SupportThread : null),
        err => console.error('Thread listener failed:', err),
    );
}

export function subscribeMessages(threadId: string, onData: (list: ChatMessage[]) => void): () => void {
    return onSnapshot(
        query(collection(db, 'support_threads', threadId, 'messages'), orderBy('createdAt', 'asc')),
        snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data(snapOptions) }) as ChatMessage)),
        err => console.error('Messages listener failed:', err),
    );
}

/** The signed-in person's messaging profile, once loaded. */
export function useMessagingProfile(uid: string | null | undefined): MessagingProfile | null {
    const [profile, setProfile] = useState<MessagingProfile | null>(null);
    useEffect(() => {
        if (!uid) return;
        let cancelled = false;
        loadMessagingProfile(uid)
            .then(p => { if (!cancelled) setProfile(p); })
            .catch(err => console.error('Could not load messaging profile:', err));
        return () => { cancelled = true; };
    }, [uid]);
    return uid ? profile : null;
}

/** Number of threads with something new for this person; drives the badge on the Messages icon. */
export function useUnreadMessages(profile: MessagingProfile | null): number {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (!profile) return;
        if (profile.isAdmin) return subscribeThreads(list => setCount(list.filter(t => isUnread(t, true)).length));
        return subscribeThread(profile.uid, t => setCount(t && isUnread(t, false) ? 1 : 0));
    }, [profile]);
    return profile ? count : 0;
}
