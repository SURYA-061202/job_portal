import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Candidate, RecruitmentRequest } from '@/types';
import PostStageList from '@/components/recruitment/PostStageList';
import StageCandidateTable from '@/components/recruitment/StageCandidateTable';
import popup from '@/components/ui/Popup';
import { MapPin, GraduationCap, Briefcase } from 'lucide-react';
import { getAllApplications } from '@/lib/jobApplications';
import { getUserSkills, getUserEducation, getUserExperience } from '@/lib/userToCandidate';
import { useSkin, FOCUS } from '@/styles/skin';

interface Viewer {
  candidate: Candidate;
  location: string;
  education: string[];
  experience: string[];
}

const STATUS_LABEL: Record<string, string> = {
  applied: 'Applied',
  shortlisted: 'Shortlisted',
  selected: 'Selected',
};

const statusLabel = (st?: string) => {
  if (!st) return null;
  if (STATUS_LABEL[st]) return STATUS_LABEL[st];
  if (st.endsWith('rejected')) return 'Not selected';
  const m = st.match(/^round(\d+)$/);
  return m ? `Interview · Round ${m[1]}` : st;
};

/**
 * Job Views: for each of the recruiter's posts, who has opened it (the post's
 * viewedBy list) with a quick profile of each viewer and where they stand.
 */
