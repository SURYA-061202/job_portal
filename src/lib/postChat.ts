import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from './firebase';
import { createNotification } from './notificationHelper';
import { toMillis } from './profileViews';
import type { MessagingProfile } from './messaging';

/**
 * Chats about one job post: a job seeker writes to the recruiter who published
 * the post (not to the admin). Each seeker has one thread per post, with the id
 * `${postId}_${seekerUid}`, so the seeker's thread can be addressed without a
 * lookup. The recruiter sees every thread opened on their posts.
 */
export type PostSenderRole = 'user' | 'recruiter';

export interface PostThread {
    /** `${postId}_${userId}`. */
    id: string;
    postId: string;
    postTitle: string;
    companyName?: string;
    recruiterId: string;
    recruiterName: string;
    recruiterEmail: string;
    userId: string;
    userName: string;
    userEmail: string;
    lastMessage?: string;
    lastMessageAt?: unknown;
    lastSenderId?: string;
    lastSenderRole?: PostSenderRole;
    /** When the job seeker last opened the thread. */
    userReadAt?: unknown;
    /** When the recruiter last opened it. */
    recruiterReadAt?: unknown;
    createdAt?: unknown;
}

export interface PostChatMessage {
    id: string;
    senderId: string;
    senderRole: PostSenderRole;
    text: string;
    createdAt?: unknown;
}

/** The post (and its recruiter) a chat is about; enough to start a thread. */
export interface PostChatTarget {
    postId: string;
    postTitle: string;
    companyName?: string;
    recruiterId: string;
    recruiterName: string;
    /** Older posts did not store it; it is looked up from the recruiter's profile when missing. */
    recruiterEmail?: string;
}

const MAX_POST_MESSAGE = 2000;

const snapOptions = { serverTimestamps: 'estimate' } as const;
const threadRef = (id: string) => doc(db, 'post_threads', id);

export const postThreadId = (postId: string, userId: string) => `${postId}_${userId}`;

/** Recruiters and managers answer chats; everyone else (except the admin) asks them. */
export const answersPostChats = (profile: MessagingProfile) => profile.userRole === 'recruiter' || profile.userRole === 'manager';

const sortByRecent = (list: PostThread[]) =>
    list.filter(t => t.lastMessageAt).sort((a, b) => toMillis(b.lastMessageAt) - toMillis(a.lastMessageAt));

const toThread = (d: { id: string; data: (o: typeof snapOptions) => unknown }) => ({ id: d.id, ...(d.data(snapOptions) as object) }) as PostThread;

/**
 * Sends a message in a post chat. The job seeker's first message creates the
 * thread from `target`; the recruiter replies into the existing `thread`.
 * One notification goes out when the other side's turn begins.
 */
export async function sendPostMessage(
    profile: MessagingProfile,
    threadId: string,
    thread: PostThread | null,
    target: PostChatTarget | null,
    text: string,
): Promise<void> {
    const body = text.trim().slice(0, MAX_POST_MESSAGE);
    if (!body) return;

    let head = thread;
    if (!head) {
        if (!target) throw new Error('Missing post for the chat.');
        let recruiterEmail = (target.recruiterEmail || '').trim().toLowerCase();
        if (!recruiterEmail) {
            try {
                const snap = await getDoc(doc(db, 'users', target.recruiterId));
                recruiterEmail = String(snap.data()?.email || '').trim().toLowerCase();
            } catch (err) {
                console.warn('Could not look up the recruiter email:', err);
            }
        }
        const fresh = {
            postId: target.postId,
            postTitle: target.postTitle,
            ...(target.companyName ? { companyName: target.companyName } : {}),
            recruiterId: target.recruiterId,
            recruiterName: target.recruiterName,
            recruiterEmail,
            userId: profile.uid,
            userName: profile.name,
            userEmail: profile.email,
        };
        await setDoc(threadRef(threadId), { ...fresh, createdAt: serverTimestamp() });
        head = { id: threadId, ...fresh };
    }

    const role: PostSenderRole = profile.uid === head.recruiterId ? 'recruiter' : 'user';
    await addDoc(collection(db, 'post_threads', threadId, 'messages'), {
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
        [role === 'recruiter' ? 'recruiterReadAt' : 'userReadAt']: serverTimestamp(),
    });

    if (thread?.lastSenderRole === role) return;
    try {
        const to = role === 'recruiter' ? head.userEmail : head.recruiterEmail;
        if (!to) return;
        const preview = body.length > 100 ? `${body.slice(0, 100)}…` : body;
        await createNotification({
            userId: to,
            type: 'new_message',
            title: `New message about ${head.postTitle}`,
            message: `${profile.name}: ${preview}`,
            metadata: { postThreadId: threadId, postId: head.postId },
        });
    } catch (err) {
        console.warn('Could not notify of new post message:', err);
    }
}

export const markPostRead = (threadId: string, asRecruiter: boolean) =>
    updateDoc(threadRef(threadId), { [asRecruiter ? 'recruiterReadAt' : 'userReadAt']: serverTimestamp() })
        .catch(err => console.warn('Could not mark post chat read:', err));

/** Whether the other side wrote last and the viewer has not opened the thread since. */
export function isPostThreadUnread(thread: PostThread, asRecruiter: boolean): boolean {
    const theirRole: PostSenderRole = asRecruiter ? 'user' : 'recruiter';
    if (thread.lastSenderRole !== theirRole) return false;
    return toMillis(thread.lastMessageAt) > toMillis(asRecruiter ? thread.recruiterReadAt : thread.userReadAt);
}

/** Job seeker: their chats on every post they wrote about, most recent first. */
export function subscribeUserPostThreads(uid: string, onData: (list: PostThread[]) => void, onError?: (err: unknown) => void): () => void {
    return onSnapshot(
        query(collection(db, 'post_threads'), where('userId', '==', uid)),
        snap => onData(sortByRecent(snap.docs.map(toThread))),
        err => { console.error("Post chats listener failed:", err); onError?.(err); },
    );
}

/** Recruiter: the chats job seekers opened on their posts, most recent first. */
export function subscribeRecruiterPostThreads(uid: string, onData: (list: PostThread[]) => void, onError?: (err: unknown) => void): () => void {
    return onSnapshot(
        query(collection(db, 'post_threads'), where('recruiterId', '==', uid)),
        snap => onData(sortByRecent(snap.docs.map(toThread))),
        err => { console.error("Post chats listener failed:", err); onError?.(err); },
    );
}

export function subscribePostMessages(threadId: string, onData: (list: PostChatMessage[]) => void): () => void {
    return onSnapshot(
        query(collection(db, 'post_threads', threadId, 'messages'), orderBy('createdAt', 'asc')),
        snap => onData(snap.docs.map(d => ({ id: d.id, ...d.data(snapOptions) }) as PostChatMessage)),
        err => console.error('Post messages listener failed:', err),
    );
}

/** Number of post chats with a reply waiting for this person; added to the badge on the Messages icon. */
export function useUnreadPostChats(profile: MessagingProfile | null): number {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (!profile || profile.isAdmin) return;
        const asRecruiter = answersPostChats(profile);
        const subscribe = asRecruiter ? subscribeRecruiterPostThreads : subscribeUserPostThreads;
        return subscribe(profile.uid, list => setCount(list.filter(t => isPostThreadUnread(t, asRecruiter)).length));
    }, [profile]);
    return profile && !profile.isAdmin ? count : 0;
}
