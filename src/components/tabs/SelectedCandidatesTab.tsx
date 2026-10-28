import { useEffect, useState, type MouseEvent } from "react";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Candidate, RecruitmentRequest } from "@/types";
import StageCandidateTable from "@/components/recruitment/StageCandidateTable";
import PostStageList from "@/components/recruitment/PostStageList";
import popup from '@/components/ui/Popup';
import { ArrowLeft, Mail, Loader2 } from "lucide-react";
import { sendCongratulationsMail } from "@/lib/emailFunctions";
import { getAllApplications } from "@/lib/jobApplications";
import { createCongratulationsNotification } from "@/lib/notificationHelper";
import { useSkin, FOCUS } from "@/styles/skin";

const normalizeSkills = (skills: any): string[] => {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills.filter(Boolean);
  if (typeof skills === 'string') return skills.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

export function SelectedCandidateDetail({ candidate, onBack }: { candidate: Candidate; onBack: () => void }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<boolean>(false);
  const skin = useSkin();

  useEffect(() => {
    const fetchInterviewDetails = async () => {
      try {
        const interviewRef = doc(db, 'interviews', candidate.id);
        const snap = await getDoc(interviewRef);
        if (snap.exists()) {
          const data = snap.data();
          if (data.successmail === true) {
            setSent(true);
          }
        } else {
          const success = (candidate as any).interviewDetails?.successmail;
          if (success === true) setSent(true);
        }
      } catch (err) {
        console.error("Failed to fetch interview details", err);
      }
    };
    fetchInterviewDetails();
  }, [candidate.id]);
  /*const body = encodeURIComponent(
    `Dear ${candidate.name},\n\n` +
    `Congratulations! You have been selected.\n\n` +
    `Please submit the following documents to this email:\n` +
    `1. MarkSheets\n` +
    `2. Degree Completion certificates\n` +
    `3. Experience certificate (if applicable)\n` +
    `4. Bank Account details\n\n` +
    `Regards,\nHR Team`
  ); */

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Masthead - Posts/Candidates recipe: back control + identity in the
          title row, contact details in the description row. */}
      <div className={`shrink-0 mb-4 overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash}`}>
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${skin.edge} px-4 py-3.5 sm:px-5`}>
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onBack}
              className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} ${skin.radius} cursor-pointer transition-colors duration-200 hover:border-ink/40 hover:text-ink ${FOCUS}`}
              title="Back"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
            </button>
            <div className="flex min-w-0 flex-col">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className={`${skin.heading} max-w-full truncate`}>{candidate.name}</h1>
                <span
                  className="inline-flex shrink-0 items-center whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink"
                  title="Status"
                >
                  Selected
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 py-2.5 sm:px-5">
          <p className={skin.body}>
            {candidate.email}
            {candidate.phone && (
              <>
                <span className="mx-2 text-ink/40">•</span>
                {candidate.phone}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Body - fixed height; only the contents inside it scroll */}
      <div className={`flex flex-1 min-h-0 flex-col overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
      <div className="flex-1 min-h-0 overflow-auto p-6 space-y-4">
        <table className={`min-w-full divide-y ${skin.divide} text-sm`}>
          <thead className="bg-brand/5">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-brand uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left font-medium text-brand uppercase tracking-wider">Mobile</th>
              <th className="px-6 py-3 text-left font-medium text-brand uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left font-medium text-brand uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className={`${skin.surface} divide-y ${skin.divide}`}>
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-ink/80">{candidate.email}</td>
              <td className="px-6 py-4 whitespace-nowrap text-ink/80">{candidate.phone || '-'}</td>
              <td className="px-6 py-4 whitespace-nowrap text-ink/80">{candidate.role}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <button
                  disabled={sending || sent}
                  onClick={async () => {
                    setSending(true);
                    try {
                      await sendCongratulationsMail({
                        candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
                      });

                      // update Firestore interviews doc
                      const interviewRef = doc(db, 'interviews', candidate.id);
                      const snap = await getDoc(interviewRef);
                      if (snap.exists()) {
                        await updateDoc(interviewRef, { successmail: true, updatedAt: new Date() });
                      } else {
                        await setDoc(interviewRef, { successmail: true, createdAt: new Date() });
                      }

                      // also update in candidate's interviewDetails if exists
                      const candRef = doc(db, 'candidates', candidate.id);
                      const candSnap = await getDoc(candRef);
                      if (candSnap.exists()) {
                        await updateDoc(candRef, { 'interviewDetails.successmail': true });
                      }

                      // Create notification for the candidate
                      try {
                        await createCongratulationsNotification(candidate.email, candidate.role, candidate.id);
                      } catch (err) {
                        console.error('Failed to create notification', err);
                      }

                      popup.success('Email sent successfully');
                      setSent(true);
                    } catch (err: any) {
                      popup.error(err.message || 'Failed to send email');
                    } finally {
                      setSending(false);
                    }
                  }}
                  className={`inline-flex items-center gap-2 cursor-pointer rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}
                >
                  {sending && (
                    <svg className="animate-spin h-3 w-3 text-surface" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                  )}
                  {sent ? 'Sent' : sending ? 'Sending…' : 'Send Congratulations'}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

export function RejectedCandidateDetail({ candidate, onBack }: { candidate: Candidate; onBack: () => void }) {
  const status: string = (candidate as any).status || '';
  const skin = useSkin();
  let rejectedRound: string | null = null;
  const match = status.match(/round(\d+)rejected/);
  if (match) {
    rejectedRound = `Round ${match[1]}`;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Masthead - Posts/Candidates recipe: back control + identity in the
          title row, contact details in the description row. */}
      <div className={`shrink-0 mb-4 overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash}`}>
        <div className={`flex flex-wrap items-center justify-between gap-3 border-b ${skin.edge} px-4 py-3.5 sm:px-5`}>
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={onBack}
              className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} ${skin.radius} cursor-pointer transition-colors duration-200 hover:border-ink/40 hover:text-ink ${FOCUS}`}
              title="Back"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
            </button>
            <div className="flex min-w-0 flex-col">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className={`${skin.heading} max-w-full truncate`}>{candidate.name}</h1>
                <span
                  className="inline-flex shrink-0 items-center whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink"
                  title="Status"
                >
                  Rejected{rejectedRound ? ` · ${rejectedRound}` : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="px-4 py-2.5 sm:px-5">
          <p className={skin.body}>
            {candidate.email}
            {candidate.phone && (
              <>
                <span className="mx-2 text-ink/40">•</span>
                {candidate.phone}
              </>
            )}
          </p>
        </div>
      </div>

      {/* Body - fixed height; only the contents inside it scroll */}
      <div className={`flex flex-1 min-h-0 flex-col overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
      <div className="flex-1 min-h-0 overflow-auto p-6 space-y-4">
        <table className={`min-w-full divide-y ${skin.divide} text-sm`}>
          <thead className="bg-brand/5">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-brand uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left font-medium text-brand uppercase tracking-wider">Mobile</th>
              <th className="px-6 py-3 text-left font-medium text-brand uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left font-medium text-brand uppercase tracking-wider">Rejected In</th>
            </tr>
          </thead>
          <tbody className={`${skin.surface} divide-y ${skin.divide}`}>
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-ink/80">{candidate.email}</td>
              <td className="px-6 py-4 whitespace-nowrap text-ink/80">{candidate.phone || '-'}</td>
              <td className="px-6 py-4 whitespace-nowrap text-ink/80">{candidate.role}</td>
              <td className="px-6 py-4 whitespace-nowrap text-ink/80">{rejectedRound || '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}

/** Row-level action: sends the congratulations mail without leaving the list. */
function SendCongratulationsButton({ candidate, labelled = false }: { candidate: Candidate; labelled?: boolean }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(() => (candidate.interviewDetails as { successmail?: boolean } | undefined)?.successmail === true);
  const [checked, setChecked] = useState(false);
  const skin = useSkin();

  // The interview doc is the source of truth for whether the mail already went out.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'interviews', candidate.id));
        if (!cancelled && snap.exists() && snap.data()?.successmail === true) setSent(true);
      } catch (err) {
        console.error("Failed to fetch interview details", err);
      } finally {
        if (!cancelled) setChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [candidate.id]);

  const send = async (e: MouseEvent) => {
    e.stopPropagation();
    if (sending || sent || !checked) return;
    setSending(true);
    try {
      // Re-check right before sending so a mail sent from another tab/session isn't repeated.
      const latest = await getDoc(doc(db, 'interviews', candidate.id));
      if (latest.exists() && latest.data()?.successmail === true) {
        setSent(true);
        popup.success('Congratulations mail was already sent');
        return;
      }
      await sendCongratulationsMail({
        candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
      });

      // update Firestore interviews doc
      const interviewRef = doc(db, 'interviews', candidate.id);
      const snap = await getDoc(interviewRef);
      if (snap.exists()) {
        await updateDoc(interviewRef, { successmail: true, updatedAt: new Date() });
      } else {
        await setDoc(interviewRef, { successmail: true, createdAt: new Date() });
      }

      // also update in candidate's interviewDetails if exists
      const candRef = doc(db, 'candidates', candidate.id);
      const candSnap = await getDoc(candRef);
      if (candSnap.exists()) {
        await updateDoc(candRef, { 'interviewDetails.successmail': true });
      }

      // Create notification for the candidate
      try {
        await createCongratulationsNotification(candidate.email, candidate.role, candidate.id);
      } catch (err) {
        console.error('Failed to create notification', err);
      }

      popup.success('Email sent successfully');
      setSent(true);
    } catch (err: any) {
      popup.error(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={send}
      disabled={sending || sent || !checked}
      title={sent ? 'Congratulations mail sent' : 'Send congratulations mail'}
      aria-label={sent ? 'Congratulations mail sent' : 'Send congratulations mail'}
      className={`${labelled ? 'inline-flex h-9 items-center gap-2 px-4 text-sm font-semibold' : 'p-2'} border border-border bg-surface cursor-pointer transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${sent ? 'text-ink/40' : 'text-brand hover:bg-brand/10'} ${skin.radius} ${FOCUS}`}
    >
      {sending ? (
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      ) : (
        <Mail className="w-4 h-4" aria-hidden="true" />
      )}
      {labelled && (sent ? 'Mail sent' : sending ? 'Sending…' : 'Send congratulations')}
    </button>
  );
}

export default function SelectedCandidatesTab({ userRole, userId }: { userRole?: string | null; userId?: string | null }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [postTitles, setPostTitles] = useState<Record<string, string>>({});
  const skin = useSkin();

  useEffect(() => {
    const load = async () => {
      try {
        const allCandidates: Candidate[] = [];
        const isAdmin = userRole === 'admin';

        // 1. Fetch from Firestore candidates
        let candQ = query(collection(db, "candidates"), orderBy('createdAt', 'desc'));
        const qs = await getDocs(candQ);
        qs.forEach((d) => {
          allCandidates.push({ id: d.id, ...d.data() } as Candidate);
        });

        // Sort manually
        allCandidates.sort((a, b) => {
          const dateA = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate() : (a.createdAt || 0);
          const dateB = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : (b.createdAt || 0);
          return Number(dateB) - Number(dateA);
        });

        // 2. Fetch job applications + post titles for the "Post" column
        let ownedPostIds: string[] = [];
        const titles: Record<string, string> = {};
        if (!isAdmin && userId) {
          const recruitsQs = await getDocs(query(collection(db, 'recruits'), where('recruiterId', '==', userId)));
          ownedPostIds = recruitsQs.docs.map(d => d.id);
          recruitsQs.docs.forEach((d) => {
            const jobTitle = d.data()?.jobTitle;
            if (jobTitle) titles[d.id] = jobTitle;
          });

          if (ownedPostIds.length === 0 && allCandidates.length === 0) {
            setCandidates([]);
            setPostTitles(titles);
            setLoading(false);
            return;
          }
        } else {
          const postsSnap = await getDocs(query(collection(db, 'recruits')));
          postsSnap.docs.forEach((d) => {
            const jobTitle = d.data()?.jobTitle;
            if (jobTitle) titles[d.id] = jobTitle;
          });
        }
        setPostTitles(titles);

        let applications: { user_id: string; post_id: string; status: string }[] = [];
        try {
          applications = await getAllApplications();
          if (!isAdmin && ownedPostIds.length > 0) {
            applications = applications.filter(app => ownedPostIds.includes(app.post_id));
          }
        } catch (appsError) {
          console.error('Error fetching applications:', appsError);
        }

        if (applications && applications.length > 0) {
          for (const app of applications) {
            const st = app.status || '';
            const isTarget = st === 'selected' || st.endsWith('rejected');
            if (!isTarget) continue;

            try {
              let userData: any = null;
              let intData: any = {};

              // First try users collection (registered users)
              const userDoc = await getDoc(doc(db, 'users', app.user_id));
              if (userDoc.exists()) {
                userData = userDoc.data();
              } else {
                // Fallback: try candidates collection (uploaded candidates)
                const candDoc = await getDoc(doc(db, 'candidates', app.user_id));
                if (candDoc.exists()) {
                  userData = candDoc.data();
                }
              }

              if (userData) {
                // One interview doc per candidate, so it may belong to a different
                // post they were invited for — ignore it unless it's for this one.
                const intDoc = await getDoc(doc(db, 'interviews', app.user_id));
                const rawInt = intDoc.exists() ? intDoc.data() : {};
                intData = (!rawInt.postId || rawInt.postId === app.post_id) ? rawInt : {};

                allCandidates.push({
                  id: app.user_id,
                  name: userData.name || `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email || 'Unnamed Candidate',
                  email: userData.email || '',
                  phone: userData.phone || userData.mobile || '',
                  role: userData.role || userData.department || 'Applicant',
                  experience: userData.experience || userData.yearsOfExperience || '',
                  skills: normalizeSkills(userData.skills),
                  resumeUrl: userData.resumeUrl || '',
                  extractedData: {
                    summary: userData.extractedData?.summary || '',
                    workExperience: userData.extractedData?.workExperience || [],
                    education: userData.extractedData?.education || [],
                    skills: normalizeSkills(userData.skills),
                    certifications: userData.extractedData?.certifications || [],
                    projects: userData.extractedData?.projects || []
                  },
                  education: userData.education || [],
                  createdAt: userData.createdAt?.toDate ? userData.createdAt.toDate() : new Date(),
                  updatedAt: userData.updatedAt?.toDate ? userData.updatedAt.toDate() : new Date(),
                  status: app.status as any,
                  postId: app.post_id,
                  interviewDetails: intData as any
                } as Candidate);
              }
            } catch (err) {
              console.error(`Error fetching user ${app.user_id}:`, err);
            }
          }
        }

        setCandidates(allCandidates);
      } catch (err) {
        console.error(err);
        popup.error("Failed to load candidates");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = candidates.filter((c) => ((c as any).status || '') === 'selected');

  const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
  const [openPost, setOpenPost] = useState<RecruitmentRequest | null>(null);
  const [postSearch, setPostSearch] = useState("");

  // Posts this user can see, loaded once; the counts come from `filtered`.
  useEffect(() => {
    (async () => {
      try {
        const isAdmin = userRole === 'admin';
        const q = (!isAdmin && userId)
          ? query(collection(db, 'recruits'), where('recruiterId', '==', userId))
          : query(collection(db, 'recruits'));
        const snap = await getDocs(q);
        setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() } as RecruitmentRequest)));
      } catch (err) {
        console.error(err);
      }
    })();
  }, [userRole, userId]);

  const items = posts
    .map(p => ({ post: p, count: filtered.filter(c => (c as any).postId === p.id).length }))
    .filter(i => i.count > 0)
    .filter(i => {
      const term = postSearch.trim().toLowerCase();
      if (!term) return true;
      return (
        i.post.jobTitle?.toLowerCase().includes(term) ||
        i.post.department?.toLowerCase().includes(term) ||
        i.post.location?.toLowerCase().includes(term)
      );
    });
  const forPost = openPost ? filtered.filter(c => (c as any).postId === openPost.id) : [];

  return (
    <PostStageList
      title="Selected"
      plain
      items={items}
      countNoun="selected"
      loading={loading}
      search={postSearch}
      onSearch={setPostSearch}
      selectedId={openPost?.id ?? null}
      onOpen={(p) => setOpenPost(openPost?.id === p.id ? null : p)}
      emptyTitle="No selected candidates yet"
      emptyText="Candidates will appear here under their post."
      detail={openPost ? (
        <StageCandidateTable
          candidates={forPost}
          loading={loading}
          search={postSearch}
          onClose={() => setOpenPost(null)}
          emptyText="No candidates found."
          showStatus={false}
          footer={(c) => <SendCongratulationsButton candidate={c} labelled />}
        />
      ) : undefined}
    />
  );
}
