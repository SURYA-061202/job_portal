import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { Users, UserCheck, Briefcase, UserPlus, Search, X, MapPin, Eye } from 'lucide-react';
import { BRAND, CHART_COLORS } from '@/constants/colors';
import { useSkin, FOCUS } from '@/styles/skin';
import { timeAgo } from '@/lib/format';
import { AnalyticsSkeleton } from '@/components/user/SkeletonLoaders';
import ExpandingModal from '@/components/subscription/ExpandingModal';

const COLORS = CHART_COLORS;

interface Account {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    role?: string;
    companyName?: string;
    hiringRole?: string;
    address?: string;
    createdAt?: unknown;
}

interface JobPost {
    id: string;
    recruiterId?: string;
    jobTitle?: string;
    department?: string;
    location?: string;
    createdAt?: unknown;
}

/** One row of the job_applications collection (keyed `${postId}_${userId}`). */
interface ApplicationRow {
    id: string;
    post_id?: string;
    user_id?: string;
    status?: string;
    created_at?: unknown;
}

/** The single interviews doc kept per candidate (keyed by the candidate id). */
interface InterviewRow {
    id: string;
    postId?: string;
    role?: string;
    roundType?: string;
    response?: string | null;
    selectedDate?: string | null;
    sentAt?: string;
    interviewers?: string[];
    detailsSubmitted?: boolean;
}

interface Activities {
    applications: ApplicationRow[];
    interview: InterviewRow | null;
    /** Recruiter view: the posts this recruiter published. */
    posts: JobPost[];
    /** Recruiter view: users invited to an interview on one of those posts. */
    invited: { id: string; name: string; interview: InterviewRow }[];
}

const toMillis = (value: unknown): number => {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const parsed = new Date(value).getTime();
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    const maybe = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === 'function') return maybe.toDate().getTime();
    if (typeof maybe.seconds === 'number') return maybe.seconds * 1000;
    return 0;
};

