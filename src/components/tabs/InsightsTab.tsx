import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Candidate, RecruitmentRequest } from '@/types';
import PostStageList from '@/components/recruitment/PostStageList';
import InterviewInviteModal from '@/components/resume/InterviewInviteModal';
import popup from '@/components/ui/Popup';
import { Lightbulb, MapPin } from 'lucide-react';
import { getAllApplications } from '@/lib/jobApplications';
import { getUserSkills } from '@/lib/userToCandidate';
import { useSkin, FOCUS } from '@/styles/skin';

interface Person {
  candidate: Candidate;
  location: string;
}

const skillList = (v: unknown): string[] =>
  (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : []).map(s => s.trim()).filter(Boolean);

/** Share of the post's required skills the person lists, and which ones. Null when the post lists none. */
function matchFor(post: RecruitmentRequest, person: Person): { score: number; matched: string[] } | null {
  const required = skillList(post.skills);
  if (required.length === 0) return null;
  // "Java or C#" is satisfied by either; "Java Script" equals "JavaScript".
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, '');
  const owned = (person.candidate.skills || []).map(s => ({ raw: s, key: norm(s) }));
  const matched: string[] = [];
  let satisfied = 0;
  for (const r of required) {
    const alts = r.split(/\s+or\s+|\s*[/|]\s*/i).map(norm).filter(Boolean);
    const hits = owned.filter(o => alts.includes(o.key));
    if (hits.length) {
      satisfied++;
      hits.forEach(h => matched.push(h.raw));
    }
  }
  return { score: Math.round((satisfied / required.length) * 100), matched };
}

const HOT = 60; // viewers at or above this match who haven't applied are warm leads
const SUGGEST = 50; // minimum match for a suggested candidate


interface PanelProps {
  post: RecruitmentRequest;
  people: Record<string, Person>;
  appliedSet: Set<string>;
  canViewContact: boolean;
  onInvite: (candidate: Candidate) => void;
}

