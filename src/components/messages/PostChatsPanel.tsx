import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { Briefcase, Search, Users } from 'lucide-react';
import { db } from '@/lib/firebase';
import type { MessagingProfile } from '@/lib/messaging';
import {
    isPostThreadUnread, markPostRead, postThreadId, sendPostMessage, subscribePostMessages,
    subscribeRecruiterPostThreads, subscribeUserPostThreads,
    type PostChatTarget, type PostThread,
} from '@/lib/postChat';
import { timeAgo, toMillis } from '@/lib/profileViews';
import type { RecruitmentRequest } from '@/types';
import { initials } from '@/lib/format';
import ThreadView from '@/components/messages/ThreadView';
import { useSkin, FOCUS } from '@/styles/skin';

const POST_LIMIT = 150;

const chatsHint = (err: unknown) =>
    (err as { code?: string })?.code === 'permission-denied'
        ? 'Chats are blocked by the database rules. The updated Firestore rules need to be deployed.'
        : 'Could not load your chats. Please try again.';

const loadingBlock = <div className="m-4 flex-1 animate-pulse rounded-xl bg-muted" aria-busy="true" />;

interface PostRow {
    target: PostChatTarget;
    thread?: PostThread;
}

const targetOf = (p: RecruitmentRequest & { id: string }): PostChatTarget | null =>
    p.recruiterId
        ? {
            postId: p.id,
            postTitle: p.jobTitle,
            companyName: p.companyName,
            recruiterId: p.recruiterId,
            recruiterName: p.recruiterName || 'Recruiter',
            recruiterEmail: p.recruiterEmail,
        }
        : null;

interface ChatProps {
    profile: MessagingProfile;
    threadId: string;
    thread: PostThread | null;
    target: PostChatTarget | null;
    asRecruiter: boolean;
    title: string;
    subtitle: string;
    emptyText: string;
    onBack: () => void;
}

/** One post chat, seen from either side. */
function PostChat({ profile, threadId, thread, target, asRecruiter, title, subtitle, emptyText, onBack }: ChatProps) {
    return (
        <ThreadView
            viewerId={profile.uid}
            threadId={threadId}
            subscribe={cb => subscribePostMessages(threadId, cb)}
            onSend={text => sendPostMessage(profile, threadId, thread, target, text)}
            unread={!!thread && isPostThreadUnread(thread, asRecruiter)}
            onRead={() => void markPostRead(threadId, asRecruiter)}
            avatar={initials(title)}
            title={title}
            subtitle={subtitle}
            emptyText={emptyText}
            onBack={onBack}
        />
    );
}

const lastLine = (t: PostThread, mineRole: 'user' | 'recruiter') => `${t.lastSenderRole === mineRole ? 'You: ' : ''}${t.lastMessage ?? ''}`;

/**
 * Job seeker: the posted jobs. Opening one starts (or continues) a chat with the
 * recruiter who published it. Posts already written about show their last message.
 */
