import { useState } from 'react';
import type { MessagingProfile } from '@/lib/messaging';
import { answersPostChats } from '@/lib/postChat';
import MessagesPanel from '@/components/messages/MessagesPanel';
import ReviewPanel from '@/components/messages/ReviewPanel';
import { CandidateChatsPanel, PostsPanel } from '@/components/messages/PostChatsPanel';
import { useSkin, FOCUS } from '@/styles/skin';

type TabKey = 'posts' | 'candidates' | 'messages' | 'review';

/**
 * The help panel behind the header's message icon. Job seekers start on the list
 * of posts and chat with the recruiter of the post they pick; recruiters see the
 * chats on their posts. Messages (the admin chat) and Review come after.
 */
export default function HelpPanel({ profile }: { profile: MessagingProfile }) {
    const skin = useSkin();
    const tabs: { key: TabKey; label: string }[] = [
        ...(profile.isAdmin ? [] : [answersPostChats(profile) ? { key: 'candidates' as const, label: 'Candidates' } : { key: 'posts' as const, label: 'Posts' }]),
        // Only the admin has an inbox; everyone else writes to the recruiter of a post.
        ...(profile.isAdmin ? [{ key: 'messages' as const, label: 'Messages' }] : []),
        { key: 'review', label: 'Review' },
    ];
    const [tab, setTab] = useState<TabKey>(tabs[0].key);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div role="tablist" aria-label="Help" className={`flex shrink-0 border-b ${skin.edge}`}>
                {tabs.map(({ key, label }) => {
                    const on = tab === key;
                    return (
                        <button key={key} type="button" role="tab" aria-selected={on} onClick={() => setTab(key)}
                            className={`-mb-px flex-1 cursor-pointer border-b-2 px-4 py-3 text-sm font-bold transition-colors ${FOCUS} ${on ? 'border-brand text-ink' : 'border-transparent text-ink/50 hover:text-ink'}`}>
                            {label}
                        </button>
                    );
                })}
            </div>
            <div className="flex min-h-0 flex-1 flex-col bg-surface">
                {tab === 'posts' && <PostsPanel profile={profile} />}
                {tab === 'candidates' && <CandidateChatsPanel profile={profile} />}
                {tab === 'messages' && <MessagesPanel profile={profile} />}
                {tab === 'review' && <ReviewPanel profile={profile} />}
            </div>
        </div>
    );
}
