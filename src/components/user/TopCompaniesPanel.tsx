import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { Briefcase, Clock, Loader2, Star } from 'lucide-react';
import { db } from '@/lib/firebase';
import { REVIEWS_ENABLED, companySlug } from '@/lib/reviews';
import { timeAgo, toMillis } from '@/lib/profileViews';
import type { RecruitmentRequest } from '@/types';
import { useSkin, FOCUS } from '@/styles/skin';

const MAX_COMPANIES = 30;

interface Company {
    slug: string;
    name: string;
    jobs: number;
    /** Most common job titles first. */
    titles: string[];
    /** Cities first, then how the work is done (Office, Hybrid, Remote). */
    places: string[];
    /** When the newest of its jobs was posted; 0 if unknown. */
    latest: number;
    rating: number;
    reviews: number;
}

interface TopCompaniesPanelProps {
    /** Open posts the person can still apply to; companies are ranked by how many they have. */
    posts: RecruitmentRequest[];
    /** Called with the company name when its card is opened. */
    onSelect: (companyName: string) => void;
}

const titleCase = (s: string) => s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());

/** Most frequent values first, ties keep first-seen order. */
const byFrequency = (counts: Map<string, number>) => [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);

/**
 * Values as plain comma-separated text across the whole row. As many as fit on
 * the one line are shown; the rest collapse into "+N" at the end of the line.
 */
