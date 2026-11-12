import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { MAX_MESSAGE } from '@/lib/messaging';
import { timeAgo, toMillis } from '@/lib/profileViews';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';


/** What a bubble needs; both the admin chat and post chats fit it. */
export interface BubbleMessage {
    id: string;
    senderId: string;
    text: string;
    createdAt?: unknown;
}

interface ThreadViewProps {
    /** The signed-in person; their messages sit on the right. */
    viewerId: string;
    /** Resets the view when it changes. */
    threadId: string;
    subscribe: (onData: (list: BubbleMessage[]) => void) => () => void;
    onSend: (text: string) => Promise<void>;
    /** The other side wrote and the viewer has not seen it yet. */
    unread: boolean;
    onRead: () => void;
    avatar: ReactNode;
    title: string;
    subtitle?: string;
    emptyText: string;
    onBack?: () => void;
}

/** One conversation: the messages, and a box to write the next one. */
export default function ThreadView({ viewerId, threadId, subscribe, onSend, unread, onRead, avatar, title, subtitle, emptyText, onBack }: ThreadViewProps) {
    const skin = useSkin();
    const [messages, setMessages] = useState<BubbleMessage[]>([]);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMessages([]);
        return subscribe(setMessages);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [threadId]);

    // Opening the thread, or a new message arriving while it is open, counts as read.
    useEffect(() => {
        if (unread) onRead();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unread, threadId, messages.length]);

    useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

    const submit = async () => {
        if (!draft.trim() || sending) return;
        setSending(true);
        try {
            await onSend(draft);
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
                    {avatar}
                </span>
                <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{title}</p>
                    {subtitle && <p className={`truncate ${skin.meta}`}>{subtitle}</p>}
                </div>
            </header>

            <div className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
                {messages.length === 0 && <p className={`py-8 text-center ${skin.meta}`}>{emptyText}</p>}
                {messages.map(m => {
                    const mine = m.senderId === viewerId;
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
