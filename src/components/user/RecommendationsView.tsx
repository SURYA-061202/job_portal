import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { companySlug } from '@/lib/reviews';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';
import { ArrowRight, Briefcase, CircleCheck, Compass, Eye, MapPin, Plus, TrendingUp, X, type LucideIcon } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { getUserApplications, recordJobView } from '@/lib/jobApplications';
import { assessJob, normSkill, type JobFit, type Readiness, type SeekerProfile } from '@/lib/jobMatch';
import {
    getUserCertificates, getUserEducation, getUserExperience, getUserProjects, getUserSkills,
} from '@/lib/userToCandidate';
import type { RecruitmentRequest } from '@/types';
import RecruitmentDetailView from '@/components/recruitment/RecruitmentDetailView';
import { JobListSkeleton } from '@/components/user/SkeletonLoaders';
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

interface Assessed {
    post: RecruitmentRequest;
    fit: JobFit;
}

type TabKey = Readiness | 'viewed';

const TABS: { key: TabKey; label: string; Icon: LucideIcon }[] = [
    { key: 'ready', label: 'Ready to apply', Icon: CircleCheck },
    { key: 'reach', label: 'Within reach', Icon: TrendingUp },
    { key: 'explore', label: 'Worth exploring', Icon: Compass },
    { key: 'viewed', label: 'You viewed', Icon: Eye },
];

const TIER_STYLE: Record<Readiness, { stroke: string; text: string; label: string }> = {
    ready: { stroke: 'stroke-emerald-600', text: 'text-emerald-700', label: 'Ready' },
    reach: { stroke: 'stroke-amber-500', text: 'text-amber-700', label: 'Within reach' },
    explore: { stroke: 'stroke-ink/40', text: 'text-ink/70', label: 'Explore' },
};

const MAX_SIM_SKILLS = 8;
const FRESH_DAYS = 7;
const CARDS_PER_TAB = 8;

/** Circular gauge with the fit percentage inside. */
function Gauge({ value, className, size = 52 }: { value: number; className: string; size?: number }) {
    const r = size / 2 - 4;
    const c = 2 * Math.PI * r;
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="4" className="stroke-ink/10" />
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, value) / 100)} className={className} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-ink">{value}%</span>
        </div>
    );
}

const titleCase = (s: string) => s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());

/**
 * Recommendations for job seekers. Rather than ranking jobs by one score the way
 * a recruiter ranks candidates, it sorts open jobs by how ready you are for them
 * and names the one move worth making next.
 */
