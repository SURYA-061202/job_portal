import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, doc, getDoc, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAllApplications } from "@/lib/jobApplications";
import type { Candidate } from "@/types";
import type { RecruitmentRequest } from "@/types";
import CandidateList from "@/components/resume/CandidateList";
import InterviewCandidateDetail from "@/components/interview/InterviewCandidateDetail";
import { SelectedCandidateDetail } from "@/components/tabs/SelectedCandidatesTab";
import { ArrowLeft, Users, Briefcase, MapPin, Clock } from "lucide-react";
import toast from "react-hot-toast";

const normalizeSkills = (skills: any): string[] => {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills.filter(Boolean);
  if (typeof skills === 'string') return skills.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

const ROUND_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  round1: { bg: "bg-brand/10", border: "border-brand/30", text: "text-brand", badge: "bg-brand/20 text-brand" },
  round2: { bg: "bg-brand/10", border: "border-brand/30", text: "text-brand", badge: "bg-brand/20 text-brand" },
  round3: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  round4: { bg: "bg-brand/10", border: "border-brand/30", text: "text-brand", badge: "bg-brand/20 text-brand" },
  round5: { bg: "bg-rose-50", border: "border-rose-200", text: "text-rose-700", badge: "bg-rose-100 text-rose-700" },
  round6: { bg: "bg-brand/10", border: "border-brand/30", text: "text-brand", badge: "bg-brand/20 text-brand" },
  round7: { bg: "bg-brand/10", border: "border-brand/30", text: "text-brand", badge: "bg-brand/20 text-brand" },
  round8: { bg: "bg-brand/10", border: "border-brand/30", text: "text-brand", badge: "bg-brand/20 text-brand" },
  round9: { bg: "bg-brand/10", border: "border-brand/30", text: "text-brand", badge: "bg-brand/20 text-brand" },
  selected: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", badge: "bg-green-100 text-green-700" },
};

