import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, updateDoc, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Candidate, RecruitmentRequest } from "@/types";
import CandidateList from "@/components/resume/CandidateList";
import toast from "react-hot-toast";
import { ArrowLeft, Calendar, Briefcase, MapPin, Search } from "lucide-react";
import { sendRoundInvite } from "@/lib/emailFunctions";
import { getAllApplications, setApplicationStatus } from "@/lib/jobApplications";
import { notifyCandidateOfStatusChange } from "@/lib/notificationHelper";

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
  const [search, setSearch] = useState("");
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
      toast.error("Failed to load candidates");
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
    return (
      <ShortlistedCandidateDetail
        candidate={selected}
        postTitle={posts.find(p => p.id === selectedCandidatePostId)?.jobTitle}
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

  if (!selectedPostView) {
    return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 bg-surface space-y-6 flex-1 min-h-0 flex flex-col">
      <div className="bg-surface p-4 rounded-xl border border-gray-200 flex-shrink-0 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">Shortlisted</h2>
          <p className="text-sm text-gray-500">Select a job post to view its shortlisted candidates.</p>
        </div>
        <div className="relative w-48 sm:w-56">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-brand" />
          </div>
          <input
            type="text"
            placeholder="Search posts..."
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-400 focus:outline-none focus:bg-surface focus:ring-2 focus:ring-brand/20 focus:border-brand sm:text-sm transition-all duration-200"
            value={postSearch}
            onChange={(e) => setPostSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 flex-1 flex items-center justify-center">Loading…</div>
      ) : postsWithCounts.length === 0 ? (
        <div className="bg-surface rounded-xl border border-dashed border-gray-300 p-12 text-center flex-1 flex items-center justify-center">
          <div>
            <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No shortlisted candidates yet</h3>
            <p className="mt-1 text-gray-500">Candidates you shortlist for your posts will appear here.</p>
          </div>
        </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 flex-1 content-start">
            {postsWithCounts.map((post) => (
              <div
                key={post.id}
                onClick={() => setSelectedPostView(post)}
              className="group relative bg-surface rounded-lg border border-gray-200 hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col h-full p-4 sm:p-6"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-lg font-bold text-gray-900 leading-tight line-clamp-2">{post.jobTitle}</h3>
                  {post.positionLevel && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap">
                      {post.positionLevel}
                    </span>
                  )}
                </div>
                {post.department && (
                  <div className="flex items-center text-xs sm:text-sm text-gray-500 font-medium mb-3">
                    <Briefcase className="w-3.5 h-3.5 mr-1.5" />
                    {post.department}
                  </div>
                )}
                {post.location && (
                  <div className="flex items-center text-xs sm:text-sm text-gray-500 font-medium mb-3">
                    <MapPin className="w-3.5 h-3.5 mr-1.5" />
                    {post.location}
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700">
                    {post.shortlistedCount} Shortlisted
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CandidateList
        candidates={candidates.filter(c => (c as any).postId === selectedPostView.id)}
        onSelectCandidate={setSelected}
        loading={loading}
        searchTerm={search}
        onSearchTermChange={setSearch}
        emptyMessage="No shortlisted candidates found."
        title={`Shortlisted — ${selectedPostView.jobTitle}`}
        onBack={() => { setSelectedPostView(null); setSearch(''); }}
        hideRole
      />
    </div>
  );
}

interface DetailProps {
  candidate: Candidate;
  onBack: () => void;
  onStatusUpdated?: () => void;
  /** Job post this candidate is shortlisted for, shown in the header. */
  postTitle?: string;
}

function ShortlistedCandidateDetail({ candidate, onBack, onStatusUpdated, postTitle }: DetailProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [roundName, setRoundName] = useState('Technical');

  const candidateId = candidate.id;
  const candidatePostId = (candidate as any).postId as string | undefined;

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

      toast.success("Moved to Round 1");
      onStatusUpdated?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setMoveLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-lg shadow overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-start gap-3">
          <button
            onClick={onBack}
            className="p-1.5 -ml-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors flex-shrink-0"
            title="Back to list"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-gray-900">{candidate.name}</h2>
              {postTitle && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand/10 text-brand border border-brand/20">
                  {postTitle}
                </span>
              )}
            </div>
            <p className="text-gray-600 text-sm mt-0.5">
              {candidate.email}
              {candidate.phone && (
                <>
                  <span className="mx-2 text-gray-400">•</span>
                  {candidate.phone}
                </>
              )}
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="table-fixed w-auto text-sm">
            <tbody className="divide-y divide-gray-100">
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-gray-600">Role</th>
                <td className="px-4 py-3 text-gray-800">{candidate.role}</td>
              </tr>
              <tr>
                <th className="w-48 px-4 py-3 text-left font-medium text-gray-600">Selected Date</th>
                <td className="px-4 py-3">
                  {selectedDate && response === 'accept' ? (
                    <span className="flex items-center text-gray-800"><Calendar className="h-4 w-4 mr-1 text-brand" /> {selectedDate}</span>
                  ) : response && response !== 'accept' ? (
                    <span className="text-red-600">Candidate responded "{response}"</span>
                  ) : (
                    <span className="text-red-600">Awaiting candidate response</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Additional details section */}
        {details && details.dateOfJoining ? (
          <div className="overflow-x-auto mt-4">
            <table className="table-fixed w-auto text-sm">
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <th className="w-48 px-4 py-3 text-left font-medium text-gray-600">Date of Joining</th>
                  <td className="px-4 py-3 text-gray-800">{details.dateOfJoining}</td>
                </tr>
                <tr>
                  <th className="w-48 px-4 py-3 text-left font-medium text-gray-600">Current Salary</th>
                  <td className="px-4 py-3 text-gray-800">{details.currentSalary || '-'}</td>
                </tr>
                <tr>
                  <th className="w-48 px-4 py-3 text-left font-medium text-gray-600">Expected Salary</th>
                  <td className="px-4 py-3 text-gray-800">{details.expectedSalary ? `${details.expectedSalary} / ${details.expectedSalaryPeriod}` : '-'}</td>
                </tr>
                <tr>
                  <th className="w-48 px-4 py-3 text-left font-medium text-gray-600">Years of Experience</th>
                  <td className="px-4 py-3 text-gray-800">{details.yearsExperience || '-'}</td>
                </tr>
                <tr>
                  <th className="w-48 px-4 py-3 text-left font-medium text-gray-600">Experience In</th>
                  <td className="px-4 py-3 text-gray-800">{details.experienceIn || '-'}</td>
                </tr>
                <tr>
                  <th className="w-48 px-4 py-3 text-left font-medium text-gray-600">Ready to Relocate</th>
                  <td className="px-4 py-3 text-gray-800">{details.readyToRelocate || '-'}</td>
                </tr>
                <tr>
                  <th className="w-48 px-4 py-3 text-left font-medium text-gray-600">Laptop</th>
                  <td className="px-4 py-3 text-gray-800">{details.laptop || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          response === 'accept' && (
            <p className="mt-6 text-red-600">Awaiting candidate details</p>
          )
        )}

        <div className="flex justify-end pt-4 gap-4">
          {response === 'accept' && (
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                placeholder="Round name (e.g. Technical)"
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
              <button
                disabled={moveLoading}
                onClick={moveToRound1}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
              >
                {moveLoading ? 'Moving…' : 'Move to Round1'}
              </button>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
} 