function FitList({ values }: { values: string[] }) {
    const boxRef = useRef<HTMLSpanElement>(null);
    const measureRef = useRef<HTMLSpanElement>(null);
    const [shown, setShown] = useState(values.length);

    useLayoutEffect(() => {
        const box = boxRef.current;
        const ruler = measureRef.current;
        if (!box || !ruler) return;
        const fit = () => {
            // The ruler holds every value (with its comma), then a "+99" to reserve room for.
            const cells = Array.from(ruler.children) as HTMLElement[];
            const plus = cells.pop()?.offsetWidth ?? 0;
            const room = box.clientWidth;
            let used = 0;
            let count = 0;
            for (let i = 0; i < cells.length; i++) {
                const needed = used + cells[i].offsetWidth + (i < cells.length - 1 ? plus : 0);
                if (needed > room && count > 0) break;
                used += cells[i].offsetWidth;
                count++;
            }
            setShown(count);
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(box);
        return () => observer.disconnect();
    }, [values]);

    const hidden = values.length - shown;
    return (
        <span ref={boxRef} className="relative block w-full overflow-hidden whitespace-nowrap text-sm font-medium text-ink/80">
            {values.slice(0, shown).join(', ')}
            {hidden > 0 && <span className="ml-1.5 font-bold text-ink">+{hidden}</span>}
            <span ref={measureRef} aria-hidden="true" className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap">
                {values.map((v, i) => <span key={v} className="inline-block">{v}{i < values.length - 1 ? ', ' : ''}</span>)}
                <span className="inline-block pl-1.5 font-bold">+99</span>
            </span>
        </span>
    );
}

/** Cards for the companies hiring the most right now: what they are hiring for, where, and how fresh it is. */
export default function TopCompaniesPanel({ posts, onSelect }: TopCompaniesPanelProps) {
    const skin = useSkin();
    const [ratings, setRatings] = useState<Record<string, { sum: number; n: number }> | null>(null);

    useEffect(() => {
        if (!REVIEWS_ENABLED) { setRatings({}); return; }
        let cancelled = false;
        getDocs(collection(db, 'company_reviews'))
            .then(snap => {
                if (cancelled) return;
                const byCompany: Record<string, { sum: number; n: number }> = {};
                snap.forEach(d => {
                    const r = d.data();
                    const slug = String(r.companySlug || '');
                    if (!slug || typeof r.overall !== 'number') return;
                    const cur = byCompany[slug] ?? { sum: 0, n: 0 };
                    cur.sum += r.overall;
                    cur.n += 1;
                    byCompany[slug] = cur;
                });
                setRatings(byCompany);
            })
            // Ratings are a bonus: without them the cards still rank by openings.
            .catch(err => { console.warn('Company ratings unavailable:', err); if (!cancelled) setRatings({}); });
        return () => { cancelled = true; };
    }, []);

    const companies = useMemo<Company[]>(() => {
        const acc = new Map<string, { name: string; jobs: number; titles: Map<string, number>; cities: Map<string, number>; modes: Map<string, number>; latest: number }>();
        const bump = (m: Map<string, number>, v: string) => { if (v) m.set(v, (m.get(v) ?? 0) + 1); };
        for (const p of posts) {
            const name = String(p.companyName || '').trim();
            const slug = companySlug(name);
            if (!slug) continue;
            const cur = acc.get(slug) ?? { name, jobs: 0, titles: new Map(), cities: new Map(), modes: new Map(), latest: 0 };
            cur.jobs += 1;
            bump(cur.titles, String(p.jobTitle || '').trim());
            bump(cur.cities, titleCase(String(p.location || '').split(',')[0].trim()));
            bump(cur.modes, String(p.modeOfWork || '').trim());
            cur.latest = Math.max(cur.latest, toMillis(p.createdAt));
            acc.set(slug, cur);
        }
        return [...acc.entries()]
            .map(([slug, c]) => {
                const r = ratings?.[slug];
                return {
                    slug, name: c.name, jobs: c.jobs,
                    titles: byFrequency(c.titles), places: [...new Set([...byFrequency(c.cities), ...byFrequency(c.modes)])],
                    latest: c.latest, rating: r && r.n > 0 ? r.sum / r.n : 0, reviews: r?.n ?? 0,
                };
            })
            .sort((a, b) => b.jobs - a.jobs || b.rating - a.rating || b.latest - a.latest || a.name.localeCompare(b.name))
            .slice(0, MAX_COMPANIES);
    }, [posts, ratings]);

    if (ratings === null) {
        return <div className="flex items-center justify-center gap-2 py-20 text-sm text-ink/60"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading companies…</div>;
    }

    if (companies.length === 0) {
        return (
            <div className="rounded-lg border border-dashed border-border bg-muted py-20 text-center">
                <h3 className="mb-2 text-lg font-bold text-ink">No companies hiring right now</h3>
                <p className="mx-auto max-w-sm text-ink/60">Check back soon.</p>
            </div>
        );
    }

    return (
        <ol className="flex flex-col gap-4">
            {companies.map((c) => (
                <li key={c.slug} className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface transition-colors duration-200 hover:border-ink">
                    <button type="button" onClick={() => onSelect(c.name)} className={`flex w-full flex-1 cursor-pointer flex-col gap-4 p-5 text-left ${FOCUS}`}>
                        <span className="flex w-full min-w-0 flex-col gap-4">
                            <span className="flex items-start gap-4">
                                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-ink/70 text-2xl font-black text-surface" aria-hidden="true">{c.name.charAt(0).toUpperCase()}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-start gap-2">
                                        <span className="truncate text-lg font-bold leading-tight text-ink">{c.name}</span>
                                    </span>
                                    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
                                            <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />{c.jobs} open {c.jobs === 1 ? 'job' : 'jobs'}
                                        </span>
                                        {c.latest > 0 && (
                                            <span className={`inline-flex items-center gap-1 ${skin.meta}`}><Clock className="h-3 w-3" aria-hidden="true" />Posted {timeAgo(c.latest)}</span>
                                        )}
                                        {REVIEWS_ENABLED && c.reviews > 0 && (
                                            <span className={`inline-flex items-center gap-1 ${skin.meta}`}><Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden="true" />{c.rating.toFixed(1)} ({c.reviews})</span>
                                        )}
                                    </span>
                                </span>
                            </span>

                            {c.titles.length > 0 && (
                                <span className="block w-full">
                                    <span className={`mb-1 block ${skin.micro}`}>Hiring for</span>
                                    <FitList values={c.titles} />
                                </span>
                            )}
                            <span className="flex w-full items-end gap-4">
                                <span className="block min-w-0 flex-1">
                                    {c.places.length > 0 && (
                                        <>
                                            <span className={`mb-1 block ${skin.micro}`}>Locations</span>
                                            <FitList values={c.places} />
                                        </>
                                    )}
                                </span>
                                <span className="shrink-0 rounded-lg border border-ink/70 bg-ink/70 px-6 py-2 text-xs font-bold text-surface">
                                    View Posts
                                </span>
                            </span>
                        </span>
                    </button>

                    {REVIEWS_ENABLED && (
                        <div className={`border-t ${skin.edge} px-5 py-2`}>
                            <Link to={`/company/${c.slug}`} className={`rounded-md text-xs font-bold text-ink/70 transition-colors hover:text-brand ${FOCUS}`}>
                                Read reviews
                            </Link>
                        </div>
                    )}
                </li>
            ))}
        </ol>
    );
}
