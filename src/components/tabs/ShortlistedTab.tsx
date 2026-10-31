import { useRecordProfileView } from '@/lib/profileViews';
import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, updateDoc, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Candidate, RecruitmentRequest } from "@/types";
import StageCandidateTable from "@/components/recruitment/StageCandidateTable";
import popup from '@/components/ui/Popup';
import { ArrowLeft, Calendar } from "lucide-react";
import PostStageList from "@/components/recruitment/PostStageList";
import { sendRoundInvite } from "@/lib/emailFunctions";
import { getAllApplications, setApplicationStatus } from "@/lib/jobApplications";
import { notifyCandidateOfStatusChange } from "@/lib/notificationHelper";
import { getPostRounds, getRoundLabel } from "@/lib/interviewRounds";
import { useSkin, FOCUS } from "@/styles/skin";

const normalizeSkills = (skills: any): string[] => {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills.filter(Boolean);
  if (typeof skills === 'string') return skills.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

export default function ShortlistedTab({ candidateId, onBack, userRole, userId }: { candidateId?: string | null; onBack?: () => void; userRole?: string | null; userId?: string | null } = {}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
  const [selectedPostView, setSelectedPostView] = useState<RecruitmentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [postSearch, setPostSearch] = useState("");

  const loadCandidates = async () => {
    try {
      setLoading(true);
      const allCandidates: Candidate[] = [];
      const isAdmin = userRole === 'admin';

      // 0. Posts this user can see (their own, unless admin), used both to scope
      // shortlisted data and to group it by post.
      const postsQ = (!isAdmin && userId)
        ? query(collection(db, 'recruits'), where('recruiterId', '==', userId))
        : query(collection(db, 'recruits'));
      const postsSnap = await getDocs(postsQ);
      const postsData = postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as RecruitmentRequest));
      setPosts(postsData);
      const ownedPostIds = postsData.map(p => p.id as string);
      console.log('[Shortlisted] Owned posts:', ownedPostIds);

      // 1. Fetch manually uploaded candidates from Firestore, only ones shortlisted
      // to a post this user owns (or all, for admin).
      let candQ = query(collection(db, "candidates"), orderBy('createdAt', 'desc'));
      const qs = await getDocs(candQ);
      qs.forEach((d) => {
        const data = d.data();
        console.log('[Shortlisted] Candidate:', d.id, 'status:', data.status, 'postId:', data.postId);
        if (data.status !== 'shortlisted') return;
        if (!isAdmin && (!data.postId || !ownedPostIds.includes(data.postId))) return;
        allCandidates.push({ id: d.id, ...data } as Candidate);
      });
      console.log('[Shortlisted] Candidates from candidates collection:', allCandidates.length);

      // Sort manually
      allCandidates.sort((a, b) => {
        const dateA = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate() : (a.createdAt || 0);
        const dateB = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : (b.createdAt || 0);
        return Number(dateB) - Number(dateA);
      });

      // 2. Fetch shortlisted job applicants, scoped to owned posts
      if (!isAdmin && ownedPostIds.length === 0) {
        setCandidates(allCandidates);
        setLoading(false);
        return;
      }

      let applications: { user_id: string; post_id: string; status: string }[] = [];
      try {
        const allApps = await getAllApplications();
        console.log('[Shortlisted] ALL applications:', allApps.map(a => `user: ${a.user_id} | post: ${a.post_id} | status: ${a.status}`));
        applications = allApps.filter(app => {
          if (app.status !== 'shortlisted') return false;
          if (!isAdmin && !ownedPostIds.includes(app.post_id)) return false;
          return true;
        });
      } catch (appsError) {
        console.error('Error fetching shortlisted applications:', appsError);
      }
      console.log('[Shortlisted] Shortlisted applications:', applications.map(a => `user: ${a.user_id} | post: ${a.post_id} | status: ${a.status}`));

      if (applications && applications.length > 0) {
        // Fetch user details for each shortlisted applicant
        for (const app of applications) {
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
              console.log('[Shortlisted] Found user for application:', app.user_id, userData.name || userData.firstName);

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
                status: 'shortlisted' as any,
                postId: app.post_id,
                interviewDetails: intData as any
              } as Candidate);
            }
          } catch (err) {
            console.error(`Error fetching user ${app.user_id}:`, err);
          }
        }
      }

      console.log('[Shortlisted] Total candidates found:', allCandidates.length);
      setCandidates(allCandidates);

      // Auto-select candidate if candidateId is provided
      if (candidateId) {
        const candidate = allCandidates.find(c => c.id === candidateId);
        if (candidate) {
          setSelected(candidate);
          const postId = (candidate as any).postId;
          if (postId) {
            const post = postsData.find(p => p.id === postId);
            if (post) setSelectedPostView(post);
          }
        }
      }
    } catch (err) {
      console.error(err);
      popup.error("Failed to load candidates");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, [candidateId]);

  const handleStatusUpdated = () => {
    setSelected(null);
    loadCandidates();
  };

  if (selected) {
    const selectedCandidatePostId = (selected as Candidate & { postId?: string }).postId;
    const selectedPost = posts.find(p => p.id === selectedCandidatePostId);
    return (
      <ShortlistedCandidateDetail
        candidate={selected}
        post={selectedPost}
        postTitle={selectedPost?.jobTitle}
        onBack={() => {
          setSelected(null);
          // If there's a parent onBack and we came from another tab, call it
          if (onBack && candidateId) {
            onBack();
          }
        }}
        onStatusUpdated={handleStatusUpdated}
      />
    );
  }

  const postsWithCounts = posts
    .map(p => ({ ...p, shortlistedCount: candidates.filter(c => (c as any).postId === p.id).length }))
    .filter(p => p.shortlistedCount > 0)
    .filter(p => {
      if (!postSearch.trim()) return true;
      const term = postSearch.toLowerCase();
      return (
        p.jobTitle?.toLowerCase().includes(term) ||
        p.department?.toLowerCase().includes(term) ||
        p.location?.toLowerCase().includes(term)
      );
    });

  const moveCandidateToRound = async (candidate: Candidate, roundName: string) => {
    try {
      const applicantPostId = (candidate as any).postId as string | undefined;
      if (applicantPostId) {
        await setApplicationStatus(applicantPostId, candidate.id, 'round1');
      } else {
        await updateDoc(doc(db, "candidates", candidate.id), { status: "round1", updatedAt: new Date() });
      }
      const interviewRef = doc(db, "interviews", candidate.id);
      const intSnap = await getDoc(interviewRef);
      if (intSnap.exists()) {
        const updateData: any = { roundType: roundName, status: 'round1', updatedAt: new Date() };
        if (applicantPostId) updateData.postId = applicantPostId;
        await updateDoc(interviewRef, updateData);
      } else {
        const { setDoc } = await import('firebase/firestore');
        const createData: any = { roundType: roundName, status: 'round1', candidateId: candidate.id, createdAt: new Date() };
        if (applicantPostId) createData.postId = applicantPostId;
        await setDoc(interviewRef, createData);
      }
      try {
        await sendRoundInvite({
          candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
          roundName,
          roundNumber: 1,
          role: candidate.role || 'the position',
          baseUrl: window.location.origin,
        });
      } catch (emailErr) {
        console.error('Failed to send round email:', emailErr);
      }
      void notifyCandidateOfStatusChange({
        candidateId: candidate.id,
        postId: applicantPostId,
        status: 'round1',
        roundLabel: roundName,
      });
      popup.success("Moved to Round 1");
      loadCandidates();
    } catch (err: any) {
      popup.error(err.message || "Failed to update status");
    }
  };

  const shortlistedForPost = selectedPostView
    ? candidates.filter(c => (c as any).postId === selectedPostView.id)
    : [];

  return (
    <PostStageList
      title="Shortlisted"
      plain
      items={postsWithCounts.map((p) => ({ post: p, count: p.shortlistedCount }))}
      countNoun="shortlisted"
      loading={loading}
      search={postSearch}
      onSearch={setPostSearch}
      selectedId={selectedPostView?.id ?? null}
      onOpen={(p) => {  setSelectedPostView(selectedPostView?.id === p.id ? null : p); }}
      emptyTitle="No shortlisted candidates yet"
      emptyText="Candidates you shortlist for your posts will appear here."
      detail={selectedPostView ? (
        <StageCandidateTable
          candidates={shortlistedForPost}
          loading={loading}
          search={postSearch}
          defaultRound={firstRoundName(selectedPostView)}
          onMove={moveCandidateToRound}
          onClose={() => { setSelectedPostView(null);  }}
          emptyText="No shortlisted candidates found."
          onRefresh={loadCandidates}
        />
      ) : undefined}
    />
  );
}

