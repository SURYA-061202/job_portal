import { useEffect, useState } from 'react';
import { Headset, MessageSquare } from 'lucide-react';
import {
    isUnread, markRead, sendMessage, subscribeMessages, subscribeThread, subscribeThreads,
    type MessagingProfile, type SupportThread,
} from '@/lib/messaging';
import { timeAgo, toMillis } from '@/lib/profileViews';
import { initials } from '@/lib/format';
import ThreadView from '@/components/messages/ThreadView';
import { useSkin, FOCUS } from '@/styles/skin';

const ROLE_LABEL: Record<string, string> = { user: 'Job seeker', recruiter: 'Recruiter', manager: 'Recruiter' };

interface AdminThreadProps {
    profile: MessagingProfile;
    thread: SupportThread | null;
    threadId: string;
    title: string;
    subtitle?: string;
    emptyText: string;
    onBack?: () => void;
}

/** A conversation with the admin, seen from either side. */
function AdminThread({ profile, thread, threadId, title, subtitle, emptyText, onBack }: AdminThreadProps) {
    return (
        <ThreadView
            viewerId={profile.uid}
            threadId={threadId}
            subscribe={cb => subscribeMessages(threadId, cb)}
            onSend={text => sendMessage(profile, threadId, thread, text)}
            unread={!!thread && isUnread(thread, profile.isAdmin)}
            onRead={() => void markRead(threadId, profile.isAdmin)}
            avatar={profile.isAdmin ? initials(title) : <Headset className="h-4 w-4" aria-hidden="true" />}
            title={title}
            subtitle={subtitle}
            emptyText={emptyText}
            onBack={onBack}
        />
    );
}

/** The admin's inbox: every person who has written, with their latest message. */
function AdminInbox({ profile }: { profile: MessagingProfile }) {
    const skin = useSkin();
    const [threads, setThreads] = useState<SupportThread[] | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => subscribeThreads(setThreads), []);

    if (threads === null) return <div className="m-4 flex-1 animate-pulse rounded-xl bg-muted" aria-busy="true" />;

    const active = threads.find(t => t.id === activeId) ?? null;
    if (active) {
        return (
            <AdminThread
                profile={profile}
                threadId={active.id}
                thread={active}
                title={active.userName}
                subtitle={[ROLE_LABEL[active.userRole] ?? active.userRole, active.companyName].filter(Boolean).join(' · ')}
                emptyText="No messages yet."
                onBack={() => setActiveId(null)}
            />
        );
    }

    if (threads.length === 0) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
                <MessageSquare className="h-8 w-8 text-ink/30" aria-hidden="true" />
                <p className="mt-3 text-base font-bold text-ink">No messages yet</p>
                <p className={`mt-1 ${skin.body}`}>When a job seeker or recruiter writes to you, the conversation shows up here.</p>
            </div>
        );
    }

    return (
        <ul className={`thin-scrollbar min-h-0 flex-1 divide-y ${skin.divide} overflow-y-auto`}>
            {threads.map(t => {
                const unread = isUnread(t, true);
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
                                <span className={`block truncate ${skin.meta}`}>{[ROLE_LABEL[t.userRole] ?? t.userRole, t.companyName].filter(Boolean).join(' · ')}</span>
                                <span className="mt-0.5 flex items-center gap-2">
                                    <span className={`min-w-0 flex-1 truncate text-xs ${unread ? 'font-semibold text-ink' : 'text-ink/60'}`}>{t.lastSenderRole === 'admin' ? 'You: ' : ''}{t.lastMessage}</span>
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

/** A member's own conversation with the admin. They can write at any time. */
function MemberThread({ profile }: { profile: MessagingProfile }) {
    const [thread, setThread] = useState<SupportThread | null | undefined>(undefined);
    useEffect(() => subscribeThread(profile.uid, setThread), [profile.uid]);

    if (thread === undefined) return <div className="m-4 flex-1 animate-pulse rounded-xl bg-muted" aria-busy="true" />;
    return (
        <AdminThread
            profile={profile}
            threadId={profile.uid}
            thread={thread}
            title="Admin"
            subtitle="Ask a question or report a problem"
            emptyText="Say hello. The admin will reply here and you will get a notification."
        />
    );
}

/** Messages with the admin: a single thread for members, the full inbox for the admin. */
export default function MessagesPanel({ profile }: { profile: MessagingProfile }) {
    return (
        <div className="flex min-h-0 flex-1 flex-col bg-surface">
            {profile.isAdmin ? <AdminInbox profile={profile} /> : <MemberThread profile={profile} />}
        </div>
    );
}