export function PostsPanel({ profile }: { profile: MessagingProfile }) {
    const skin = useSkin();
    const [posts, setPosts] = useState<(RecruitmentRequest & { id: string })[] | null>(null);
    const [threads, setThreads] = useState<PostThread[] | null>(null);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [activeId, setActiveId] = useState<string | null>(null);
    const [chatsError, setChatsError] = useState('');

    useEffect(() => {
        let cancelled = false;
        getDocs(query(collection(db, 'recruits'), orderBy('createdAt', 'desc'), limit(POST_LIMIT)))
            .then(snap => { if (!cancelled) setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() }) as RecruitmentRequest & { id: string })); })
            .catch(err => {
                console.error('Could not load posts:', err);
                if (!cancelled) setError('Could not load the job posts. Please try again.');
            });
        return () => { cancelled = true; };
    }, []);
    useEffect(() => subscribeUserPostThreads(profile.uid, setThreads, err => {
        // Show the posts anyway; only the chat history is missing.
        setThreads([]);
        setChatsError(chatsHint(err));
    }), [profile.uid]);

    const rows = useMemo<PostRow[]>(() => {
        if (!posts || !threads) return [];
        const byPost = new Map(threads.map(t => [t.postId, t]));
        const out: PostRow[] = [];
        const seen = new Set<string>();
        for (const p of posts) {
            const target = targetOf(p);
            if (!target) continue;
            seen.add(p.id);
            out.push({ target, thread: byPost.get(p.id) });
        }
        // Chats on posts that are gone, or older than the list above, stay reachable.
        for (const t of threads) {
            if (seen.has(t.postId)) continue;
            out.push({
                target: { postId: t.postId, postTitle: t.postTitle, companyName: t.companyName, recruiterId: t.recruiterId, recruiterName: t.recruiterName, recruiterEmail: t.recruiterEmail },
                thread: t,
            });
        }
        // Chats in progress first (most recent on top), then the rest in post order.
        return [...out.filter(r => r.thread), ...out.filter(r => !r.thread)];
    }, [posts, threads]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r => [r.target.postTitle, r.target.companyName, r.target.recruiterName].some(v => v?.toLowerCase().includes(q)));
    }, [rows, search]);

    if (error) return <p role="alert" className="m-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">{error}</p>;
    if (!posts || !threads) return loadingBlock;

    const active = activeId ? rows.find(r => r.target.postId === activeId) : undefined;
    if (active) {
        const { target } = active;
        return (
            <PostChat
                profile={profile}
                threadId={postThreadId(target.postId, profile.uid)}
                thread={active.thread ?? null}
                target={target}
                asRecruiter={false}
                title={target.recruiterName}
                subtitle={[target.postTitle, target.companyName].filter(Boolean).join(' · ')}
                emptyText={`Ask ${target.recruiterName} about this role. You will get a notification when they reply.`}
                onBack={() => setActiveId(null)}
            />
        );
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div className={`shrink-0 border-b ${skin.edge} p-3`}>
                <label className="relative block">
                    <span className="sr-only">Search posts</span>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" aria-hidden="true" />
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search posts, companies or recruiters"
                        className={`h-10 w-full rounded-xl border ${skin.edge} bg-surface pl-9 pr-3 text-sm text-ink ${FOCUS}`}
                    />
                </label>
                {chatsError && <p role="alert" className="mt-3rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{chatsError}</p>}
            </div>

            {filtered.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                    <Briefcase className="h-8 w-8 text-ink/30" aria-hidden="true" />
                    <p className="mt-3 text-base font-bold text-ink">{rows.length === 0 ? 'No posts yet' : 'No matching posts'}</p>
                    <p className={`mt-1 ${skin.body}`}>{rows.length === 0 ? 'Job posts will show up here as recruiters publish them.' : 'Try a different search.'}</p>
                </div>
            ) : (
                <ul className={`thin-scrollbar min-h-0 flex-1 divide-y ${skin.divide} overflow-y-auto`}>
                    {filtered.map(({ target, thread }) => {
                        const unread = !!thread && isPostThreadUnread(thread, false);
                        return (
                            <li key={target.postId}>
                                <button type="button" onClick={() => setActiveId(target.postId)}
                                    className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/[0.03] ${FOCUS}`}>
                                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/70 text-xs font-bold text-surface">{initials(target.recruiterName)}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center justify-between gap-2">
                                            <span className={`truncate text-sm ${unread ? 'font-black' : 'font-semibold'} text-ink`}>{target.postTitle}</span>
                                            {thread && <span className={`shrink-0 ${skin.meta}`}>{timeAgo(toMillis(thread.lastMessageAt))}</span>}
                                        </span>
                                        <span className={`block truncate ${skin.meta}`}>
                                            Recruiter: {target.recruiterName}{target.companyName ? ` · Company: ${target.companyName}` : ''}
                                        </span>
                                        {thread && (
                                            <span className="mt-0.5 flex items-center gap-2">
                                                <span className={`min-w-0 flex-1 truncate text-xs ${unread ? 'font-semibold text-ink' : 'text-ink/60'}`}>{lastLine(thread, 'user')}</span>
                                                {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                                            </span>
                                        )}
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

/** Recruiter: the chats job seekers opened on their posts, most recent first. */
export function CandidateChatsPanel({ profile }: { profile: MessagingProfile }) {
    const skin = useSkin();
    const [threads, setThreads] = useState<PostThread[] | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [error, setError] = useState('');

    useEffect(() => subscribeRecruiterPostThreads(profile.uid, setThreads, err => {
        setThreads([]);
        setError(chatsHint(err));
    }), [profile.uid]);

    if (threads === null) return loadingBlock;
    if (error) return <p role="alert" className="m-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">{error}</p>;

    const active = threads.find(t => t.id === activeId);
    if (active) {
        return (
            <PostChat
                profile={profile}
                threadId={active.id}
                thread={active}
                target={null}
                asRecruiter
                title={active.userName}
                subtitle={[active.postTitle, active.companyName].filter(Boolean).join(' · ')}
                emptyText="No messages yet."
                onBack={() => setActiveId(null)}
            />
        );
    }

    if (threads.length === 0) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <Users className="h-8 w-8 text-ink/30" aria-hidden="true" />
                <p className="mt-3 text-base font-bold text-ink">No candidate chats yet</p>
                <p className={`mt-1 ${skin.body}`}>When a job seeker has a question about one of your posts, the chat shows up here and you get a notification.</p>
            </div>
        );
    }

    return (
        <ul className={`thin-scrollbar min-h-0 flex-1 divide-y ${skin.divide} overflow-y-auto`}>
            {threads.map(t => {
                const unread = isPostThreadUnread(t, true);
                return (
                    <li key={t.id}>
                        <button type="button" onClick={() => setActiveId(t.id)}
                            className={`flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-ink/[0.03] ${FOCUS}`}>
                            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/70 text-xs font-bold text-surface">{initials(t.userName)}</span>
                            <span className="min-w-0 flex-1">
                                <span className="flex items-center justify-between gap-2">
                                    <span className={`truncate text-sm ${unread ? 'font-black' : 'font-semibold'} text-ink`}>{t.userName}</span>
                                    <span className={`shrink-0 ${skin.meta}`}>{timeAgo(toMillis(t.lastMessageAt))}</span>
                                </span>
                                <span className={`block truncate ${skin.meta}`}>{t.postTitle}</span>
                                <span className="mt-0.5 flex items-center gap-2">
                                    <span className={`min-w-0 flex-1 truncate text-xs ${unread ? 'font-semibold text-ink' : 'text-ink/60'}`}>{lastLine(t, 'recruiter')}</span>
                                    {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
                                </span>
                            </span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