export default function RecommendationsView() {
    const skin = useSkin();
    const navigate = useNavigate();
    const jobsRef = useRef<HTMLDivElement>(null);
    const [loading, setLoading] = useState(true);
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
    const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
    const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
    const [selectedJob, setSelectedJob] = useState<RecruitmentRequest | null>(null);
    const [tab, setTab] = useState<TabKey>('ready');
    const [showOpenings, setShowOpenings] = useState(false);

    // Close the openings modal with Escape and keep the page from scrolling behind it.
    useEffect(() => {
        if (!showOpenings) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowOpenings(false); };
        document.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [showOpenings]);

    const load = useCallback(async () => {
        const user = auth.currentUser;
        if (!user) return;
        try {
            setLoading(true);
            const [userDoc, postsSnap, apps] = await Promise.all([
                getDoc(doc(db, 'users', user.uid)),
                getDocs(query(collection(db, 'recruits'), orderBy('createdAt', 'desc'))),
                getUserApplications(user.uid),
            ]);
            setProfile(userDoc.exists() ? userDoc.data() : {});
            setPosts(postsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as RecruitmentRequest));
            setAppliedIds(new Set(apps.map(a => a.post_id)));
        } catch (err) {
            console.error('Error loading recommendations:', err);
            popup.error('Failed to load recommendations');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const uid = auth.currentUser?.uid;
    const open = useMemo(() => posts.filter(p => !appliedIds.has(p.id as string)), [posts, appliedIds]);

    const me = useMemo<SeekerProfile | null>(() => profile && ({
        skills: getUserSkills(profile),
        years: profile.yearsOfExperience,
        address: String(profile.address || ''),
        role: String(profile.department || ''),
    }), [profile]);

    const base = useMemo<Assessed[]>(() => me ? open.map(post => ({ post, fit: assessJob(post, me) })) : [], [open, me]);

    /** Skills you lack, ranked by how many jobs each would move into "Ready" on its own. */
    const gaps = useMemo(() => {
        if (!me) return [];
        const demand = new Map<string, { skill: string; demand: number }>();
        for (const { fit } of base) {
            if (fit.coverage === null || fit.coverage < 0.4) continue;
            for (const s of fit.missing) {
                const key = normSkill(s);
                const g = demand.get(key) ?? { skill: s, demand: 0 };
                g.demand++;
                demand.set(key, g);
            }
        }
        const readyNow = new Set(base.filter(a => a.fit.tier === 'ready').map(a => a.post.id));
        return [...demand.values()]
            .map(g => {
                const plus = { ...me, skills: [...me.skills, g.skill] };
                const unlocks = open.filter(p => !readyNow.has(p.id) && assessJob(p, plus).tier === 'ready').length;
                return { ...g, unlocks };
            })
            .sort((a, b) => b.unlocks - a.unlocks || b.demand - a.demand)
            .slice(0, MAX_SIM_SKILLS);
    }, [base, open, me]);

    const lists = useMemo(() => {
        const byFit = (a: Assessed, b: Assessed) => b.fit.fit - a.fit.fit || (a.fit.ageDays ?? 1e9) - (b.fit.ageDays ?? 1e9);
        const tier = (t: Readiness) => base.filter(a => a.fit.tier === t).sort(byFit);
        const viewed = base.filter(a => uid && a.post.viewedBy?.includes(uid)).sort(byFit);
        return { ready: tier('ready'), reach: tier('reach'), explore: tier('explore'), viewed };
    }, [base, uid]);

    const baseReady = useMemo(() => base.filter(a => a.fit.tier === 'ready').sort((a, b) => b.fit.fit - a.fit.fit), [base]);

    const checklist = useMemo(() => {
        if (!profile || !me) return [];
        return [
            { label: 'Skills', done: me.skills.length > 0 },
            { label: 'Role', done: !!me.role.trim() },
            { label: 'Experience', done: getUserExperience(profile).length > 0 || !!String(me.years || '').trim() },
            { label: 'Education', done: getUserEducation(profile).length > 0 },
            { label: 'Projects', done: getUserProjects(profile).length > 0 },
            { label: 'Certificates', done: getUserCertificates(profile).length > 0 },
            { label: 'Resume', done: !!String(profile.resumeUrl || '').trim() },
            { label: 'Location', done: !!me.address.trim() },
            { label: 'Verified mobile', done: !!profile.mobileVerified },
        ];
    }, [profile, me]);

    /** Where the open jobs are, so you can see where to look. */
    const cities = useMemo(() => {
        const counts = new Map<string, number>();
        for (const p of open) {
            const city = String(p.location || '').split(',')[0].trim();
            if (city) counts.set(titleCase(city), (counts.get(titleCase(city)) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [open]);

    const openJob = async (job: RecruitmentRequest) => {
        if (uid && job.id && !job.viewedBy?.includes(uid)) {
            await recordJobView(job.id, uid);
            setPosts(prev => prev.map(p => p.id === job.id ? { ...p, viewedBy: [...(p.viewedBy || []), uid] } : p));
        }
        setSelectedJob(job);
    };

    const showTab = (key: TabKey) => {
        setTab(key);
        jobsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (selectedJob) {
        return (
            <div className="min-h-[500px]">
                <RecruitmentDetailView recruitment={selectedJob} onBack={() => setSelectedJob(null)} isUserView />
            </div>
        );
    }

    if (loading || !me) {
        return <div className="px-4 py-1 sm:px-6 sm:py-2 lg:px-8 lg:py-3"><JobListSkeleton count={3} /></div>;
    }

    const doneCount = checklist.filter(c => c.done).length;
    const strength = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0;
    const todo = checklist.filter(c => !c.done);
    const topGap = gaps.find(g => g.unlocks > 0);
    const goProfile = () => navigate('/home?tab=profile');

    const move = me.skills.length === 0
        ? { title: 'Add your skills to unlock recommendations', body: 'Jobs are matched on the skills you list. Add the ones you work with and this page fills in.', cta: 'Add skills', run: goProfile }
        : baseReady.length > 0
            ? { title: `${baseReady.length} ${baseReady.length === 1 ? 'job is' : 'jobs are'} ready for you`, body: `${baseReady[0].post.jobTitle} is your closest fit. Apply early, while the post is fresh.`, cta: 'See ready jobs', run: () => showTab('ready') }
            : topGap
                ? { title: `Learn ${topGap.skill} to unlock ${topGap.unlocks} ${topGap.unlocks === 1 ? 'job' : 'jobs'}`, body: 'It is the one skill standing between you and roles that are otherwise a good fit.', cta: 'See jobs within reach', run: () => showTab('reach') }
                : todo.length > 0
                    ? { title: 'Fill in your profile to widen your matches', body: `Still missing: ${todo.map(t => t.label.toLowerCase()).join(', ')}.`, cta: 'Update profile', run: goProfile }
                    : { title: 'You are all set for now', body: 'Nothing open fits closely right now. New jobs appear here as they are posted.', cta: 'Browse all jobs', run: () => navigate('/home?tab=jobs') };

    const current = lists[tab];
    const currentTab = TABS.find(t => t.key === tab)!;

    return (
        <div className="space-y-5 px-4 py-1 sm:px-6 sm:py-2 lg:px-8 lg:py-3">
            {/* Hero: where you stand and the one thing to do next */}
            <section className={`rounded-2xl border ${skin.edge} bg-surface p-4 sm:p-5`}>
                <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:gap-5">
                    <div className="relative h-20 w-20 shrink-0">
                        <svg viewBox="0 0 120 120" className="-rotate-90" aria-hidden="true">
                            <circle cx="60" cy="60" r="52" fill="none" strokeWidth="9" className="stroke-ink/10" />
                            <circle cx="60" cy="60" r="52" fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-brand transition-all duration-700"
                                strokeDasharray={2 * Math.PI * 52} strokeDashoffset={2 * Math.PI * 52 * (1 - strength / 100)} />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-lg font-black leading-none text-ink">{strength}%</span>
                            <span className="mt-0.5 text-[10px] font-medium text-ink/60">profile</span>
                        </div>
                    </div>

                    <div className="min-w-0 flex-1 text-center md:text-left">
                        <h2 className="text-lg font-black leading-tight text-ink sm:text-xl">{move.title}</h2>
                        <p className={`mt-1 max-w-xl ${skin.body}`}>{move.body}</p>
                        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1.5 md:justify-start">
                            <button type="button" onClick={move.run}
                                className={`inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-bold text-ink transition-colors hover:text-brand ${FOCUS}`}>
                                {move.cta}<ArrowRight className="h-4 w-4 animate-nudge-x" aria-hidden="true" />
                            </button>
                            {cities.length > 0 && (
                                <button type="button" onClick={() => setShowOpenings(true)}
                                    className={`inline-flex cursor-pointer items-center gap-2 rounded-md text-sm font-bold text-ink transition-colors hover:text-brand ${FOCUS}`}>
                                    Where the openings are<ArrowRight className="h-4 w-4 animate-nudge-x" aria-hidden="true" />
                                </button>
                            )}
                        </div>
                    </div>

                    <dl className={`grid w-full shrink-0 grid-cols-3 divide-x ${skin.divide} rounded-xl border ${skin.edge} md:w-auto`}>
                        {([['Ready', baseReady.length], ['Within reach', base.filter(a => a.fit.tier === 'reach').length], [`New (${FRESH_DAYS}d)`, base.filter(a => a.fit.tier && (a.fit.ageDays ?? 99) <= FRESH_DAYS).length]] as const).map(([label, n]) => (
                            <div key={label} className="px-4 py-2.5 text-center">
                                <dd className="text-xl font-black leading-none text-ink">{n}</dd>
                                <dt className={`mt-1 whitespace-nowrap ${skin.meta}`}>{label}</dt>
                            </div>
                        ))}
                    </dl>
                </div>

                {todo.length > 0 && (
                    <div className={`mt-3 flex flex-wrap items-center gap-2 border-t ${skin.edge} pt-3`}>
                        <span className={`mr-1 ${skin.meta}`}>Complete your profile:</span>
                        {todo.map(t => (
                            <button key={t.label} type="button" onClick={goProfile}
                                className={`inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-ink/30 px-2.5 py-1 text-xs font-semibold text-ink/70 transition-colors hover:border-brand hover:text-brand ${FOCUS}`}>
                                <Plus className="h-3 w-3" aria-hidden="true" />{t.label}
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {/* Jobs by readiness */}
            <section ref={jobsRef} aria-label="Recommended jobs" className="scroll-mt-24">
                <div role="tablist" aria-label="Job readiness" className={`mb-4 flex overflow-x-auto border-b ${skin.edge} scrollbar-hide`}>
                    {TABS.map(({ key, label, Icon }) => {
                        const on = tab === key;
                        return (
                            <button key={key} type="button" role="tab" aria-selected={on} onClick={() => setTab(key)}
                                className={`-mb-px inline-flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold transition-colors ${FOCUS} ${on ? 'border-brand text-ink' : 'border-transparent text-ink/50 hover:text-ink'}`}>
                                <Icon className={`h-4 w-4 ${on ? 'text-brand' : ''}`} aria-hidden="true" />
                                {label}
                                <span className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-bold ${on ? 'bg-brand text-surface' : 'bg-ink/10 text-ink/60'}`}>{lists[key].length}</span>
                            </button>
                        );
                    })}
                </div>

                {current.length === 0 ? (
                    <div className={`rounded-2xl border border-dashed ${skin.edge} bg-surface px-6 py-12 text-center`}>
                        <p className="text-sm font-semibold text-ink">
                            {tab === 'viewed' ? 'Nothing here' : me.skills.length === 0 ? 'No matches yet' : `No jobs in "${currentTab.label.toLowerCase()}" right now`}
                        </p>
                        <p className={`mx-auto mt-1 max-w-sm ${skin.meta}`}>
                            {tab === 'viewed' ? 'Jobs you open but don\'t apply to are kept here.' : me.skills.length === 0 ? 'Add skills to your profile to see jobs that fit you.' : 'Check another tab, or come back as new jobs are posted.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                        {current.slice(0, CARDS_PER_TAB).map(({ post, fit }) => {
                            const tier = fit.tier ?? 'explore';
                            const style = TIER_STYLE[tier];
                            const why = [
                                fit.coverage !== null && `${fit.matched.length} of ${fit.required} skills`,
                                fit.roleFit && 'Fits your role',
                                fit.nearYou && 'In your city',
                                fit.remote && 'Remote',
                                fit.experienceGap === 0 && fit.coverage !== null && 'Experience fits',
                                fit.ageDays !== null && fit.ageDays <= FRESH_DAYS && 'New',
                            ].filter(Boolean) as string[];
                            return (
                                <article key={post.id} className={`flex flex-col rounded-2xl border ${skin.edge} bg-surface p-5 transition-colors ${skin.cardHover}`}>
                                    <div className="flex items-start gap-4">
                                        <Gauge value={fit.fit} className={style.stroke} />
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-xs font-bold uppercase tracking-wider ${style.text}`}>
                                                {fit.tier ? style.label : 'Low match'} · {fit.fit}% match
                                            </p>
                                            <h4 className="mt-0.5 truncate text-base font-bold text-ink">{post.jobTitle}</h4>
                                            <p className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 ${skin.meta}`}>
                                                {post.companyName && (
                                                    <Link to={`/company/${companySlug(post.companyName)}`} className="font-semibold hover:text-brand hover:underline">{post.companyName}</Link>
                                                )}
                                                {post.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{post.location}</span>}
                                                {post.yearsExperience && <span className="inline-flex items-center gap-1"><Briefcase className="h-3 w-3" aria-hidden="true" />{post.yearsExperience} yrs</span>}
                                            </p>
                                        </div>
                                    </div>

                                    {why.length > 0 && (
                                        <div className="mt-4 flex flex-wrap gap-1.5">
                                            {why.map(w => <span key={w} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-ink/70">{w}</span>)}
                                        </div>
                                    )}

                                    {(fit.missing.length > 0 || fit.experienceGap > 0) && tier !== 'ready' && (
                                        <p className={`mt-3 ${skin.meta}`}>
                                            {fit.missing.length > 0 && <>To move up, learn <span className="font-bold text-ink">{fit.missing.slice(0, 3).join(', ')}</span>{fit.missing.length > 3 && ` +${fit.missing.length - 3}`}. </>}
                                            {fit.experienceGap > 0 && <>Asks for {fit.experienceGap} more {fit.experienceGap === 1 ? 'year' : 'years'} of experience.</>}
                                        </p>
                                    )}
                                    {tier === 'ready' && fit.missing.length > 0 && (
                                        <p className={`mt-3 ${skin.meta}`}>Nice to have: <span className="font-bold text-ink">{fit.missing.join(', ')}</span></p>
                                    )}

                                    <div className="mt-auto flex justify-end pt-4">
                                        <button type="button" onClick={() => openJob(post)}
                                            className={`inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-ink/70 bg-ink/70 px-5 text-xs font-bold text-surface transition-all hover:bg-ink/60 active:scale-95 ${FOCUS}`}>
                                            View job<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
                {current.length > CARDS_PER_TAB && (
                    <p className={`mt-3 text-center ${skin.meta}`}>Showing the {CARDS_PER_TAB} closest of {current.length}.</p>
                )}
            </section>

            {/* Where the openings are, opened from the link in the header card */}
            {showOpenings && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Where the openings are">
                    <div className="absolute inset-0 animate-fade-in bg-black/40 backdrop-blur-sm" onClick={() => setShowOpenings(false)} />
                    <div className={`relative w-full max-w-md animate-pop-in rounded-2xl border ${skin.edge} bg-surface p-6 shadow-2xl`}>
                        <div className="mb-5 flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-black text-ink">Where the openings are</h3>
                                <p className={`mt-0.5 ${skin.meta}`}>Cities with the most open jobs you haven't applied to.</p>
                            </div>
                            <button type="button" onClick={() => setShowOpenings(false)} aria-label="Close"
                                className={`-mr-2 -mt-1 cursor-pointer rounded-lg p-2 text-ink/60 transition-colors hover:bg-ink/5 hover:text-ink ${FOCUS}`}>
                                <X className="h-5 w-5" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            {cities.map(([city, n]) => {
                                const mine = me.address.toLowerCase().includes(city.toLowerCase());
                                return (
                                    <div key={city}>
                                        <div className="mb-1 flex items-center justify-between text-sm">
                                            <span className="font-semibold text-ink">{city}{mine && <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand">You</span>}</span>
                                            <span className={skin.meta}>{n} {n === 1 ? 'job' : 'jobs'}</span>
                                        </div>
                                        <div className="h-2 overflow-hidden rounded-full bg-ink/10"><div className={`h-full rounded-full ${mine ? 'bg-brand' : 'bg-ink/60'}`} style={{ width: `${(n / cities[0][1]) * 100}%` }} /></div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