function PostPanel({ post, people, appliedSet, canViewContact, onInvite }: PanelProps) {
  const skin = useSkin();
  const [tab, setTab] = useState<'viewed' | 'suggested'>('viewed');

  const viewerIds = (post.viewedBy || []).filter(uid => people[uid]);
  const views = viewerIds.length;
  const applications = appliedSet.size;
  const conversion = views > 0 ? Math.round((viewerIds.filter(u => appliedSet.has(u)).length / views) * 100) : 0;

  const viewers = viewerIds
    .map(uid => ({ person: people[uid], match: matchFor(post, people[uid]), applied: appliedSet.has(uid) }))
    .sort((a, b) => (b.match?.score ?? -1) - (a.match?.score ?? -1));
  const hotLeads = viewers.filter(v => !v.applied && (v.match?.score ?? 0) >= HOT);

  const viewedSet = new Set(viewerIds);
  const suggested = Object.values(people)
    .filter(p => !viewedSet.has(p.candidate.id) && !appliedSet.has(p.candidate.id))
    .map(p => ({ person: p, match: matchFor(post, p) }))
    .filter(x => (x.match?.score ?? 0) >= SUGGEST)
    .sort((a, b) => (b.match?.score ?? 0) - (a.match?.score ?? 0))
    .slice(0, 5);

  const tips: { good?: boolean; text: string }[] = [];
  if (views === 0) tips.push({ text: 'No one has opened this post yet. Check the title, location and skills are clear, and see whether the suggested candidates are worth inviting.' });
  if (views >= 5 && conversion < 15) tips.push({ text: `${views} views but only ${conversion}% applied. The role may be unclear or the requirements too strict. Revisit the description and skills.` });
  if (hotLeads.length > 0) tips.push({ text: `${hotLeads.length} ${hotLeads.length === 1 ? 'person who viewed this post matches' : 'people who viewed this post match'} ${HOT}%+ of the skills but haven't applied. Inviting them directly is your best next step.` });
  if (!skillList(post.skills).length) tips.push({ text: "This post lists no required skills, so matches can't be scored. Add skills to get better recommendations." });
  if (views >= 5 && conversion >= 40) tips.push({ good: true, text: `Strong interest: ${conversion}% of viewers applied. Consider moving quickly on the applicants.` });
  if (suggested.length > 0) tips.push({ text: `${suggested.length} registered ${suggested.length === 1 ? 'candidate fits' : 'candidates fit'} this role but ${suggested.length === 1 ? "hasn't" : "haven't"} seen it yet.` });
  if (tips.length === 0) tips.push({ good: true, text: 'Nothing needs attention on this post right now.' });

  const row = (person: Person, match: ReturnType<typeof matchFor>, status: string | null) => (
    <li key={person.candidate.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4">
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-ink">{person.candidate.name}</p>
          {status && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status === 'Applied' ? 'bg-emerald-100 text-emerald-800' : 'bg-ink/5 text-ink/70'}`}>{status}</span>}
        </div>
        <p className={`mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 ${skin.meta}`}>
          {person.candidate.role && <span>{person.candidate.role}</span>}
          {person.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden="true" />{person.location}</span>}
          {canViewContact && person.candidate.email && <span>{person.candidate.email}</span>}
        </p>
        {person.candidate.skills.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {person.candidate.skills.slice(0, 6).map(k => {
              const hit = !!match?.matched.some(m => m.toLowerCase() === k.toLowerCase());
              return <span key={k} className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${hit ? 'bg-ink text-surface' : 'bg-border text-ink/80'}`}>{k}</span>;
            })}
            {person.candidate.skills.length > 6 && <span className="px-1 py-0.5 text-[10px] font-medium text-ink/50">+{person.candidate.skills.length - 6}</span>}
          </div>
        )}
      </div>
      {match && (
        <div className="w-28 shrink-0 text-right">
          <p className="text-lg font-bold leading-none text-ink">{match.score}%</p>
          <p className={`mt-1 ${skin.meta}`}>skill match</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink/10"><div className="h-full rounded-full bg-ink" style={{ width: `${match.score}%` }} /></div>
        </div>
      )}
      {canViewContact && (
        <button type="button" onClick={() => onInvite(person.candidate)}
          className={`inline-flex h-8 shrink-0 cursor-pointer items-center rounded-lg border border-current px-3 text-xs font-semibold text-ink hover:bg-ink/5 ${FOCUS}`}>
          Interview Invite
        </button>
      )}
    </li>
  );

  const tabs = [['viewed', `Viewed (${views})`], ['suggested', `Suggested (${suggested.length})`]] as const;

  return (
    <section aria-label={`Insights for ${post.jobTitle}`} className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border ${skin.edge} bg-surface ${skin.radius}`}>
      <div className={`shrink-0 border-b ${skin.edge} px-5 py-4`}>
        <h3 className="truncate text-lg font-bold text-ink">{post.jobTitle}</h3>
        <p className={`mt-0.5 ${skin.meta}`}>{[post.department, post.location].filter(Boolean).join(' · ')}</p>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 scrollbar-hide">
        {/* Performance */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {([
            { label: 'Views', value: String(views), hint: 'People who opened this post' },
            { label: 'Applications', value: String(applications), hint: 'People who applied' },
            { label: 'View to apply', value: `${conversion}%`, hint: 'Viewers who went on to apply' },
          ] as const).map(({ label, value, hint }) => (
            <div key={label} className={`rounded-xl border ${skin.edge} px-5 py-4`}>
              <p className={skin.micro}>{label}</p>
              <p className="mt-2 text-3xl font-black leading-none text-ink">{value}</p>
              <p className={`mt-2 ${skin.meta}`}>{hint}</p>
            </div>
          ))}
        </div>

        {/* Recommendations */}
        <div>
          <h4 className={`mb-2.5 inline-flex items-center gap-1.5 ${skin.micro}`}><Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />Recommendations</h4>
          <ul className="space-y-2">
            {tips.map((t, i) => (
              <li key={i} className={`rounded-lg border-l-4 px-4 py-3 text-sm text-ink/85 ${t.good ? 'border-emerald-500 bg-emerald-50' : 'border-amber-500 bg-amber-50'}`}>
                {t.text}
              </li>
            ))}
          </ul>
        </div>

        {/* People */}
        <div className={`overflow-hidden rounded-xl border ${skin.edge}`}>
          <div role="tablist" aria-label="People" className={`flex gap-1 border-b ${skin.edge} px-3 pt-2`}>
            {tabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`-mb-px cursor-pointer border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${FOCUS} ${tab === key ? 'border-ink text-ink' : 'border-transparent text-ink/50 hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'viewed' ? (
            viewers.length === 0
              ? <p className="px-5 py-8 text-center text-sm text-ink/60">No views yet.</p>
              : <ul className={`divide-y ${skin.divide}`}>{viewers.map(v => row(v.person, v.match, v.applied ? 'Applied' : 'Not applied'))}</ul>
          ) : (
            suggested.length === 0
              ? <p className="px-5 py-8 text-center text-sm text-ink/60">{skillList(post.skills).length ? `No registered candidates match ${SUGGEST}%+ of this post's skills yet.` : 'Add required skills to this post to get suggestions.'}</p>
              : <ul className={`divide-y ${skin.divide}`}>{suggested.map(x => row(x.person, x.match, null))}</ul>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Insights: for each post, how it is performing (views, applications, conversion)
 * and who is worth reaching out to: viewers who haven't applied, ranked by how
 * well their skills fit, and registered candidates who fit but haven't seen it.
 */
export default function InsightsTab({ userRole, userId, canViewContact = false }: { userRole?: string | null; userId?: string | null; canViewContact?: boolean }) {
  const skin = useSkin();
  const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
  const [people, setPeople] = useState<Record<string, Person>>({});
  const [applied, setApplied] = useState<Record<string, Set<string>>>({}); // postId -> user ids
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openPost, setOpenPost] = useState<RecruitmentRequest | null>(null);
  const [inviteFor, setInviteFor] = useState<{ candidate: Candidate; postId: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const isAdmin = userRole === 'admin';
      const q = (!isAdmin && userId)
        ? query(collection(db, 'recruits'), where('recruiterId', '==', userId))
        : query(collection(db, 'recruits'));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as RecruitmentRequest));
      setPosts(list);
      const owned = new Set(list.map(p => p.id as string));

      const users = await getDocs(collection(db, 'users'));
      const map: Record<string, Person> = {};
      users.forEach((d) => {
        const data: Record<string, any> = d.data();
        if (data.role !== 'user') return;
        const skills = getUserSkills(data);
        map[d.id] = {
          candidate: {
            id: d.id,
            name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.name || data.email || 'Unnamed',
            email: data.email || '',
            phone: data.mobile || '',
            role: data.department || '',
            experience: data.yearsOfExperience || '',
            skills,
            resumeUrl: data.resumeUrl || '',
            education: [],
            extractedData: { summary: '', workExperience: [], education: [], skills, certifications: [] },
            createdAt: new Date(),
            updatedAt: new Date(),
          } as unknown as Candidate,
          location: data.address || data.city || data.location || '',
        };
      });
      setPeople(map);

      try {
        const apps = await getAllApplications();
        const byPost: Record<string, Set<string>> = {};
        apps.forEach(a => {
          if (!owned.has(a.post_id)) return;
          (byPost[a.post_id] ||= new Set()).add(a.user_id);
        });
        setApplied(byPost);
      } catch (err) {
        console.error('Failed to load applications', err);
      }
    } catch (err) {
      console.error(err);
      popup.error('Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, [userRole, userId]);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => posts
    .map(p => ({ post: p, count: (p.viewedBy || []).filter(uid => people[uid]).length, skills: skillList(p.skills) }))
    .filter(i => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return (
        i.post.jobTitle?.toLowerCase().includes(term) ||
        i.post.department?.toLowerCase().includes(term) ||
        i.post.location?.toLowerCase().includes(term)
      );
    }), [posts, people, search]);

  return (
    <>
      <PostStageList
        title="Insights"
        plain
        items={items}
        countNoun="view"
        loading={loading}
        search={search}
        onSearch={setSearch}
        selectedId={openPost?.id ?? null}
        onOpen={(p) => setOpenPost(openPost?.id === p.id ? null : p)}
        emptyTitle="No posts yet"
        emptyText="Add a job post to see how it performs and who to reach out to."
        detail={openPost ? (
          <PostPanel
            post={posts.find(p => p.id === openPost.id) ?? openPost}
            people={people}
            appliedSet={applied[openPost.id as string] ?? new Set<string>()}
            canViewContact={canViewContact}
            onInvite={(c) => setInviteFor({ candidate: c, postId: openPost.id as string })}
          />
        ) : undefined}
      />
      {inviteFor && (
        <InterviewInviteModal
          candidate={{ ...inviteFor.candidate, postId: inviteFor.postId } as Candidate}
          onClose={() => setInviteFor(null)}
          onSent={() => { setInviteFor(null); load(); }}
        />
      )}
    </>
  );
}
