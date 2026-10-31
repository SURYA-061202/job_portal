import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, ChevronDown, Loader2, Plus, Trash2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
    MAX_SAVED_SEARCHES, createSavedSearch, deleteSavedSearch, describeSearch, listRecentPosts,
    listSavedSearches, matchesSearch, setSavedSearchActive, type SavedSearch,
} from '@/lib/jobAlerts';
import { skillList } from '@/lib/jobMatch';
import type { RecruitmentRequest } from '@/types';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

/** Manage saved searches: create one, switch alerts on or off, see what matches right now. */
export default function JobAlertsPanel() {
    const skin = useSkin();
    const navigate = useNavigate();
    const uid = auth.currentUser?.uid;
    const [searches, setSearches] = useState<SavedSearch[]>([]);
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    const [form, setForm] = useState({ keywords: '', city: '', skills: '' });
    const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

    const load = useCallback(async () => {
        if (!uid) return;
        try {
            const [list, recent] = await Promise.all([listSavedSearches(uid), listRecentPosts()]);
            setSearches(list);
            setPosts(recent);
        } catch (err) {
            console.error('Error loading job alerts:', err);
            const denied = (err as { code?: string })?.code === 'permission-denied';
            setNotice({
                ok: false,
                text: denied
                    ? 'Your alerts are blocked by the database rules. The updated Firestore rules need to be deployed.'
                    : 'Failed to load your job alerts. Please reopen this panel to try again.',
            });
        } finally {
            setLoading(false);
        }
    }, [uid]);

    useEffect(() => { load(); }, [load]);

    const matchesBySearch = useMemo(() => {
        const out: Record<string, RecruitmentRequest[]> = {};
        for (const s of searches) out[s.id as string] = posts.filter(p => matchesSearch(p, s));
        return out;
    }, [searches, posts]);

    const create = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uid) return;
        const criteria = { keywords: form.keywords, city: form.city, skills: skillList(form.skills) };
        if (!criteria.keywords.trim() && !criteria.city.trim() && criteria.skills.length === 0) {
            setNotice({ ok: false, text: 'Add a keyword, a city or a skill to save an alert.' });
            return;
        }
        setSaving(true);
        setNotice(null);
        try {
            await createSavedSearch(uid, criteria);
            setForm({ keywords: '', city: '', skills: '' });
            setNotice({ ok: true, text: "Alert saved. We'll notify you when new matching jobs are posted." });
            await load();
        } catch (err) {
            console.error('Error saving alert:', err);
            const denied = (err as { code?: string })?.code === 'permission-denied';
            setNotice({
                ok: false,
                text: denied
                    ? 'Saving was blocked by the database rules. The updated Firestore rules need to be deployed.'
                    : 'Failed to save the alert. Please try again.',
            });
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (s: SavedSearch) => {
        setSearches(prev => prev.map(x => x.id === s.id ? { ...x, active: !s.active } : x));
        try {
            await setSavedSearchActive(s.id as string, !s.active);
        } catch {
            setSearches(prev => prev.map(x => x.id === s.id ? { ...x, active: s.active } : x));
            popup.error('Could not update the alert');
        }
    };

    const remove = async (s: SavedSearch) => {
        try {
            await deleteSavedSearch(s.id as string);
            setSearches(prev => prev.filter(x => x.id !== s.id));
        } catch {
            popup.error('Could not delete the alert');
        }
    };

    const input = `w-full rounded-lg border ${skin.edge} bg-surface px-3 py-2 text-sm text-ink ${FOCUS}`;
    const atLimit = searches.length >= MAX_SAVED_SEARCHES;

    return (
        <div className="space-y-6 p-5">
            <form onSubmit={create} className={`space-y-3 rounded-xl border ${skin.edge} p-4`}>
                <h4 className="text-sm font-bold text-ink">New job alert</h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                        <span className={`mb-1 block ${skin.meta}`}>Role or keywords</span>
                        <input value={form.keywords} onChange={e => setForm(f => ({ ...f, keywords: e.target.value }))} placeholder="e.g. site engineer" className={input} />
                    </label>
                    <label className="block">
                        <span className={`mb-1 block ${skin.meta}`}>City</span>
                        <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="e.g. Pune" className={input} />
                    </label>
                </div>
                <label className="block">
                    <span className={`mb-1 block ${skin.meta}`}>Skills (any of these, comma separated)</span>
                    <input value={form.skills} onChange={e => setForm(f => ({ ...f, skills: e.target.value }))} placeholder="e.g. AutoCAD, Revit" className={input} />
                </label>
                <button type="submit" disabled={saving || atLimit} className={`inline-flex cursor-pointer items-center gap-2 ${skin.cta} ${FOCUS} disabled:opacity-50`}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
                    Save alert
                </button>
                {atLimit && <p className={skin.meta}>You can keep up to {MAX_SAVED_SEARCHES} alerts. Delete one to add another.</p>}
                {notice && (
                    <p role={notice.ok ? 'status' : 'alert'}
                        className={`rounded-lg px-3 py-2 text-sm font-medium ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-destructive/10 text-destructive'}`}>
                        {notice.text}
                    </p>
                )}
            </form>

            <div>
                <h4 className="mb-3 text-sm font-bold text-ink">Your alerts {searches.length > 0 && <span className="font-medium text-ink/40">{searches.length}</span>}</h4>
                {loading ? (
                    <div className="flex items-center gap-2 py-6 text-sm text-ink/60"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading…</div>
                ) : searches.length === 0 ? (
                    <div className={`rounded-xl border border-dashed ${skin.edge} px-6 py-10 text-center`}>
                        <BellRing className="mx-auto h-6 w-6 text-ink/40" aria-hidden="true" />
                        <p className="mt-2 text-sm font-semibold text-ink">No alerts yet</p>
                        <p className={`mx-auto mt-1 max-w-xs ${skin.meta}`}>Save a search above and we'll tell you when a matching job is posted.</p>
                    </div>
                ) : (
                    <ul className="space-y-3">
                        {searches.map(s => {
                            const found = matchesBySearch[s.id as string] ?? [];
                            const open = openId === s.id;
                            return (
                                <li key={s.id} className={`rounded-xl border ${skin.edge} bg-surface`}>
                                    <div className="flex items-start gap-3 p-4">
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-bold text-ink">{s.name}</p>
                                            <p className={`mt-0.5 truncate ${skin.meta}`}>{describeSearch(s)}</p>
                                            <button type="button" onClick={() => setOpenId(open ? null : s.id as string)} disabled={found.length === 0}
                                                className={`mt-2 inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-ink hover:text-brand disabled:cursor-default disabled:text-ink/50 disabled:hover:text-ink/50 ${FOCUS}`}>
                                                {found.length} {found.length === 1 ? 'job matches' : 'jobs match'} now
                                                {found.length > 0 && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />}
                                            </button>
                                        </div>
                                        <button type="button" role="switch" aria-checked={s.active} aria-label={`${s.active ? 'Turn off' : 'Turn on'} alert ${s.name}`} onClick={() => toggle(s)}
                                            className={`relative mt-0.5 h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${FOCUS} ${s.active ? 'bg-brand' : 'bg-ink/20'}`}>
                                            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-transform ${s.active ? 'translate-x-5' : ''}`} />
                                        </button>
                                        <button type="button" onClick={() => remove(s)} aria-label={`Delete alert ${s.name}`}
                                            className={`mt-0.5 cursor-pointer rounded-lg p-1 text-ink/40 transition-colors hover:text-destructive ${FOCUS}`}>
                                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                                        </button>
                                    </div>
                                    {open && found.length > 0 && (
                                        <ul className={`divide-y ${skin.divide} border-t ${skin.edge}`}>
                                            {found.slice(0, 5).map(p => (
                                                <li key={p.id}>
                                                    <button type="button" onClick={() => navigate(`/job/${p.id}`)}
                                                        className={`flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-ink/[0.03] ${FOCUS}`}>
                                                        <span className="min-w-0">
                                                            <span className="block truncate text-sm font-semibold text-ink">{p.jobTitle}</span>
                                                            <span className={`block truncate ${skin.meta}`}>{[p.companyName, p.location].filter(Boolean).join(' · ')}</span>
                                                        </span>
                                                        <span className="text-xs font-bold text-brand">View</span>
                                                    </button>
                                                </li>
                                            ))}
                                            {found.length > 5 && <li className={`px-4 py-2 text-center ${skin.meta}`}>+{found.length - 5} more</li>}
                                        </ul>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
