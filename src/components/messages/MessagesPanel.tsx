import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Headset, MessageSquare, Send } from 'lucide-react';
import {
    MAX_MESSAGE, isUnread, markRead, sendMessage, subscribeMessages, subscribeThread, subscribeThreads,
    type ChatMessage, type MessagingProfile, type SupportThread,
} from '@/lib/messaging';
import { timeAgo, toMillis } from '@/lib/profileViews';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';

const ROLE_LABEL: Record<string, string> = { user: 'Job seeker', recruiter: 'Recruiter', manager: 'Recruiter' };

interface ThreadViewProps {
    profile: MessagingProfile;
    threadId: string;
    thread: SupportThread | null;
    title: string;
    subtitle?: string;
    emptyText: string;
    onBack?: () => void;
}

/** One conversation: the messages, and a box to write the next one. */
function ThreadView({ profile, threadId, thread, title, subtitle, emptyText, onBack }: ThreadViewProps) {
    const skin = useSkin();
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMessages([]);
        return subscribeMessages(threadId, setMessages);
    }, [threadId]);

    // Opening the thread, or a new message arriving while it is open, counts as read.
    const unread = !!thread && isUnread(thread, profile.isAdmin);
    useEffect(() => {
        if (unread) void markRead(threadId, profile.isAdmin);
    }, [unread, threadId, profile.isAdmin, messages.length]);

    useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

    const submit = async () => {
        if (!draft.trim() || sending) return;
        setSending(true);
        try {
            await sendMessage(profile, threadId, thread, draft);
            setDraft('');
        } catch (err) {
            console.error('Error sending message:', err);
            popup.error('Message not sent. Please try again.');
        } finally {
            setSending(false);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
        }
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <header className={`flex shrink-0 items-center gap-3 border-b ${skin.edge} px-4 py-3`}>
                {onBack && (
                    <button type="button" onClick={onBack} aria-label="Back to conversations"
                        className={`-ml-1 cursor-pointer rounded-lg p-1.5 text-ink/60 hover:bg-ink/5 hover:text-ink ${FOCUS}`}>
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/70 text-xs font-bold text-surface">
                    {profile.isAdmin ? initials(title) : <Headset className="h-4 w-4" aria-hidden="true" />}
                </span>
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{title}</p>
                    {subtitle && <p className={`truncate ${skin.meta}`}>{subtitle}</p>}
                </div>
            </header>

            <div className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
                {messages.length === 0 && <p className={`py-8 text-center ${skin.meta}`}>{emptyText}</p>}
                {messages.map(m => {
                    const mine = m.senderId === profile.uid;
                    return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${mine ? 'rounded-br-md bg-ink text-surface' : 'rounded-bl-md bg-muted text-ink'}`}>
                                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                                <p className={`mt-1 text-[10px] ${mine ? 'text-surface/60' : 'text-ink/50'}`}>{timeAgo(toMillis(m.createdAt))}</p>
                            </div>
                        </div>
                    );
                })}
                <div ref={endRef} />
            </div>

            <div className={`flex shrink-0 items-end gap-2 border-t ${skin.edge} p-3`}>
                <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value.slice(0, MAX_MESSAGE))}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder="Write a message…"
                    aria-label="Message"
                    className={`max-h-28 min-h-10 flex-1 resize-none rounded-xl border ${skin.edge} bg-surface px-3 py-2 text-sm text-ink ${FOCUS}`}
                />
                <button type="button" onClick={submit} disabled={!draft.trim() || sending} aria-label="Send message"
                    className={`flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-ink/70 text-surface transition-all hover:bg-ink/60 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}>
                    <Send className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>
        </div>
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
            <ThreadView
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
        <ThreadView
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