const fullName = (a: Account) =>
    `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email || 'Unnamed User';

const initials = (name: string) =>
    name
        .split(/[\s@.]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('');

const isStaffRole = (role?: string) => role === 'recruiter' || role === 'manager';

/** Column templates shared by a table's header row and its body rows (lg and up). */
const recruiterCols = 'lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_4.5rem_5.5rem_4.5rem]';
const seekerCols = 'lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)_5.5rem_4.5rem]';

/** Badge classes for an application status - one orange, neutral greys. */
const statusBadge = (status?: string): string => {
    const s = (status || 'applied').toLowerCase();
    if (s === 'selected') return 'bg-ink/70 text-surface';
    if (s === 'shortlisted' || s.includes('round') || s.includes('interview')) return 'bg-brand/10 text-brand';
    if (s.includes('reject') || s.includes('decline')) return 'bg-ink/5 text-ink/50';
    return 'bg-ink/5 text-ink/60';
};

const statusLabel = (status?: string): string => {
    const s = (status || 'applied').replace(/_/g, ' ').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function AdminAnalyticsTab() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [posts, setPosts] = useState<JobPost[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [recruiterSearch, setRecruiterSearch] = useState('');
    const [seekerSearch, setSeekerSearch] = useState('');
    /** Account whose Activities dialog is open, with the click point it grows from. */
    const [activitiesFor, setActivitiesFor] = useState<{ user: Account; kind: 'seeker' | 'recruiter'; origin: { x: number; y: number } } | null>(null);
    const [activities, setActivities] = useState<Activities | null>(null);
    const [activitiesLoading, setActivitiesLoading] = useState(false);
    const [activitiesError, setActivitiesError] = useState(false);
    const skin = useSkin();

    useEffect(() => {
        let cancelled = false;
        const fetchData = async () => {
            try {
                const [usersSnapshot, postsSnapshot] = await Promise.all([
                    getDocs(collection(db, 'users')),
                    getDocs(collection(db, 'recruits')),
                ]);
                if (cancelled) return;
                setAccounts(usersSnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Account)));
                setPosts(postsSnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as JobPost)));
            } catch (err) {
                console.error('Error fetching analytics data:', err);
                if (!cancelled) setError(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        fetchData();
        return () => {
            cancelled = true;
        };
    }, []);

    const recruiters = useMemo(
        () => accounts.filter((a) => isStaffRole(a.role)),
        [accounts]
    );
    const seekers = useMemo(() => accounts.filter((a) => a.role === 'user'), [accounts]);

    const postCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        posts.forEach((p) => {
            if (p.recruiterId) counts[p.recruiterId] = (counts[p.recruiterId] || 0) + 1;
        });
        return counts;
    }, [posts]);

    const newThisMonth = useMemo(() => {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        return accounts.filter((a) => toMillis(a.createdAt) >= cutoff).length;
    }, [accounts]);

    const roleData = useMemo(
        () =>
            [
                { name: 'Job Seekers', value: seekers.length },
                { name: 'Recruiters', value: recruiters.length },
            ].filter((entry) => entry.value > 0),
        [seekers.length, recruiters.length]
    );

    const signupData = useMemo(() => {
        const now = new Date();
        const buckets: { key: string; label: string; seekers: number; recruiters: number }[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            buckets.push({
                key: `${d.getFullYear()}-${d.getMonth()}`,
                label: d.toLocaleString('en-US', { month: 'short' }),
                seekers: 0,
                recruiters: 0,
            });
        }
        const index = new Map(buckets.map((b) => [b.key, b]));
        accounts.forEach((a) => {
            const time = toMillis(a.createdAt);
            if (!time) return;
            const d = new Date(time);
            const bucket = index.get(`${d.getFullYear()}-${d.getMonth()}`);
            if (!bucket) return;
            if (a.role === 'user') bucket.seekers += 1;
            else if (isStaffRole(a.role)) bucket.recruiters += 1;
        });
        return buckets.map(({ label, seekers: s, recruiters: r }) => ({ name: label, 'Job Seekers': s, Recruiters: r }));
    }, [accounts]);

    const topRecruiters = useMemo(
        () =>
            recruiters
                .map((r) => ({ name: fullName(r), value: postCounts[r.id] || 0 }))
                .filter((r) => r.value > 0)
                .sort((a, b) => b.value - a.value)
                .slice(0, 6),
        [recruiters, postCounts]
    );

    const filteredRecruiters = useMemo(() => {
        const term = recruiterSearch.trim().toLowerCase();
        const list = recruiters
            .map((r) => ({ ...r, posts: postCounts[r.id] || 0 }))
            .sort((a, b) => b.posts - a.posts || fullName(a).localeCompare(fullName(b)));
        if (!term) return list;
        return list.filter((r) =>
            [fullName(r), r.email, r.companyName, r.hiringRole]
                .filter(Boolean)
                .some((field) => String(field).toLowerCase().includes(term))
        );
    }, [recruiters, postCounts, recruiterSearch]);

    const filteredSeekers = useMemo(() => {
        const term = seekerSearch.trim().toLowerCase();
        const list = [...seekers].sort(
            (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt)
        );
        if (!term) return list;
        return list.filter((u) =>
            [fullName(u), u.email, u.mobile, u.address]
                .filter(Boolean)
                .some((field) => String(field).toLowerCase().includes(term))
        );
    }, [seekers, seekerSearch]);

    const postsById = useMemo(() => new Map(posts.map((p) => [p.id, p])), [posts]);

    const openActivities = async (user: Account, kind: 'seeker' | 'recruiter', e: React.MouseEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setActivitiesFor({ user, kind, origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
        setActivities(null);
        setActivitiesError(false);
        setActivitiesLoading(true);
        try {
            if (kind === 'seeker') {
                const [appsSnap, interviewSnap] = await Promise.all([
                    getDocs(query(collection(db, 'job_applications'), where('user_id', '==', user.id))),
                    getDoc(doc(db, 'interviews', user.id)),
                ]);
                const applications = appsSnap.docs
                    .map((d) => ({ id: d.id, ...d.data() } as ApplicationRow))
                    .sort((a, b) => toMillis(b.created_at) - toMillis(a.created_at));
                const interview = interviewSnap.exists()
                    ? ({ id: interviewSnap.id, ...interviewSnap.data() } as InterviewRow)
                    : null;
                setActivities({ applications, interview, posts: [], invited: [] });
                return;
            }

            const [appsSnap, interviewsSnap, candidatesSnap] = await Promise.all([
                getDocs(collection(db, 'job_applications')),
                getDocs(collection(db, 'interviews')),
                getDocs(collection(db, 'candidates')),
            ]);

            const hisPosts = posts
                .filter((p) => p.recruiterId === user.id)
                .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
            const hisPostIds = new Set(hisPosts.map((p) => p.id));

            const applications = appsSnap.docs
                .map((d) => ({ id: d.id, ...d.data() } as ApplicationRow))
                .filter((a) => !!a.post_id && hisPostIds.has(a.post_id))
                .sort((a, b) => toMillis(b.created_at) - toMillis(a.created_at));

            // One interview doc per candidate; it belongs to this recruiter when it
            // runs on one of his posts. Names come from the platform profile first,
            // then from an uploaded resume in `candidates`.
            const nameById = new Map<string, string>();
            accounts.forEach((a) => nameById.set(a.id, fullName(a)));
            candidatesSnap.docs.forEach((d) => {
                const data = d.data() as { name?: string; email?: string };
                if (!nameById.has(d.id)) nameById.set(d.id, data.name || data.email || 'Candidate');
            });
            const invited = interviewsSnap.docs
                .map((d) => ({ id: d.id, ...d.data() } as InterviewRow))
                .filter((itv) => !!itv.postId && hisPostIds.has(itv.postId))
                .map((itv) => ({ id: itv.id, name: nameById.get(itv.id) || 'Candidate', interview: itv }))
                .sort((a, b) => toMillis(b.interview.sentAt) - toMillis(a.interview.sentAt));

            setActivities({ applications, interview: null, posts: hisPosts, invited });
        } catch (err) {
            console.error('Error loading activities:', err);
            setActivitiesError(true);
        } finally {
            setActivitiesLoading(false);
        }
    };

    if (loading) {
        return <AnalyticsSkeleton />;
    }

    const kpis = [
        { label: 'Job Seekers', value: seekers.length, icon: Users },
        { label: 'Recruiters', value: recruiters.length, icon: UserCheck },
        { label: 'Job Posts', value: posts.length, icon: Briefcase },
        { label: 'New Signups (30d)', value: newThisMonth, icon: UserPlus },
    ];

    const searchField = (value: string, onChange: (v: string) => void, label: string) => (
        <div className="relative w-full sm:w-56">
            <label htmlFor={`analytics-${label}`} className="sr-only">{label}</label>
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-ink/40" aria-hidden="true" />
            </div>
            <input
                id={`analytics-${label}`}
                type="text"
                placeholder="Search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={`block h-9 w-full rounded-lg border border-ink/20 bg-surface pl-10 pr-9 text-sm text-ink shadow-sm transition-colors placeholder:text-ink/40 hover:border-ink/40 ${FOCUS}`}
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    aria-label={`Clear ${label}`}
                    className={`absolute inset-y-0 right-0 my-auto mr-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            )}
        </div>
    );

    const emptyState = (title: string, message: string) => (
        <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-ink/5 text-ink/50" aria-hidden="true">
                <Users className="h-5 w-5" />
            </span>
            <h3 className={skin.emptyTitle}>{title}</h3>
            <p className={`mt-1 max-w-sm ${skin.body}`}>{message}</p>
        </div>
    );

    const renderApplication = (app: ApplicationRow) => {
        const post = app.post_id ? postsById.get(app.post_id) : undefined;
        return (
            <li key={app.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{post?.jobTitle || 'Job post'}</p>
                    <p className={`truncate text-xs ${skin.meta}`}>
                        {[post?.department, post?.location].filter(Boolean).join(' · ') || 'Details unavailable'}
                    </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusBadge(app.status)}`}>
                        {statusLabel(app.status)}
                    </span>
                    <span className={`text-[11px] ${skin.meta}`}>{timeAgo(app.created_at as never)}</span>
                </div>
            </li>
        );
    };

    const renderInterview = (interview: InterviewRow) => {
        const post = interview.postId ? postsById.get(interview.postId) : undefined;
        const accepted = interview.response === 'accept';
        const declined = interview.response === 'decline';
        const responseClass = accepted
            ? 'bg-ink/70 text-surface'
            : declined
                ? 'bg-ink/5 text-ink/50'
                : 'bg-brand/10 text-brand';
        const responseText = accepted ? 'Accepted' : declined ? 'Declined' : 'Awaiting reply';
        const metaLine = [
            interview.roundType ? `Round: ${interview.roundType}` : null,
            interview.sentAt ? `Sent ${timeAgo(interview.sentAt)}` : null,
        ]
            .filter(Boolean)
            .join(' · ');
        return (
            <div className={`rounded-lg border ${skin.edge} px-4 py-3`}>
                <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-semibold text-ink">
                        {post?.jobTitle || 'Interview invite'}
                    </p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${responseClass}`}>
                        {responseText}
                    </span>
                </div>
                <p className={`mt-1 text-xs ${skin.meta}`}>{metaLine || 'Interview invite'}</p>
                {interview.selectedDate && (
                    <p className={`mt-1 text-xs ${skin.meta}`}>Preferred date: {interview.selectedDate}</p>
                )}
                {interview.detailsSubmitted && (
                    <p className={`mt-1 text-xs ${skin.meta}`}>Candidate details submitted</p>
                )}
            </div>
        );
    };

    const renderDetails = (user: Account) => {
        const fields: { label: string; value: string }[] = [
            { label: 'Email', value: user.email || '-' },
            { label: 'Mobile', value: user.mobile || '-' },
            { label: 'Company', value: user.companyName || '-' },
            { label: 'Hiring For', value: user.hiringRole || '-' },
            { label: 'Role', value: user.role ? `${user.role.charAt(0).toUpperCase()}${user.role.slice(1)}` : '-' },
            { label: 'Joined', value: timeAgo(user.createdAt as never) },
        ];
        return (
            <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border ${skin.edge} px-4 py-3.5`}>
                {fields.map((field) => (
                    <div key={field.label} className="min-w-0">
                        <dt className={skin.micro}>{field.label}</dt>
                        <dd className={`truncate text-sm ${skin.body}`} title={field.value}>
                            {field.value}
                        </dd>
                    </div>
                ))}
            </dl>
        );
    };

    const renderRecruiterPosts = (postList: JobPost[], applications: ApplicationRow[]) => {
        const counts: Record<string, number> = {};
        applications.forEach((app) => {
            if (app.post_id) counts[app.post_id] = (counts[app.post_id] || 0) + 1;
        });
        return (
            <ul className={`divide-y ${skin.divide} rounded-lg border ${skin.edge}`}>
                {postList.map((post) => (
                    <li key={post.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 truncate text-sm font-semibold text-ink">
                                {post.jobTitle || 'Job post'}
                            </p>
                            <span className={`shrink-0 text-[11px] ${skin.meta}`}>
                                {timeAgo(post.createdAt as never)}
                            </span>
                        </div>
                        <p className={`mt-0.5 truncate text-xs ${skin.meta}`}>
                            {[post.department, post.location].filter(Boolean).join(' · ') || 'Details unavailable'}
                        </p>
                        <p className={`mt-1 text-xs ${skin.meta}`}>
                            {counts[post.id] || 0} applicant{(counts[post.id] || 0) === 1 ? '' : 's'}
                        </p>
                    </li>
                ))}
            </ul>
        );
    };

    const renderInvited = (invited: Activities['invited']) => (
        <ul className={`divide-y ${skin.divide} rounded-lg border ${skin.edge}`}>
            {invited.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand"
                        aria-hidden="true"
                    >
                        {initials(row.name) || '–'}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">{row.name}</p>
                        <p className={`truncate text-xs ${skin.meta}`}>
                            {[
                                postsById.get(row.interview.postId || '')?.jobTitle,
                                row.interview.roundType ? `Round: ${row.interview.roundType}` : null,
                            ]
                                .filter(Boolean)
                                .join(' · ') || 'Interview invite'}
                        </p>
                    </div>
                    <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            row.interview.response === 'accept'
                                ? 'bg-ink/70 text-surface'
                                : row.interview.response === 'decline'
                                    ? 'bg-ink/5 text-ink/50'
                                    : 'bg-brand/10 text-brand'
                        }`}
                    >
                        {row.interview.response === 'accept'
                            ? 'Accepted'
                            : row.interview.response === 'decline'
                                ? 'Declined'
                                : 'Awaiting reply'}
                    </span>
                </li>
            ))}
        </ul>
    );

    return (
        <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} flex-1 min-h-0 flex flex-col overflow-hidden`}>
            <div className="shrink-0 pb-5">
                <h2 className="text-xl font-bold text-ink">Analytics</h2>
                <p className={`mt-1 ${skin.meta}`}>
                    Recruiters and job seekers on the platform, with posting activity and signup trends.
                </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-hide px-1 -mx-1 pb-2 space-y-6">
                {error && (
                    <div className={`border ${skin.edge} bg-surface rounded-lg px-4 py-3 text-sm text-ink/70`}>
                        Some analytics could not be loaded. Please try again later.
                    </div>
                )}

                {/* KPI cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {kpis.map((kpi) => {
                        const Icon = kpi.icon;
                        return (
                            <div key={kpi.label} className="bg-surface p-4 rounded-lg border border-border flex items-center hover:border-ink/40">
                                <div className="p-2 rounded-lg bg-brand/10 text-brand mr-3 shrink-0">
                                    <Icon className="w-5 h-5" aria-hidden="true" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs text-ink/60 font-medium truncate">{kpi.label}</p>
                                    <h3 className="text-xl font-bold text-ink">{kpi.value}</h3>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
                    <div className={`bg-surface p-4 sm:p-6 rounded-lg border border-border hover:border-ink/40`}>
                        <h3 className="text-lg font-semibold text-ink mb-4">Accounts by Role</h3>
                        {roleData.length === 0 ? (
                            <p className={`h-56 flex items-center justify-center ${skin.body}`}>No accounts yet.</p>
                        ) : (
                            <div className="h-56 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={roleData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={95}
                                            fill={BRAND}
                                            paddingAngle={2}
                                            dataKey="value"
                                            label={(props) => {
                                                const { x, y, textAnchor, percent } = props as {
                                                    x: number;
                                                    y: number;
                                                    textAnchor: string;
                                                    percent: number;
                                                };
                                                return (
                                                    <text x={x} y={y} textAnchor={textAnchor} fontSize={11} fill="#737373">
                                                        {percent ? `${Math.round(percent * 100)}%` : ''}
                                                    </text>
                                                );
                                            }}
                                            labelLine={false}
                                        >
                                            {roleData.map((_entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>

                    <div className={`bg-surface p-4 sm:p-6 rounded-lg border border-border hover:border-ink/40`}>
                        <h3 className="text-lg font-semibold text-ink mb-4">Signups (Last 6 Months)</h3>
                        <div className="h-56 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={signupData} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} allowDecimals={false} />
                                    <Tooltip contentStyle={{ borderRadius: '16px', border: '1px solid #e5e5e5', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f5f5f5' }} />
                                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                                    <Bar dataKey="Job Seekers" fill={BRAND} radius={[4, 4, 0, 0]} barSize={14} />
                                    <Bar dataKey="Recruiters" fill={COLORS[2]} radius={[4, 4, 0, 0]} barSize={14} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className={`bg-surface p-4 sm:p-6 rounded-lg border border-border hover:border-ink/40`}>
                        <h3 className="text-lg font-semibold text-ink mb-4">Top Recruiters by Posts</h3>
                        {topRecruiters.length === 0 ? (
                            <p className={`h-56 flex items-center justify-center ${skin.body}`}>
                                {recruiters.length === 0 ? 'No recruiters yet.' : 'No posts published yet.'}
                            </p>
                        ) : (
                            <ol className="flex min-h-56 w-full flex-col gap-3.5">
                                {topRecruiters.map((recruiter, index) => (
                                    <li key={`${recruiter.name}-${index}`} className="min-w-0">
                                        <div className="mb-1.5 flex items-baseline justify-between gap-3">
                                            <span className="flex min-w-0 items-baseline gap-2">
                                                <span className={`shrink-0 text-xs font-bold ${index === 0 ? 'text-brand' : 'text-ink/40'}`}>
                                                    #{index + 1}
                                                </span>
                                                <span className="truncate text-sm font-medium text-ink">{recruiter.name}</span>
                                            </span>
                                            <span className="shrink-0 text-xs font-semibold text-ink">
                                                {recruiter.value} {recruiter.value === 1 ? 'post' : 'posts'}
                                            </span>
                                        </div>
                                        <div className="h-2 w-full overflow-hidden rounded-full bg-ink/5">
                                            <div
                                                className="h-full rounded-full bg-brand transition-all duration-500"
                                                style={{ width: `${Math.max(6, (recruiter.value / topRecruiters[0].value) * 100)}%` }}
                                            />
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </div>

                {/* Recruiters + Job seekers */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                    <div className={`bg-surface rounded-lg border border-border hover:border-ink/40 flex flex-col`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-ink">Recruiters</h3>
                                <p className={skin.meta}>{filteredRecruiters.length} total</p>
                            </div>
                            {searchField(recruiterSearch, setRecruiterSearch, 'Search recruiters')}
                        </div>
                        {filteredRecruiters.length > 0 && (
                            <div className={`hidden items-center gap-4 border-b border-border px-5 py-2.5 lg:grid ${recruiterCols}`}>
                                <span className={skin.micro}>Recruiter</span>
                                <span className={skin.micro}>Company</span>
                                <span className={skin.micro}>Posts</span>
                                <span className={skin.micro}>Joined</span>
                                <span className={`${skin.micro} text-center`}>Activities</span>
                            </div>
                        )}
                        {filteredRecruiters.length === 0 ? (
                            <div className="flex h-96 items-center justify-center">
                                {emptyState(
                                    recruiters.length === 0 ? 'No recruiters yet' : 'No matching recruiters',
                                    recruiters.length === 0
                                        ? 'Recruiters added by the admin will show up here.'
                                        : `Nothing matches “${recruiterSearch}”.`
                                )}
                            </div>
                        ) : (
                            <ul className={`flex h-96 flex-col divide-y ${skin.divide} overflow-y-auto scrollbar-hide`}>
                                {filteredRecruiters.map((member) => (
                                    <li key={member.id} className={`grid grid-cols-1 items-center gap-x-4 gap-y-1 px-5 py-3.5 ${recruiterCols}`}>
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-sm font-bold text-brand"
                                                aria-hidden="true"
                                            >
                                                {initials(fullName(member)) || '–'}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-ink">{fullName(member)}</p>
                                                <p className={`truncate ${skin.meta}`}>
                                                    {member.hiringRole ? `Hiring: ${member.hiringRole}` : member.email || 'No role set'}
                                                </p>
                                            </div>
                                        </div>
                                        <p className={`truncate text-sm ${skin.body}`}>
                                            <span className={`mr-1 font-normal lg:hidden ${skin.meta}`}>Company:</span>
                                            {member.companyName || '-'}
                                        </p>
                                        <p className="text-sm font-semibold text-ink">
                                            <span className={`mr-1 font-normal lg:hidden ${skin.meta}`}>Posts:</span>
                                            {member.posts}
                                        </p>
                                        <p className={`text-xs ${skin.meta}`}>
                                            <span className={`mr-1 font-normal lg:hidden ${skin.meta}`}>Joined:</span>
                                            {timeAgo(member.createdAt as never)}
                                        </p>
                                        <div className="flex justify-center">
                                            <button
                                                type="button"
                                                onClick={(e) => openActivities(member, 'recruiter', e)}
                                                aria-label={`View activities for ${fullName(member)}`}
                                                title="View activities"
                                                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-ink/20 bg-surface text-ink/60 transition-colors hover:border-ink/40 hover:bg-ink/5 hover:text-ink ${FOCUS}`}
                                            >
                                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className={`bg-surface rounded-lg border border-border hover:border-ink/40 flex flex-col`}>
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                            <div>
                                <h3 className="text-lg font-semibold text-ink">Job Seekers</h3>
                                <p className={skin.meta}>{filteredSeekers.length} total</p>
                            </div>
                            {searchField(seekerSearch, setSeekerSearch, 'Search job seekers')}
                        </div>
                        {filteredSeekers.length > 0 && (
                            <div className={`hidden items-center gap-4 border-b border-border px-5 py-2.5 lg:grid ${seekerCols}`}>
                                <span className={skin.micro}>Job Seeker</span>
                                <span className={skin.micro}>Location</span>
                                <span className={skin.micro}>Joined</span>
                                <span className={`${skin.micro} text-center`}>Activities</span>
                            </div>
                        )}
                        {filteredSeekers.length === 0 ? (
                            <div className="flex h-96 items-center justify-center">
                                {emptyState(
                                    seekers.length === 0 ? 'No job seekers yet' : 'No matching job seekers',
                                    seekers.length === 0
                                        ? 'Registered job seekers will show up here.'
                                        : `Nothing matches “${seekerSearch}”.`
                                )}
                            </div>
                        ) : (
                            <ul className={`flex h-96 flex-col divide-y ${skin.divide} overflow-y-auto scrollbar-hide`}>
                                {filteredSeekers.map((user) => (
                                    <li key={user.id} className={`grid grid-cols-1 items-center gap-x-4 gap-y-1 px-5 py-3.5 ${seekerCols}`}>
                                        <div className="flex min-w-0 items-center gap-3">
                                            <span
                                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/5 text-sm font-bold text-ink/70"
                                                aria-hidden="true"
                                            >
                                                {initials(fullName(user)) || '–'}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-ink">{fullName(user)}</p>
                                                <p className={`truncate ${skin.meta}`}>
                                                    {user.email || 'No email'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <MapPin className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                            <span className={`truncate text-sm ${skin.body}`}>
                                                <span className={`mr-1 font-normal lg:hidden ${skin.meta}`}>Location:</span>
                                                {user.address || 'N/A'}
                                            </span>
                                        </div>
                                        <p className={`text-xs ${skin.meta}`}>
                                            <span className={`mr-1 font-normal lg:hidden ${skin.meta}`}>Joined:</span>
                                            {timeAgo(user.createdAt as never)}
                                        </p>
                                        <div className="flex justify-center">
                                            <button
                                                type="button"
                                                onClick={(e) => openActivities(user, 'seeker', e)}
                                                aria-label={`View activities for ${fullName(user)}`}
                                                title="View activities"
                                                className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-ink/20 bg-surface text-ink/60 transition-colors hover:border-ink/40 hover:bg-ink/5 hover:text-ink ${FOCUS}`}
                                            >
                                                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

            {activitiesFor && (
                <ExpandingModal
                    title={fullName(activitiesFor.user)}
                    subtitle={
                        activitiesLoading
                            ? 'Loading activities…'
                            : activitiesError
                                ? 'Could not load activities'
                                : !activities
                                    ? undefined
                                    : activitiesFor.kind === 'recruiter'
                                        ? `${activities.posts.length} post${activities.posts.length === 1 ? '' : 's'} · ${activities.invited.length} user${activities.invited.length === 1 ? '' : 's'} invited`
                                        : `${activities.applications.length} application${activities.applications.length === 1 ? '' : 's'} · ${activities.interview ? '1 interview invite' : 'No interview invite'}`
                    }
                    origin={activitiesFor.origin}
                    onClose={() => setActivitiesFor(null)}
                    widthClass="max-w-[34rem]"
                >
                    {activitiesLoading ? (
                        <div className="flex flex-1 items-center justify-center p-10">
                            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand" />
                        </div>
                    ) : activitiesError ? (
                        <div className="flex flex-1 items-center justify-center p-6">
                            <p className={skin.body}>Failed to load activities. Please try again.</p>
                        </div>
                    ) : !activities ? null : activitiesFor.kind === 'recruiter' ? (
                        <div className="space-y-6 p-5">
                            <section>
                                <h4 className="mb-2 text-sm font-bold text-ink">Details</h4>
                                {renderDetails(activitiesFor.user)}
                            </section>

                            <section>
                                <div className="mb-2 flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-ink">Posts</h4>
                                    <span className={`text-xs ${skin.meta}`}>{activities.posts.length}</span>
                                </div>
                                {activities.posts.length === 0 ? (
                                    <p className={`py-4 text-center text-sm ${skin.body}`}>No posts published yet.</p>
                                ) : (
                                    renderRecruiterPosts(activities.posts, activities.applications)
                                )}
                            </section>

                            <section>
                                <div className="mb-2 flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-ink">Users Invited</h4>
                                    <span className={`text-xs ${skin.meta}`}>{activities.invited.length}</span>
                                </div>
                                {activities.invited.length === 0 ? (
                                    <p className={`py-4 text-center text-sm ${skin.body}`}>No users invited yet.</p>
                                ) : (
                                    renderInvited(activities.invited)
                                )}
                            </section>
                        </div>
                    ) : (
                        <div className="space-y-6 p-5">
                            <section>
                                <div className="mb-2 flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-ink">Applications</h4>
                                    <span className={`text-xs ${skin.meta}`}>{activities.applications.length}</span>
                                </div>
                                {activities.applications.length === 0 ? (
                                    <p className={`py-4 text-center text-sm ${skin.body}`}>No applications yet.</p>
                                ) : (
                                    <ul className={`divide-y ${skin.divide} rounded-lg border ${skin.edge}`}>
                                        {activities.applications.map((app) => renderApplication(app))}
                                    </ul>
                                )}
                            </section>

                            <section>
                                <div className="mb-2 flex items-center justify-between">
                                    <h4 className="text-sm font-bold text-ink">Interview</h4>
                                </div>
                                {activities.interview ? (
                                    renderInterview(activities.interview)
                                ) : (
                                    <p className={`py-4 text-center text-sm ${skin.body}`}>No interview invites yet.</p>
                                )}
                            </section>
                        </div>
                    )}
                </ExpandingModal>
            )}
        </div>
    );
}
