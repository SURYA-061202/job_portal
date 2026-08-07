import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, updateDoc, setDoc, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Candidate, RecruitmentRequest } from "@/types";
import CandidateList from "@/components/resume/CandidateList";
import toast from "react-hot-toast";
import { ArrowLeft, Calendar, Briefcase, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { createVerifyDetailsNotification } from "@/lib/notificationHelper";

export default function ShortlistedTab({ candidateId, onBack, userRole, userId }: { candidateId?: string | null; onBack?: () => void; userRole?: string | null; userId?: string | null } = {}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
  const [selectedPostView, setSelectedPostView] = useState<RecruitmentRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [search, setSearch] = useState("");

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

      // 1. Fetch manually uploaded candidates from Firestore, only ones shortlisted
      // to a post this user owns (or all, for admin).
      let candQ = query(collection(db, "candidates"), orderBy('createdAt', 'desc'));
      const qs = await getDocs(candQ);
      qs.forEach((d) => {
        const data = d.data();
        if (data.status !== 'shortlisted') return;
        if (!isAdmin && (!data.postId || !ownedPostIds.includes(data.postId))) return;
        allCandidates.push({ id: d.id, ...data } as Candidate);
      });

      // Sort manually
      allCandidates.sort((a, b) => {
        const dateA = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate() : (a.createdAt || 0);
        const dateB = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : (b.createdAt || 0);
        return Number(dateB) - Number(dateA);
      });

      // 2. Fetch shortlisted job applicants from Supabase, scoped to owned posts
      if (!isAdmin && ownedPostIds.length === 0) {
        setCandidates(allCandidates);
        setLoading(false);
        return;
      }

      let supabaseQuery = supabase
        .from('job_applications')
        .select('user_id, post_id')
        .eq('status', 'shortlisted');

      if (!isAdmin) {
        supabaseQuery = supabaseQuery.in('post_id', ownedPostIds);
      }

      const { data: applications, error: appsError } = await supabaseQuery;

      if (appsError) {
        console.error('Error fetching shortlisted applications:', appsError);
      } else if (applications && applications.length > 0) {
        // Fetch user details for each shortlisted applicant
        for (const app of applications) {
          try {
            const userDoc = await getDoc(doc(db, 'users', app.user_id));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              const intDoc = await getDoc(doc(db, 'interviews', app.user_id));
              const intData = intDoc.exists() ? intDoc.data() : {};

              allCandidates.push({
                id: app.user_id,
                name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || userData.email || 'Unnamed Candidate',
                email: userData.email || '',
                phone: userData.mobile || '',
                role: userData.department || 'Applicant',
                experience: userData.yearsOfExperience || '',
                skills: userData.skills ? (typeof userData.skills === 'string' ? userData.skills.split(',').map((s: string) => s.trim()) : userData.skills) : [],
                resumeUrl: userData.resumeUrl || '',
                extractedData: {
                  summary: '',
                  workExperience: [],
                  education: [],
                  skills: userData.skills ? (typeof userData.skills === 'string' ? userData.skills.split(',').map((s: string) => s.trim()) : userData.skills) : [],
                  certifications: [],
                  projects: []
                },
                education: [],
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
    return (
      <ShortlistedCandidateDetail
        candidate={selected}
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
    .filter(p => p.shortlistedCount > 0);

  if (!selectedPostView) {
    return (
      <div className="space-y-6">
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">Shortlisted</h2>
          <p className="text-sm text-gray-500">Select a job post to view its shortlisted candidates.</p>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading…</div>
        ) : postsWithCounts.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No shortlisted candidates yet</h3>
            <p className="mt-1 text-gray-500">Candidates you shortlist for your posts will appear here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {postsWithCounts.map((post) => (
              <div
                key={post.id}
                onClick={() => setSelectedPostView(post)}
                className="bg-white rounded-2xl border border-gray-200 hover:border-orange-500/20 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer overflow-hidden group p-4 sm:p-6"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <h3 className="text-lg font-bold text-gray-900 leading-tight line-clamp-2">{post.jobTitle}</h3>
                  {post.positionLevel && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">
                      {post.positionLevel}
                    </span>
                  )}
                </div>
                {post.department && (
                  <div className="flex items-center text-xs sm:text-sm text-gray-500 font-medium mb-2">
                    <Briefcase className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                    {post.department}
                  </div>
                )}
                {post.location && (
                  <div className="flex items-center text-xs sm:text-sm text-gray-500 font-medium mb-3">
                    <MapPin className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                    {post.location}
                  </div>
                )}
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-orange-600">
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
      <button
        onClick={() => { setSelectedPostView(null); setSearch(''); }}
        className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Posts
      </button>
      <CandidateList
        candidates={candidates.filter(c => (c as any).postId === selectedPostView.id)}
        onSelectCandidate={setSelected}
        loading={loading}
        searchTerm={search}
        onSearchTermChange={setSearch}
        emptyMessage="No shortlisted candidates found."
        title={`Shortlisted — ${selectedPostView.jobTitle}`}
      />
    </div>
  );
}

interface DetailProps {
  candidate: Candidate;
  onBack: () => void;
  onStatusUpdated?: () => void;
}

function ShortlistedCandidateDetail({ candidate, onBack, onStatusUpdated }: DetailProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [response, setResponse] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [details, setDetails] = useState<any>(null);
  const [moveLoading, setMoveLoading] = useState(false);
  const [roundName, setRoundName] = useState('Technical');

  useEffect(() => {
    const loadInterview = async () => {
      try {
        const snap = await getDoc(doc(db, "interviews", candidate.id));
        if (snap.exists()) {
          const data: any = snap.data();
          setSelectedDate(data.selectedDate ?? null);
          setResponse(data.response ?? null);
          setDetails(data);
          if (data.verifyMailSentAt) setSent(true);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadInterview();
  }, [candidate.id]);

  const handleVerifyDetails = async () => {
    if (sending || sent) return;
    setSending(true);
    try {
      const interviewurl = `${window.location.origin}`;
      const { data, error } = await supabase.functions.invoke("send_verify_details", {
        body: {
          candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
          baseUrl: interviewurl,
        },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error || "Failed to send mail");

      // Mark that verify details mail sent in interview doc (create if needed)
      const interviewRef = doc(db, "interviews", candidate.id);
      const snap = await getDoc(interviewRef);
      if (snap.exists()) {
        await updateDoc(interviewRef, { verifyMailSentAt: new Date() });
      } else {
        await setDoc(interviewRef, { verifyMailSentAt: new Date() });
      }

      // Create notification for the candidate
      try {
        await createVerifyDetailsNotification(candidate.email);
      } catch (err) {
        console.error('Failed to create notification', err);
      }

      toast.success("Verification email sent and status moved to round1");
      setSent(true);
      onStatusUpdated?.();
    } catch (err: any) {
      toast.error(err.message || "Failed to send mail");
    } finally {
      setSending(false);
    }
  };

  const moveToRound1 = async () => {
    if (moveLoading) return;
    setMoveLoading(true);
    try {
      const effectiveRoundName = roundName.trim() || 'Round 1';
      const applicantPostId = (candidate as any).postId;
      if (applicantPostId) {
        const { error } = await supabase
          .from('job_applications')
          .update({ status: 'round1' })
          .eq('user_id', candidate.id)
          .eq('post_id', applicantPostId);
          
        if (error) throw error;
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
        await supabase.functions.invoke('send_round_invite', {
          body: {
            candidate: { id: candidate.id, name: candidate.name, email: candidate.email },
            roundName: effectiveRoundName,
            roundNumber: 1,
            role: candidate.role || 'the position',
            baseUrl
          }
        });
      } catch (emailErr) {
        console.error('Failed to send round email:', emailErr);
      }
      
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
      <button onClick={onBack} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-5 w-5" />
        <span>Back to List</span>
      </button>

      <div className="bg-white rounded-lg shadow overflow-x-auto p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-gray-900">{candidate.name}</h2>
          <p className="text-gray-600 text-sm">
            {candidate.email}
            {candidate.phone && (
              <>
                <span className="mx-2 text-gray-400">•</span>
                {candidate.phone}
              </>
            )}
          </p>
        </div>
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
                    <span className="flex items-center text-gray-800"><Calendar className="h-4 w-4 mr-1 text-primary-600" /> {selectedDate}</span>
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
          sent && (
            <p className="mt-6 text-red-600">Awaiting candidate details</p>
          )
        )}

        <div className="flex justify-end pt-4 gap-4">
          {sent && (
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={roundName}
                onChange={(e) => setRoundName(e.target.value)}
                placeholder="Round name (e.g. Technical)"
                className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
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
          <button
            disabled={sending || sent}
            onClick={handleVerifyDetails}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium shadow ${sent ? "bg-gray-300 text-gray-600" : "bg-primary-600 text-white hover:bg-primary-700"} disabled:opacity-50`}
          >
            {sending ? "Sending…" : sent ? "Sent" : "Verify Details"}
          </button>
        </div>
      </div>
    </div>
  );
} 