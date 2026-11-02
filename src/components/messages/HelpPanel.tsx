import { useState } from 'react';
import type { MessagingProfile } from '@/lib/messaging';
import MessagesPanel from '@/components/messages/MessagesPanel';
import ReviewPanel from '@/components/messages/ReviewPanel';
import { useSkin, FOCUS } from '@/styles/skin';

const TABS = [
    { key: 'messages', label: 'Messages' },
    { key: 'review', label: 'Review' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** The help panel behind the header's message icon: Messages by default, and a Review tab. */
export default function HelpPanel({ profile }: { profile: MessagingProfile }) {
    const skin = useSkin();
    const [tab, setTab] = useState<TabKey>('messages');

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <div role="tablist" aria-label="Help" className={`flex shrink-0 border-b ${skin.edge}`}>
                {TABS.map(({ key, label }) => {
                    const on = tab === key;
                    return (
                        <button key={key} type="button" role="tab" aria-selected={on} onClick={() => setTab(key)}
                            className={`-mb-px flex-1 cursor-pointer border-b-2 px-4 py-3 text-sm font-bold transition-colors ${FOCUS} ${on ? 'border-brand text-ink' : 'border-transparent text-ink/50 hover:text-ink'}`}>
                            {label}
                        </button>
                    );
                })}
            </div>
            {tab === 'messages' ? <MessagesPanel profile={profile} /> : <ReviewPanel profile={profile} />}
        </div>
    );
}