export default function GuidelinesTab({ userRole, userId, canViewContact = false }: { userRole?: string | null; userId?: string | null; canViewContact?: boolean }) {
  const skin = useSkin();
  const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
  const [viewers, setViewers] = useState<Record<string, Viewer>>({});
  const [statuses, setStatuses] = useState<Record<string, string>>({}); // `${postId}_${userId}` -> status
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openPost, setOpenPost] = useState<RecruitmentRequest | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const isAdmin = userRole === 'admin';
        const q = (!isAdmin && userId)
          ? query(collection(db, 'recruits'), where('recruiterId', '==', userId))
          : query(collection(db, 'recruits'));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as RecruitmentRequest));
        setPosts(list);

        const ids = Array.from(new Set(list.flatMap(p => p.viewedBy || [])));
        const entries = await Promise.all(ids.map(async (uid) => {
          try {
            const u = await getDoc(doc(db, 'users', uid));
            if (!u.exists()) return null;
            const data: Record<string, any> = u.data();
            const name = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.name || data.email || 'Unnamed';
            const edu = getUserEducation(data).map(e => [e.degree, e.field, e.institution, e.year].filter(Boolean).join(' · ')).filter(Boolean);
            const exp = getUserExperience(data).map(e => [e.title, e.meta].filter(Boolean).join(' · ')).filter(Boolean);
            const viewer: Viewer = {
              candidate: {
                id: uid,
                name,
                email: data.email || '',
                phone: data.mobile || '',
                role: data.department || '',
                experience: data.yearsOfExperience || '',
                skills: getUserSkills(data),
                resumeUrl: data.resumeUrl || '',
                education: [],
                extractedData: { summary: '', workExperience: [], education: [], skills: getUserSkills(data), certifications: [] },
                createdAt: new Date(),
                updatedAt: new Date(),
              } as unknown as Candidate,
              location: data.address || data.city || data.location || '',
              education: edu,
              experience: exp,
            };
            return [uid, viewer] as const;
          } catch (err) {
            console.error('Failed to load viewer', uid, err);
            return null;
          }
        }));
        setViewers(Object.fromEntries(entries.filter((e): e is readonly [string, Viewer] => !!e)));

        try {
          const apps = await getAllApplications();
          const map: Record<string, string> = {};
          apps.forEach(a => { map[`${a.post_id}_${a.user_id}`] = a.status; });
          setStatuses(map);
        } catch (err) {
          console.error('Failed to load applications', err);
        }
      } catch (err) {
        console.error(err);
        popup.error('Failed to load job views');
      } finally {
        setLoading(false);
      }
    })();
  }, [userRole, userId]);

  const items = useMemo(() => posts
    .map(p => ({ post: p, count: (p.viewedBy || []).filter(uid => viewers[uid]).length }))
    .filter(i => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return (
        i.post.jobTitle?.toLowerCase().includes(term) ||
        i.post.department?.toLowerCase().includes(term) ||
        i.post.location?.toLowerCase().includes(term)
      );
    }), [posts, viewers, search]);

  const viewersOfPost = openPost
    ? (openPost.viewedBy || []).map(uid => viewers[uid]).filter(Boolean).map(v => ({ ...v.candidate, postId: openPost.id } as Candidate))
    : [];

  const renderDetail = (c: Candidate) => {
    const v = viewers[c.id];
    const st = statusLabel(statuses[`${openPost?.id}_${c.id}`]);
    const skills = c.skills || [];
    return (
      <div className={`mx-5 mb-5 mt-1 overflow-hidden rounded-xl border ${skin.edge} bg-surface`}>
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${skin.edge} px-5 py-4`}>
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink/70">
            {c.role && <span className="inline-flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5 text-ink/40" aria-hidden="true" />{c.role}</span>}
            {v?.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-ink/40" aria-hidden="true" />{v.location}</span>}
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st ? 'bg-emerald-100 text-emerald-800' : 'bg-ink/5 text-ink/70'}`}>
            {st ? st : 'Viewed, not applied'}
          </span>
        </div>
        <div className="grid gap-5 p-5 md:grid-cols-2">
          {skills.length > 0 && (
            <div className="md:col-span-2">
              <h4 className={`mb-2 ${skin.micro}`}>Skills</h4>
              <div className="flex flex-wrap gap-1.5">
                {skills.slice(0, 20).map(k => <span key={k} className="rounded-md bg-border px-2 py-1 text-xs font-medium text-ink/80">{k}</span>)}
              </div>
            </div>
          )}
          {v && v.education.length > 0 && (
            <div>
              <h4 className={`mb-2 inline-flex items-center gap-1.5 ${skin.micro}`}><GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />Education</h4>
              <ul className="space-y-1.5">{v.education.slice(0, 3).map((e, i) => <li key={i} className="text-sm text-ink/80">{e}</li>)}</ul>
            </div>
          )}
          {v && v.experience.length > 0 && (
            <div>
              <h4 className={`mb-2 inline-flex items-center gap-1.5 ${skin.micro}`}><Briefcase className="h-3.5 w-3.5" aria-hidden="true" />Experience</h4>
              <ul className="space-y-1.5">{v.experience.slice(0, 3).map((e, i) => <li key={i} className="text-sm text-ink/80">{e}</li>)}</ul>
            </div>
          )}
          {skills.length === 0 && (!v || (v.education.length === 0 && v.experience.length === 0)) && (
            <p className="text-sm text-ink/60 md:col-span-2">This candidate hasn't filled in more of their profile yet.</p>
          )}
        </div>
        {canViewContact && c.resumeUrl && (
          <div className={`flex justify-end border-t ${skin.edge} bg-ink/[0.03] px-5 py-3`}>
            <a href={c.resumeUrl} target="_blank" rel="noopener noreferrer"
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-current px-3 text-xs font-semibold text-ink ${FOCUS}`}>
              Resume
            </a>
          </div>
        )}
      </div>
    );
  };

  return (
    <PostStageList
      title="Job Views"
      plain
      items={items}
      countNoun="view"
      loading={loading}
      search={search}
      onSearch={setSearch}
      selectedId={openPost?.id ?? null}
      onOpen={(p) => setOpenPost(openPost?.id === p.id ? null : p)}
      emptyTitle="No posts yet"
      emptyText="Candidates who view your job posts will appear here, post by post."
      detail={openPost ? (
        <StageCandidateTable
          candidates={viewersOfPost}
          loading={false}
          search=""
          onClose={() => setOpenPost(null)}
          emptyText="Nobody has viewed this post yet."
          removable={false}
          contactLocked={!canViewContact}
          renderDetail={renderDetail}
        />
      ) : undefined}
    />
  );
}
