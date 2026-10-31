import { useEffect, useState } from 'react';
import { CalendarCheck, Eye, Loader2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { lastActivityAt, listProfileActivity, setSearchable, timeAgo, toMillis, type ProfileActivity } from '@/lib/profileViews';
import ExpandingModal from '@/components/subscription/ExpandingModal';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

const WEEK_MS = 7 * 86_400_000;

interface ProfileVisibilityModalProps {
    origin: { x: number; y: number };
    onClose: () => void;
}

/**
 * Profile visibility for a job seeker: how many recruiters looked at the
 * profile, who they were and who invited them, plus the switch that decides
 * whether recruiters can find the profile in candidate search at all.
 */
export default function ProfileVisibilityModal({ origin, onClose }: ProfileVisibilityModalProps) {
    const skin = useSkin();
    const uid = auth.currentUser?.uid;
    const [activity, setActivity] = useState<ProfileActivity[] | null>(null);
    const [error, setError] = useState('');
    const [searchable, setSearchableState] = useState(true);

    // Read fresh every time the panel opens, so a view from a minute ago is counted.
    useEffect(() => {
        if (!uid) return;
        let cancelled = false;
        (async () => {
            try {
                const [list, me] = await Promise.all([listProfileActivity(uid), getDoc(doc(db, 'users', uid))]);
                console.info('[profile-view] loaded', list.length, 'record(s) for', uid);
                if (cancelled) return;
                setActivity(list);
                setSearchableState(me.exists() ? me.data().searchable !== false : true);
            } catch (err) {
                console.error('Error loading profile activity:', err);
                if (cancelled) return;
                setError((err as { code?: string })?.code === 'permission-denied'
                    ? 'Profile views are blocked by the database rules. The updated Firestore rules need to be deployed.'
                    : 'Could not load your profile views. Please close this panel and try again.');
            }
        })();
        return () => { cancelled = true; };
    }, [uid]);

    const toggleSearchable = async () => {
        if (!uid) return;
        const next = !searchable;
        setSearchableState(next);
        try {
            await setSearchable(uid, next);
            popup.success(next ? 'Recruiters can find your profile again.' : 'Your profile is hidden from recruiter search.');
        } catch {
            setSearchableState(!next);
            popup.error('Could not update your visibility');
        }
    };

    const list = activity ?? [];
    const thisWeek = list.filter(a => Date.now() - lastActivityAt(a) < WEEK_MS).length;
    const totalViews = list.reduce((n, a) => n + (a.viewCount ?? 0), 0);
    const invites = list.filter(a => toMillis(a.lastInvitedAt) > 0).length;

    return (
        <ExpandingModal title="Profile visibility" subtitle="Who has looked at your profile" origin={origin} onClose={onClose} widthClass="max-w-[32rem]">
            {error ? (
                <p role="alert" className="m-5 rounded-lg bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">{error}</p>
            ) : !activity ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink/60"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</div>
            ) : (
                <>
                    <div className={`grid grid-cols-3 divide-x ${skin.divide} border-b ${skin.edge}`}>
                        {([['Recruiters this week', thisWeek], ['Total views', totalViews], ['Interview invites', invites]] as const).map(([label, n]) => (
                            <div key={label} className="px-4 py-4 text-center">
                                <p className="text-2xl font-black leading-none text-ink">{n}</p>
                                <p className={`mt-1.5 ${skin.meta}`}>{label}</p>
                            </div>
                        ))}
                    </div>

                    <div className={`flex items-start justify-between gap-4 border-b ${skin.edge} px-5 py-4`}>
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-ink">Show me to recruiters</p>
                            <p className={`mt-0.5 ${skin.meta}`}>{searchable ? 'Recruiters can find your profile in candidate search.' : 'Hidden from candidate search. You can still apply to jobs.'}</p>
                        </div>
                        <button type="button" role="switch" aria-checked={searchable} aria-label="Show my profile to recruiters" onClick={toggleSearchable}
                            className={`relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${FOCUS} ${searchable ? 'bg-brand' : 'bg-ink/20'}`}>
                            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${searchable ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>

                    {list.length === 0 ? (
                        <div className="px-6 py-14 text-center">
                            <Eye className="mx-auto h-6 w-6 text-ink/40" aria-hidden="true" />
                            <p className="mt-2 text-sm font-semibold text-ink">No views yet</p>
                            <p className={`mx-auto mt-1 max-w-xs ${skin.meta}`}>A complete profile with skills, experience and a resume is opened far more often. Each recruiter who looks will show up here.</p>
                        </div>
                    ) : (
                        <ul className={`divide-y ${skin.divide}`}>
                            {list.map(a => {
                                const invited = toMillis(a.lastInvitedAt) > 0;
                                return (
                                    <li key={a.id} className="flex items-start gap-3 px-5 py-4">
                                        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${invited ? 'bg-emerald-100 text-emerald-700' : 'bg-ink/5 text-ink/60'}`}>
                                            {invited ? <CalendarCheck className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold text-ink">{a.viewerName || 'A recruiter'}{a.companyName && <span className="font-medium text-ink/60"> · {a.companyName}</span>}</p>
                                            <p className={`mt-0.5 ${skin.meta}`}>
                                                {invited
                                                    ? <>Invited you to interview{a.inviteRole ? <> for <span className="font-semibold text-ink">{a.inviteRole}</span></> : ''}</>
                                                    : 'Viewed your profile'}
                                                {(a.viewCount ?? 0) > 1 && ` · ${a.viewCount} views`}
                                            </p>
                                        </div>
                                        <span className={`shrink-0 ${skin.meta}`}>{timeAgo(lastActivityAt(a))}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            )}
        </ExpandingModal>
    );
}