interface DetailProps {
  candidate: Candidate;
  onBack: () => void;
  onStatusUpdated?: () => void;
  /** Job post this candidate is shortlisted for, shown in the header. */
  postTitle?: string;
  /** Full post record — its rounds decide the round name used when moving to Round 1. */
  post?: RecruitmentRequest;
}

/** Name of a post's first interview round, the round we move shortlisted candidates into. */
function firstRoundName(post?: RecruitmentRequest | null): string {
  const first = getPostRounds(post)[0];
  return first.name || getRoundLabel(first);
}

function ShortlistedCandidateDetail({ candidate, onBack, onStatusUpdated, postTitle, post }: DetailProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [roundName, setRoundName] = useState(() => firstRoundName(post));

  const candidateId = candidate.id;
  const candidatePostId = (candidate as any).postId as string | undefined;
  const skin = useSkin();
  useRecordProfileView(candidateId);

  // Keep the round name in sync with the post's first round (the detail can be
  // re-used across candidates without remounting).
  useEffect(() => {
    setRoundName(firstRoundName(post));
  }, [post]);

  useEffect(() => {
    const loadInterview = async () => {
      try {
        const snap = await getDoc(doc(db, "interviews", candidateId));
        if (snap.exists()) {
          const data: any = snap.data();
          // The doc is keyed by candidate only; a response recorded for another
          // post must not show up here.
          if (data.postId && candidatePostId && data.postId !== candidatePostId) return;
          setSelectedDate(data.selectedDate ?? null);
          setResponse(data.response ?? null);
          setDetails(data);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadInterview();
  }, [candidateId, candidatePostId]);

  const moveToRound1 = async () => {
    if (moveLoading) return;
    setMoveLoading(true);
    try {
      const effectiveRoundName = roundName.trim() || 'Round 1';
      const applicantPostId = (candidate as any).postId;
      if (applicantPostId) {
        await setApplicationStatus(applicantPostId, candidate.id, 'round1');
      } else {
        await updateDoc(doc(db, "candidates", candidate.id), { status: "round1", updatedAt: new Date() });
      }

      // Save round name to interviews collection
      const interviewRef = doc(db, "interviews", candidate.id);
      const intSnap = await getDoc(interviewRef);
      if (intSnap.exists()) {
        const updateData: any = { roundType: effectiveRoundName, status: 'round1', updatedAt: new Date() };
        if (applicantPostId) updateData.postId = applicantPostId;
        await updateDoc(interviewRef, updateData);
      } else {
        const { setDoc } = await import('firebase/firestore');
        const createData: any = { roundType: effectiveRoundName, status: 'round1', candidateId: candidate.id, createdAt: new Date() };
        if (applicantPostId) createData.postId = applicantPostId;
        await setDoc(interviewRef, createData);
      }

      // Send round invite email
      try {
        const baseUrl = window.location.origin;
        await sendRoundInvite({
          candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
          roundName: effectiveRoundName,
          roundNumber: 1,
          role: candidate.role || 'the position',
          baseUrl,
        });
      } catch (emailErr) {
        console.error('Failed to send round email:', emailErr);
      }
      
      void notifyCandidateOfStatusChange({
        candidateId: candidate.id,
        postId: applicantPostId,
        status: 'round1',
        roundLabel: effectiveRoundName,
      });

      popup.success("Moved to Round 1");
      onStatusUpdated?.();
    } catch (err: any) {
      popup.error(err.message || "Failed to update status");
    } finally {
      setMoveLoading(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Masthead - back control + identity: the job title sits beside the
          candidate name in the same colour, with a description underneath.
          No line separator between rows; the back arrow uses the same
          rounded-lg as the buttons. */}
      <div className={`shrink-0 mb-4 overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash} px-4 py-3.5 sm:px-5`}>
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onBack}
            className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} rounded-lg cursor-pointer transition-colors duration-200 hover:border-ink/40 hover:text-ink ${FOCUS}`}
            title="Back to list"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className={`${skin.heading} max-w-full truncate`}>{candidate.name}</h1>
              {postTitle && (
                <>
                  <span aria-hidden="true" className={skin.subtle}>·</span>
                  <span className={`${skin.heading} max-w-full truncate`}>{postTitle}</span>
                </>
              )}
            </div>
            <p className={`mt-1.5 ${skin.body}`}>Review the candidate's details and move them forward to the next interview round.</p>
          </div>
        </div>
      </div>

      {/* Controls row below the header: round name and move action pinned to
          the right end. */}
      {response === 'accept' && (
        <div className="mb-4 flex shrink-0 flex-wrap items-center justify-end gap-3">
          <input
            type="text"
            value={roundName}
            onChange={(e) => setRoundName(e.target.value)}
            placeholder="Round name (e.g. Technical)"
            className={`px-3 py-2 rounded-lg ${skin.field} ${FOCUS}`}
          />
          <button
            disabled={moveLoading}
            onClick={moveToRound1}
            className={`inline-flex items-center gap-2 cursor-pointer rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}
          >
            {moveLoading ? 'Moving…' : 'Move to Round1'}
          </button>
        </div>
      )}

      {/* Body - white surface with no shadow; the details themselves sit on
          a grey section inside it. */}
      <div className={`flex flex-1 min-h-0 flex-col overflow-hidden border ${skin.edge} ${skin.surface} ${skin.radius}`}>
        <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
        <div className={`border ${skin.edge} ${skin.radius} ${skin.canvas} overflow-hidden`}>
        {/* Single table, no row separators — details sit directly under the
            selected-date row when they exist, so the spacing stays uniform. */}
        <div className="overflow-x-auto">
          <table className="table-fixed w-auto text-sm">
            <tbody>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Email</th>
                <td className="px-4 py-3 text-ink/80">{candidate.email || '-'}</td>
              </tr>
              {candidate.phone && (
                <tr>
                  <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Phone</th>
                  <td className="px-4 py-3 text-ink/80">{candidate.phone}</td>
                </tr>
              )}
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Role</th>
                <td className="px-4 py-3 text-ink/80">{candidate.role}</td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Selected Date</th>
                <td className="px-4 py-3">
                  {selectedDate && response === 'accept' ? (
                    <span className="flex items-center text-ink/80"><Calendar className="h-4 w-4 mr-1 text-brand" /> {selectedDate}</span>
                  ) : response && response !== 'accept' ? (
                    <span className="text-destructive">Candidate responded "{response}"</span>
                  ) : (
                    <span className="text-destructive">Awaiting candidate response</span>
                  )}
                </td>
              </tr>
              {details?.dateOfJoining ? (
                <>
                  <tr>
                    <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Date of Joining</th>
                    <td className="px-4 py-3 text-ink/80">{details.dateOfJoining}</td>
                  </tr>
                  <tr>
                    <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Current Salary</th>
                    <td className="px-4 py-3 text-ink/80">{details.currentSalary || '-'}</td>
                  </tr>
                  <tr>
                    <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Expected Salary</th>
                    <td className="px-4 py-3 text-ink/80">{details.expectedSalary ? `${details.expectedSalary} / ${details.expectedSalaryPeriod}` : '-'}</td>
                  </tr>
                  <tr>
                    <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Years of Experience</th>
                    <td className="px-4 py-3 text-ink/80">{details.yearsExperience || '-'}</td>
                  </tr>
                  <tr>
                    <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Experience In</th>
                    <td className="px-4 py-3 text-ink/80">{details.experienceIn || '-'}</td>
                  </tr>
                  <tr>
                    <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Ready to Relocate</th>
                    <td className="px-4 py-3 text-ink/80">{details.readyToRelocate || '-'}</td>
                  </tr>
                  <tr>
                    <th className="w-48 px-4 py-3 text-left font-medium text-ink/70">Laptop</th>
                    <td className="px-4 py-3 text-ink/80">{details.laptop || '-'}</td>
                  </tr>
                </>
              ) : (
                response === 'accept' && (
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-destructive">Awaiting candidate details</td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
        </div>
        </div>
      </div>
    </div>
  );
} 