const DEFAULT_COLORS = { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", badge: "bg-gray-100 text-gray-700" };

interface PostWithCount extends RecruitmentRequest {
  interviewCount: number;
}

export default function InterviewsTab({ userRole, userId }: { userRole?: string | null; userId?: string | null }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [posts, setPosts] = useState<PostWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [selectedPost, setSelectedPost] = useState<PostWithCount | null>(null);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const allCandidates: Candidate[] = [];
      const isAdmin = userRole === 'admin';

      // 1. Fetch from Firestore candidates
      let candQuery = query(collection(db, "candidates"), orderBy('createdAt', 'desc'));
      const qs = await getDocs(candQuery);
      qs.forEach((d) => {
        allCandidates.push({ id: d.id, ...d.data() } as Candidate);
      });

      allCandidates.sort((a, b) => {
        const dateA = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate() : (a.createdAt || 0);
        const dateB = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : (b.createdAt || 0);
        return Number(dateB) - Number(dateA);
      });

      // 2. Fetch job applications currently in an interview round or selected
      let ownedPostIds: string[] = [];
      if (!isAdmin && userId) {
        const recruitsQs = await getDocs(query(collection(db, 'recruits'), where('recruiterId', '==', userId)));
        ownedPostIds = recruitsQs.docs.map(doc => doc.id);

        if (ownedPostIds.length === 0) {
          setCandidates(allCandidates);
          setLoading(false);
          return;
        }
      }

      let applications: { user_id: string; post_id: string; status: string }[] = [];
      try {
        applications = (await getAllApplications()).filter(app => {
          const isRoundOrSelected = /^round\d+$/.test(app.status) || app.status === 'selected';
          if (!isRoundOrSelected) return false;
          if (!isAdmin && ownedPostIds.length > 0 && !ownedPostIds.includes(app.post_id)) return false;
          return true;
        });
      } catch (appsError) {
        console.error('Error fetching applications:', appsError);
      }

      if (applications && applications.length > 0) {
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

      // 3. Fetch posts that have candidates in interview rounds
      const postIds = new Set<string>();
      for (const c of allCandidates) {
        const st = (c as any).status || '';
        const pid = (c as any).postId;
        if (pid && st && st !== 'pending' && st !== 'shortlisted' && !st.endsWith('rejected')) {
          postIds.add(pid);
        }
      }

      const postList: PostWithCount[] = [];
      for (const pid of postIds) {
        try {
          const postDoc = await getDoc(doc(db, 'recruits', pid));
          if (postDoc.exists()) {
            const postData = { id: postDoc.id, ...postDoc.data() } as RecruitmentRequest;
            const count = allCandidates.filter(c => (c as any).postId === pid && (() => {
              const st = (c as any).status || '';
              return st && st !== 'pending' && st !== 'shortlisted' && !st.endsWith('rejected');
            })()).length;
            postList.push({ ...postData, interviewCount: count });
          }
        } catch (err) {
          console.error(`Error fetching post ${pid}:`, err);
        }
      }

      postList.sort((a, b) => {
        const dateA = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate() : (a.createdAt || 0);
        const dateB = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : (b.createdAt || 0);
        return Number(dateB) - Number(dateA);
      });

      setPosts(postList);
    } catch (err) {
      console.error("Failed to load interview data", err);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const activeCandidates = useMemo(() =>
    candidates.filter((c) => {
      const st = (c as any).status || '';
      return st && st !== 'pending' && st !== 'shortlisted' && !st.endsWith('rejected');
    }),
    [candidates]
  );

  const postRounds = useMemo(() => {
    if (!selectedPost) return [];
    const map = new Map<string, number>();
    for (const c of activeCandidates) {
      if ((c as any).postId !== selectedPost.id) continue;
      const st = (c as any).status || '';
      map.set(st, (map.get(st) || 0) + 1);
    }
    const entries = Array.from(map.entries());
    entries.sort((a, b) => {
      const numA = parseInt((a[0].match(/^round(\d+)$/) || [,'0'])[1]);
      const numB = parseInt((b[0].match(/^round(\d+)$/) || [,'0'])[1]);
      if (numA !== numB) return numA - numB;
      if (a[0] === 'selected') return 1;
      if (b[0] === 'selected') return -1;
      return a[0].localeCompare(b[0]);
    });
    return entries;
  }, [activeCandidates, selectedPost]);

  const roundCandidates = useMemo(() => {
    if (!selectedPost || !selectedRound) return [];
    return candidates.filter((c) => {
      const st = (c as any).status || '';
      const pid = (c as any).postId;
      if (pid !== selectedPost.id) return false;
      if (selectedRound === 'selected') return st === 'selected';
      return st === selectedRound;
    });
  }, [candidates, selectedPost, selectedRound]);

  const handleStatusUpdated = () => {
    fetchData();
  };

  if (selectedCandidate) {
    const statusSel = (selectedCandidate as any).status;
    if (statusSel === 'selected') {
      return <SelectedCandidateDetail candidate={selectedCandidate} onBack={() => setSelectedCandidate(null)} />;
    }
    return (
      <InterviewCandidateDetail
        candidate={selectedCandidate}
        onBack={() => setSelectedCandidate(null)}
        onStatusUpdated={handleStatusUpdated}
      />
    );
  }

  // View 3: Candidates in a round for a post
  if (selectedPost && selectedRound) {
    const displayName = selectedRound === 'selected' ? 'Selected' : selectedRound.replace(/^round/, 'Round ');
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            className="p-1 rounded-lg text-brand hover:text-gray-900 hover:bg-brand/10 transition-colors"
            onClick={() => { setSelectedRound(null); setSearchTerm(''); }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="text-xs text-brand uppercase tracking-wider font-medium">{selectedPost.jobTitle}</p>
            <h2 className="text-lg font-bold text-gray-900">{displayName}</h2>
          </div>
        </div>

        <CandidateList
          candidates={roundCandidates}
          onSelectCandidate={setSelectedCandidate}
          loading={loading}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          emptyMessage={`No candidates found in ${displayName}.`}
          title={`${displayName} Candidates`}
        />
      </div>
    );
  }

  // View 2: Rounds for a post
  if (selectedPost) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            className="p-1 rounded-lg text-brand hover:text-gray-900 hover:bg-brand/10 transition-colors"
            onClick={() => { setSelectedPost(null); setSelectedRound(null); }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <p className="text-xs text-brand uppercase tracking-wider font-medium">{selectedPost.jobTitle}</p>
            <h2 className="text-lg font-bold text-gray-900">Interview Rounds</h2>
          </div>
        </div>

        {postRounds.length === 0 ? (
          <div className="bg-surface rounded-xl shadow-sm border border-brand/20 p-12 text-center">
            <Users className="h-12 w-12 text-brand mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No rounds yet</h3>
            <p className="mt-1 text-brand">Candidates will appear here once they enter the interview pipeline.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {postRounds.map(([status, count]) => {
              const colors = ROUND_COLORS[status] || DEFAULT_COLORS;
              const displayName = status === 'selected' ? 'Selected' : status.replace(/^round/, 'Round ');
              const roundNum = (status.match(/^round(\d+)$/) || [,''])[1];

              return (
                <button
                  key={status}
                  onClick={() => setSelectedRound(status)}
                  className={`${colors.bg} ${colors.border} border rounded-xl p-6 text-left hover:shadow-md transition-all duration-200 group`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className={`text-sm font-semibold ${colors.text} uppercase tracking-wide`}>
                        {displayName}
                      </p>
                      <p className="mt-3 text-3xl font-bold text-gray-900">{count}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        candidate{count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {roundNum && (
                      <span className={`${colors.badge} text-xs font-bold px-2 py-1 rounded-lg`}>
                        R{roundNum}
                      </span>
                    )}
                    {status === 'selected' && (
                      <span className={`${colors.badge} text-xs font-bold px-2 py-1 rounded-lg`}>
                        ✓
                      </span>
                    )}
                  </div>
                  <div className="mt-4 text-sm text-gray-500 group-hover:text-gray-700 transition-colors">
                    View candidates →
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // View 1: Post cards
  return (
    <div className="-m-4 md:-m-6 p-4 md:p-6 bg-surface space-y-6 flex-1 min-h-0 flex flex-col">
      <div className="bg-surface p-4 rounded-xl border border-gray-200 flex-shrink-0">
        <h3 className="text-lg font-bold text-gray-900">Interview Posts</h3>
        <p className="text-sm text-gray-500 mt-1">Select a post to view interview rounds</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-surface rounded-xl border border-gray-200 p-6 space-y-3">
              <div className="h-5 bg-gray-100 rounded w-2/3"></div>
              <div className="h-4 bg-gray-100 rounded w-1/3"></div>
              <div className="h-3 bg-gray-100 rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-surface rounded-xl border border-gray-200 p-12 text-center flex-1 flex items-center justify-center">
          <div>
            <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No interview posts</h3>
            <p className="mt-1 text-gray-500">Posts will appear here once candidates enter the interview pipeline.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 flex-1 content-start">
          {posts.map((post) => (
            <button
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className="bg-surface border border-gray-200 rounded-xl p-6 text-left hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-300 group"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1 flex-1 min-w-0">
                  <h4 className="text-base font-semibold text-gray-900 truncate">
                    {post.jobTitle}
                  </h4>
                  {post.department && (
                    <p className="text-sm text-gray-500 truncate">{post.department}</p>
                  )}
                </div>
                <span className="ml-3 flex-shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                  {post.interviewCount}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 font-medium">
                {post.location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {post.location}
                  </span>
                )}
                {post.positionLevel && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" /> {post.positionLevel}
                  </span>
                )}
                {post.createdAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {
                      (() => {
                        const d = (post.createdAt as any)?.toDate ? (post.createdAt as any).toDate() : new Date(post.createdAt);
                        const diff = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
                        if (diff === 0) return 'Today';
                        if (diff === 1) return 'Yesterday';
                        return `${diff}d ago`;
                      })()
                    }
                  </span>
                )}
              </div>

              {post.skills && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {post.skills.split(',').slice(0, 3).map((skill, i) => (
                    <span key={i} className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                      {skill.trim()}
                    </span>
                  ))}
                  {post.skills.split(',').length > 3 && (
                    <span className="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                      +{post.skills.split(',').length - 3}
                    </span>
                  )}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-gray-200 text-xs font-bold text-gray-700">
                View rounds →
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
