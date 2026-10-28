import { Fragment, type ReactNode, useEffect, useMemo, useState } from 'react';
import { X, Check, Trash2, Loader2, UserX, Calendar, ArrowRight, Lock } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Candidate } from '@/types';
import { useSkin, FOCUS } from '@/styles/skin';
import { candidateMatchesSearch } from '@/components/resume/CandidateList';
import { useCandidateRemoval } from './StageCandidateGrid';

const toTitleCase = (s?: string) =>
    (s || '').split(/\s+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

const expLabel = (e?: string) => {
    const t = (e || '').toString().trim();
    if (!t) return '-';
    return /^[\d.]+$/.test(t) ? `${t} ${Number(t) === 1 ? 'yr' : 'yrs'}` : t;
};

function Detail({ c, defaultRound = '', onMove, footer, showStatus = true }: { c: Candidate; showStatus?: boolean; defaultRound?: string; onMove?: (c: Candidate, roundName: string) => Promise<void>; footer?: ReactNode }) {
    const skin = useSkin();
    const [info, setInfo] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [round, setRound] = useState(defaultRound);
    const [moving, setMoving] = useState(false);
    const postId = (c as Candidate & { postId?: string }).postId;

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'interviews', c.id));
                const d: any = snap.exists() ? snap.data() : null;
                // One interview doc per candidate; ignore one recorded for another post.
                if (alive) setInfo(d && (!d.postId || !postId || d.postId === postId) ? d : null);
            } catch (err) {
                console.error(err);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [c.id, postId]);

    const response: string | undefined = info?.response;
    const accepted = response === 'accept';
    const tiles: [string, string][] = info?.dateOfJoining ? [
        ['Date of joining', info.dateOfJoining],
        ['Current salary', info.currentSalary || '-'],
        ['Expected salary', info.expectedSalary ? `${info.expectedSalary}${info.expectedSalaryPeriod ? ` / ${info.expectedSalaryPeriod}` : ''}` : '-'],
        ['Years of experience', info.yearsExperience || '-'],
        ['Experience in', info.experienceIn || '-'],
        ['Ready to relocate', info.readyToRelocate || '-'],
        ['Laptop', info.laptop || '-'],
    ] : [];

    const status = accepted
        ? { label: 'Accepted', cls: 'bg-emerald-100 text-emerald-800' }
        : response
            ? { label: `Responded "${response}"`, cls: 'bg-destructive/10 text-destructive' }
            : { label: 'Awaiting response', cls: 'bg-amber-100 text-amber-800' };

    const move = async () => {
        if (moving) return;
        setMoving(true);
        try { await onMove?.(c, round.trim() || 'Round 1'); } finally { setMoving(false); }
    };

    return (
        <div className={`mx-5 mb-5 mt-1 overflow-hidden rounded-xl border ${skin.edge} bg-surface`}>
            {loading ? (
                <div className="space-y-3 p-5" aria-busy="true">
                    <div className={`h-4 w-1/4 animate-pulse ${skin.skeleton}`} />
                    <div className={`h-12 w-full animate-pulse ${skin.skeleton}`} />
                </div>
            ) : (
                <>
                    {/* Interview response */}
                    <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${skin.edge} px-5 py-4`}>
                        <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink/5 text-ink/60" aria-hidden="true">
                                <Calendar className="h-5 w-5" />
                            </span>
                            <div>
                                <p className={skin.micro}>Interview date</p>
                                <p className="text-sm font-semibold text-ink">
                                    {accepted && info?.selectedDate ? info.selectedDate : 'Not confirmed yet'}
                                </p>
                            </div>
                        </div>
                        {showStatus && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${status.cls}`}>{status.label}</span>}
                    </div>

                    {/* Candidate-provided details */}
                    {tiles.length > 0 ? (
                        <dl className="grid grid-cols-2 gap-3 p-5 md:grid-cols-4">
                            {tiles.map(([k, v]) => (
                                <div key={k} className="rounded-lg bg-ink/5 px-3 py-2.5">
                                    <dt className={skin.micro}>{k}</dt>
                                    <dd className="mt-1 break-words text-sm font-semibold text-ink">{v}</dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <p className="px-5 py-4 text-sm text-ink/60">
                            {accepted ? 'Waiting for the candidate to submit their details.' : 'Details will appear once the candidate responds to the invite.'}
                        </p>
                    )}

                    {onMove ? (
                    <>
                    {/* Move to interview round */}
                    <div className={`flex flex-wrap items-end justify-between gap-3 border-t ${skin.edge} bg-ink/[0.03] px-5 py-4`}>
                        <div className="min-w-[12rem] flex-1 sm:max-w-xs">
                            <label htmlFor={`round-${c.id}`} className={`mb-1.5 block ${skin.micro}`}>First interview round</label>
                            <input
                                id={`round-${c.id}`}
                                type="text"
                                value={round}
                                onChange={(e) => setRound(e.target.value)}
                                placeholder="Round name (e.g. Technical)"
                                disabled={!accepted}
                                className={`block h-9 w-full rounded-lg border border-ink/20 bg-surface px-3 text-sm text-ink placeholder:text-ink/40 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`}
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            {!accepted && <p className="text-xs text-ink/60">Available after the candidate accepts.</p>}
                            <button
                                type="button"
                                disabled={!accepted || moving}
                                onClick={move}
                                className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg px-4 text-sm font-semibold ${skin.cta} ${FOCUS} disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                                {moving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                                {moving ? 'Moving…' : 'Move to interview'}
                            </button>
                        </div>
                    </div>
                    </>
                    ) : footer ? (
                        <div className={`flex flex-wrap items-center justify-end gap-3 border-t ${skin.edge} bg-ink/[0.03] px-5 py-4`}>{footer}</div>
                    ) : null}
                </>
            )}
        </div>
    );
}

interface StageCandidateTableProps {
    /** Post the candidates belong to; shown as the panel title. */
    candidates: Candidate[];
    loading: boolean;
    search: string;
    /** Round name pre-filled for a candidate (the post's first round). */
    defaultRound?: string;
    /** When set, expanded rows offer 'Move to interview'. */
    onMove?: (candidate: Candidate, roundName: string) => Promise<void>;
    /** Content for a bottom strip of the expanded row (used when there is no move action). */
    footer?: (candidate: Candidate) => ReactNode;
    /** Show the invite-response pill (Accepted / Awaiting) in expanded rows. Only meaningful while shortlisted. */
    showStatus?: boolean;
    /** Custom expanded content; replaces the interview details card. */
    renderDetail?: (candidate: Candidate) => ReactNode;
    /** Show the remove action column (default true). */
    removable?: boolean;
    /** Hide email and phone behind a lock (plans without contact access). */
    contactLocked?: boolean;
    onClose: () => void;
    emptyText: string;
    onRefresh?: () => void;
}

/** A post's candidates as a neat table in a side panel: title and search on top, one row per candidate. */
export default function StageCandidateTable({ candidates, loading, search, defaultRound, onMove, footer, showStatus = true, renderDetail, removable = true, contactLocked = false, onClose, emptyText, onRefresh }: StageCandidateTableProps) {
    const skin = useSkin();
    const { confirmId, setConfirmId, deletingId, remove } = useCandidateRemoval(onRefresh);
    const [openId, setOpenId] = useState<string | null>(null);
    const shown = useMemo(() => candidates.filter((c) => candidateMatchesSearch(c, search)), [candidates, search]);

    return (
        <section aria-label="Candidates" className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border ${skin.edge} bg-surface ${skin.radius}`}>
            {/* Panel header */}
            <div className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-b ${skin.edge} px-5 py-3.5`}>
                <p className={skin.meta}>{shown.length} {shown.length === 1 ? 'candidate' : 'candidates'}</p>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close candidates"
                        title="Close"
                        className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="min-h-0 flex-1 overflow-auto scrollbar-hide">
                {loading ? (
                    <div role="status" aria-busy="true" className="divide-y divide-border">
                        <span className="sr-only">Loading candidates…</span>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} aria-hidden="true" className="flex animate-pulse items-center gap-4 px-5 py-4">
                                <div className="flex-1 space-y-2">
                                    <div className={`h-4 w-1/3 ${skin.skeleton}`} />
                                    <div className={`h-3 w-1/4 ${skin.skeleton}`} />
                                </div>
                                <div className={`h-4 w-1/4 ${skin.skeleton}`} />
                            </div>
                        ))}
                    </div>
                ) : shown.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink/5 text-ink/50" aria-hidden="true">
                            <UserX className="h-6 w-6" />
                        </span>
                        <h4 className={skin.emptyTitle}>{search && candidates.length > 0 ? 'No matching candidates' : 'No candidates found'}</h4>
                        <p className={`mt-1 max-w-sm ${skin.body}`}>{search && candidates.length > 0 ? 'Try a different name, role or email.' : emptyText}</p>
                    </div>
                ) : (
                    <table className="min-w-full text-left">
                        <thead className="sticky top-0 z-10 bg-surface">
                            <tr className={`border-b ${skin.edge}`}>
                                <th scope="col" className={`px-5 py-3 ${skin.micro}`}>Candidate</th>
                                <th scope="col" className={`px-5 py-3 ${skin.micro}`}>Email</th>
                                <th scope="col" className={`px-5 py-3 ${skin.micro}`}>Phone</th>
                                <th scope="col" className={`px-5 py-3 ${skin.micro}`}>Experience</th>
                                {removable && <th scope="col" className={`w-24 px-5 py-3 text-right ${skin.micro}`}>Action</th>}
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${skin.divide}`}>
                            {shown.map((c) => {
                                const confirming = confirmId === c.id;
                                const deleting = deletingId === c.id;
                                const open = openId === c.id;
                                return (
                                    <Fragment key={c.id}>
                                    <tr
                                        tabIndex={0}
                                        aria-expanded={open}
                                        onClick={() => setOpenId(open ? null : c.id)}
                                        onKeyDown={(e) => {
                                            if (e.target !== e.currentTarget) return;
                                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(open ? null : c.id); }
                                        }}
                                        className={`cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:bg-ink/5 ${open ? 'bg-ink/5' : skin.rowHover}`}
                                    >
                                        <td className="px-5 py-3.5">
                                            <p className="text-sm font-semibold text-ink">{toTitleCase(c.name) || 'Unnamed'}</p>
                                        </td>
                                        <td className={`max-w-[14rem] truncate px-5 py-3.5 text-sm ${'text-ink/70'}`} title={contactLocked ? undefined : c.email}>{contactLocked ? <span className="inline-flex items-center gap-1.5 text-ink/40"><Lock className="h-3.5 w-3.5" aria-hidden="true" />Locked</span> : (c.email || '-')}</td>
                                        <td className="whitespace-nowrap px-5 py-3.5 text-sm text-ink/70">{contactLocked ? <span className="inline-flex items-center gap-1.5 text-ink/40"><Lock className="h-3.5 w-3.5" aria-hidden="true" />Locked</span> : (c.phone || 'N/A')}</td>
                                        <td className="whitespace-nowrap px-5 py-3.5 text-sm text-ink/70">{expLabel(c.experience)}</td>
                                        {removable && (
                                        <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1">
                                                {confirming ? (
                                                    <>
                                                        <button type="button" disabled={deleting} onClick={(e) => remove(e, c)} aria-label="Confirm remove" title="Confirm remove"
                                                            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50 ${FOCUS}`}>
                                                            {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                                                        </button>
                                                        <button type="button" disabled={deleting} onClick={() => setConfirmId(null)} aria-label="Cancel" title="Cancel"
                                                            className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink/60 hover:bg-ink/5 hover:text-ink ${FOCUS}`}>
                                                            <X className="h-4 w-4" aria-hidden="true" />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button type="button" onClick={() => setConfirmId(c.id)} aria-label={`Remove ${c.name}`} title="Remove candidate"
                                                        className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink/40 transition-colors hover:bg-destructive/10 hover:text-destructive ${FOCUS}`}>
                                                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        )}
                                    </tr>
                                    {open && (
                                        <tr className="bg-ink/5">
                                            <td colSpan={removable ? 5 : 4} className="p-0">{renderDetail ? renderDetail(c) : <Detail c={c} defaultRound={defaultRound} onMove={onMove} footer={footer?.(c)} showStatus={showStatus} />}</td>
                                        </tr>
                                    )}
                                    </Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </section>
    );
}
