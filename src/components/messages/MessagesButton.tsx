import { useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useMessagingProfile, useUnreadMessages } from '@/lib/messaging';
import ExpandingModal from '@/components/subscription/ExpandingModal';
import MessagesPanel from '@/components/messages/MessagesPanel';
import { useSkin, FOCUS } from '@/styles/skin';

interface MessagesButtonProps {
    /** Which header it sits in: the job seeker bar uses a square-cornered icon, the recruiter bar a round one. */
    variant: 'user' | 'recruiter';
}

/**
 * Message icon for the header, placed before the notification bell. Shows an
 * unread badge and opens a small panel that grows out of the icon: a chat with
 * the admin for job seekers and recruiters, the inbox of every chat for the admin.
 */
export default function MessagesButton({ variant }: MessagesButtonProps) {
    const skin = useSkin();
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
    const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
    const profile = useMessagingProfile(uid);
    const unread = useUnreadMessages(profile);

    useEffect(() => onAuthStateChanged(auth, user => setUid(user?.uid ?? null)), []);

    if (!profile) return null;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={e => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
                }}
                aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
                title={profile.isAdmin ? 'Messages from users' : 'Message the admin'}
                aria-expanded={!!origin}
                className={variant === 'recruiter'
                    ? `relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${origin ? 'bg-ink/10 text-ink' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'} ${FOCUS}`
                    : `relative p-2 ${skin.radius} cursor-pointer text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink ${FOCUS}`}
            >
                <MessageSquare aria-hidden="true" className={variant === 'recruiter' ? 'h-6 w-6' : 'h-5 w-5 text-brand'} />
                {unread > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-surface" aria-hidden="true">
                        {unread}
                    </span>
                )}
            </button>

            {origin && (
                <ExpandingModal
                    title="Messages"
                    origin={origin}
                    onClose={() => setOrigin(null)}
                    widthClass="max-w-[24rem]"
                    heightClass="h-[34rem] max-h-full"
                >
                    <MessagesPanel profile={profile} />
                </ExpandingModal>
            )}
        </>
    );
}
