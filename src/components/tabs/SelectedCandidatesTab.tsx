import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Candidate } from "@/types";
import CandidateList from "@/components/resume/CandidateList";
import toast from "react-hot-toast";
import { ArrowLeft } from "lucide-react";
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
              className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} ${skin.radius} cursor-pointer transition-colors duration-200 hover:border-brand hover:text-brand ${FOCUS}`}
              title="Back"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
            </button>
            <div className="flex min-w-0 flex-col">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className={`${skin.heading} max-w-full truncate`}>{candidate.name}</h1>
                <span
                  className="inline-flex shrink-0 items-center whitespace-nowrap border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink"
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
                        await createCongratulationsNotification(candidate.email, candidate.role);
                      } catch (err) {
                        console.error('Failed to create notification', err);
                      }

                      toast.success('Email sent successfully');
                      setSent(true);
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to send email');
                    } finally {
                      setSending(false);
                    }
                  }}
                  className={`inline-flex items-center gap-2 cursor-pointer ${skin.cta} ${FOCUS} disabled:opacity-50`}
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
              className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} ${skin.radius} cursor-pointer transition-colors duration-200 hover:border-brand hover:text-brand ${FOCUS}`}
              title="Back"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
            </button>
            <div className="flex min-w-0 flex-col">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h1 className={`${skin.heading} max-w-full truncate`}>{candidate.name}</h1>
                <span
                  className="inline-flex shrink-0 items-center whitespace-nowrap border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink"
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

export default function SelectedCandidatesTab({ userRole, userId }: { userRole?: string | null; userId?: string | null }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<'selected' | 'rejected'>('selected');
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

        // 2. Fetch job applications
        let ownedPostIds: string[] = [];
        if (!isAdmin && userId) {
          const recruitsQs = await getDocs(query(collection(db, 'recruits'), where('recruiterId', '==', userId)));
          ownedPostIds = recruitsQs.docs.map(doc => doc.id);

          if (ownedPostIds.length === 0 && allCandidates.length === 0) {
            setCandidates([]);
            setLoading(false);
            return;
          }
        }

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
        toast.error("Failed to load candidates");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = candidates.filter((c) => {
    const st = (c as any).status || '';
    if (view === 'selected') return st === 'selected';
    if (view === 'rejected') return st.endsWith('rejected');
    return false;
  });

  if (selected) {
    const status = (selected as any).status || '';
    if (status === 'selected') {
      return <SelectedCandidateDetail candidate={selected} onBack={() => setSelected(null)} />;
    }
    if (status.endsWith('rejected')) {
      return <RejectedCandidateDetail candidate={selected} onBack={() => setSelected(null)} />;
    }
  }

  return (
    <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-6 flex-1 min-h-0 flex flex-col`}>
      <CandidateList
        candidates={filtered}
        onSelectCandidate={setSelected}
        loading={loading}
        searchTerm={search}
        onSearchTermChange={setSearch}
        emptyMessage="No candidates found."
        title={view === 'selected' ? 'Selected Candidates' : 'Rejected Candidates'}
        description={
          view === 'selected'
            ? 'Candidates who cleared all interview rounds and were selected for the role.'
            : 'Candidates who were rejected during the hiring process.'
        }
        hideEmptyIcon
        filterValue={view}
        filterOptions={[
          { value: 'selected', label: 'Selected Candidates' },
          { value: 'rejected', label: 'Rejected Candidates' }
        ]}
        onFilterChange={(value) => setView(value as 'selected' | 'rejected')}
      />
    </div>
  );
} 