import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Candidate, RecruitmentRequest } from '@/types';
import PostStageList from '@/components/recruitment/PostStageList';
import StageCandidateTable from '@/components/recruitment/StageCandidateTable';
import InterviewInviteModal from '@/components/resume/InterviewInviteModal';
import popup from '@/components/ui/Popup';
import { MapPin, Briefcase, GraduationCap } from 'lucide-react';
import { getAllApplications } from '@/lib/jobApplications';
import { getUserSkills, getUserEducation, getUserExperience } from '@/lib/userToCandidate';
import { useSkin, FOCUS } from '@/styles/skin';

interface Applicant {
  candidate: Candidate;
  location: string;
  education: string[];
  experience: string[];
}

/**
 * Applied: people who applied to the recruiter's posts and haven't been invited
 * yet, grouped by post. An applicant's row expands to their profile and an
 * Interview Invite for that post.
 */
export default function AppliedTab({ userRole, userId, canViewContact = false, switcher }: { userRole?: string | null; userId?: string | null; canViewContact?: boolean; switcher?: ReactNode }) {
  const skin = useSkin();
  const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
  const [applicants, setApplicants] = useState<Record<string, Applicant>>({});
  const [byPost, setByPost] = useState<Record<string, string[]>>({}); // postId -> user ids
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openPost, setOpenPost] = useState<RecruitmentRequest | null>(null);
  const [inviteFor, setInviteFor] = useState<Candidate | null>(null);

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

      const apps = (await getAllApplications()).filter(a => a.status === 'applied' && owned.has(a.post_id));
      const grouped: Record<string, string[]> = {};
      apps.forEach(a => { (grouped[a.post_id] ||= []).push(a.user_id); });
      setByPost(grouped);

      const ids = Array.from(new Set(apps.map(a => a.user_id)));
      const entries = await Promise.all(ids.map(async (uid) => {
        try {
          const u = await getDoc(doc(db, 'users', uid));
          if (!u.exists()) return null;
          const data: Record<string, any> = u.data();
          const name = `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.name || data.email || 'Unnamed';
          const skills = getUserSkills(data);
          const applicant: Applicant = {
            candidate: {
              id: uid,
              name,
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
            education: getUserEducation(data).map(e => [e.degree, e.field, e.institution, e.year].filter(Boolean).join(' · ')).filter(Boolean),
            experience: getUserExperience(data).map(e => [e.title, e.meta].filter(Boolean).join(' · ')).filter(Boolean),
          };
          return [uid, applicant] as const;
        } catch (err) {
          console.error('Failed to load applicant', uid, err);
          return null;
        }
      }));
      setApplicants(Object.fromEntries(entries.filter((e): e is readonly [string, Applicant] => !!e)));
    } catch (err) {
      console.error(err);
      popup.error('Failed to load applicants');
    } finally {
      setLoading(false);
    }
  }, [userRole, userId]);

  useEffect(() => { load(); }, [load]);

  const items = useMemo(() => posts
    .map(p => ({ post: p, count: (byPost[p.id as string] || []).filter(uid => applicants[uid]).length }))
    .filter(i => i.count > 0)
    .filter(i => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return (
        i.post.jobTitle?.toLowerCase().includes(term) ||
        i.post.department?.toLowerCase().includes(term) ||
        i.post.location?.toLowerCase().includes(term)
      );
    }), [posts, byPost, applicants, search]);

  const rows = openPost
    ? (byPost[openPost.id as string] || []).map(uid => applicants[uid]).filter(Boolean).map(a => ({ ...a.candidate, postId: openPost.id } as Candidate))
    : [];

  const renderDetail = (c: Candidate) => {
    const a = applicants[c.id];
    const skills = c.skills || [];
    return (
      <div className={`mx-5 mb-5 mt-1 overflow-hidden rounded-xl border ${skin.edge} bg-surface`}>
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${skin.edge} px-5 py-4`}>
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink/70">
            {c.role && <span className="inline-flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5 text-ink/40" aria-hidden="true" />{c.role}</span>}
            {a?.location && <span className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-ink/40" aria-hidden="true" />{a.location}</span>}
          </div>
          <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">Applied</span>
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
          {a && a.education.length > 0 && (
            <div>
              <h4 className={`mb-2 inline-flex items-center gap-1.5 ${skin.micro}`}><GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />Education</h4>
              <ul className="space-y-1.5">{a.education.slice(0, 3).map((e, i) => <li key={i} className="text-sm text-ink/80">{e}</li>)}</ul>
            </div>
          )}
          {a && a.experience.length > 0 && (
            <div>
              <h4 className={`mb-2 inline-flex items-center gap-1.5 ${skin.micro}`}><Briefcase className="h-3.5 w-3.5" aria-hidden="true" />Experience</h4>
              <ul className="space-y-1.5">{a.experience.slice(0, 3).map((e, i) => <li key={i} className="text-sm text-ink/80">{e}</li>)}</ul>
            </div>
          )}
          {skills.length === 0 && (!a || (a.education.length === 0 && a.experience.length === 0)) && (
            <p className="text-sm text-ink/60 md:col-span-2">This applicant hasn't filled in more of their profile yet.</p>
          )}
        </div>
        <div className={`flex flex-wrap items-center justify-end gap-2 border-t ${skin.edge} bg-ink/[0.03] px-5 py-3`}>
          {canViewContact && c.resumeUrl && (
            <a href={c.resumeUrl} target="_blank" rel="noopener noreferrer"
              className={`inline-flex h-8 items-center rounded-lg border border-current px-3 text-xs font-semibold text-ink ${FOCUS}`}>
              Resume
            </a>
          )}
          {canViewContact ? (
            <button type="button" onClick={() => setInviteFor(c)}
              className={`inline-flex h-8 cursor-pointer items-center rounded-lg px-3 text-xs font-semibold ${skin.cta} ${FOCUS}`}>
              Interview Invite
            </button>
          ) : (
            <span className="text-xs text-ink/60">Subscribe to a plan to invite applicants.</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <PostStageList
        title="Interview"
        plain
        items={items}
        countNoun="applicant"
        loading={loading}
        search={search}
        onSearch={setSearch}
        selectedId={openPost?.id ?? null}
        onOpen={(p) => setOpenPost(openPost?.id === p.id ? null : p)}
        emptyTitle="No new applicants"
        emptyText="People who apply to your posts appear here until you invite them."
        actions={switcher}
        detail={openPost ? (
          <StageCandidateTable
            candidates={rows}
            loading={false}
            search=""
            onClose={() => setOpenPost(null)}
            emptyText="No applicants for this post."
            removable={false}
            contactLocked={!canViewContact}
            renderDetail={renderDetail}
          />
        ) : undefined}
      />
      {inviteFor && (
        <InterviewInviteModal
          candidate={inviteFor}
          onClose={() => setInviteFor(null)}
          onSent={() => { setInviteFor(null); load(); }}
        />
      )}
    </>
  );
}
