import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, doc, getDoc, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAllApplications } from "@/lib/jobApplications";
import { getPostRounds, getRoundLabel } from "@/lib/interviewRounds";
import type { Candidate } from "@/types";
import type { RecruitmentRequest } from "@/types";
import CandidateList from "@/components/resume/CandidateList";
import InterviewCandidateDetail from "@/components/interview/InterviewCandidateDetail";
import { SelectedCandidateDetail } from "@/components/tabs/SelectedCandidatesTab";
import { ArrowLeft, Briefcase, MapPin, Clock, Search, ChevronDown } from "lucide-react";
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from "@/styles/skin";

const normalizeSkills = (skills: any): string[] => {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills.filter(Boolean);
  if (typeof skills === 'string') return skills.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

interface PostWithCount extends RecruitmentRequest {
  interviewCount: number;
}

export default function InterviewsTab({ userRole, userId, onCandidateSelected }: { userRole?: string | null; userId?: string | null; onCandidateSelected?: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [posts, setPosts] = useState<PostWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [selectedPost, setSelectedPost] = useState<PostWithCount | null>(null);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [postSearch, setPostSearch] = useState("");
  const skin = useSkin();

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
      popup.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  // Candidates shown for the interview module: every interview-stage candidate
  // by default (selected candidates have left the pipeline and live in the
  // Selected Candidates module), narrowed to one round when the dropdown says so.
  const activeCandidates = useMemo(() =>
    candidates.filter((c) => {
      const st = (c as any).status || '';
      return st && st !== 'pending' && st !== 'shortlisted' && st !== 'selected' && !st.endsWith('rejected');
    }),
    [candidates]
  );

  // Candidates shown for the selected post: every interview-stage candidate by
  // default, narrowed to one round when the dropdown says so.
  const postCandidates = useMemo(() => {
    if (!selectedPost) return [];
    return activeCandidates.filter((c) => {
      if ((c as any).postId !== selectedPost.id) return false;
      if (!selectedRound) return true;
      return ((c as any).status || '') === selectedRound;
    });
  }, [activeCandidates, selectedPost, selectedRound]);

  // Dropdown entries: All Rounds, then every configured round.
  const roundOptions = useMemo(() => {
    if (!selectedPost) return [];
    const options: { value: string; label: string }[] = [{ value: '', label: 'All Rounds' }];
    getPostRounds(selectedPost).forEach((round) => {
      options.push({ value: `round${round.roundNumber}`, label: getRoundLabel(round) });
    });
    return options;
  }, [selectedPost]);

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
        post={selectedPost}
        onBack={() => setSelectedCandidate(null)}
        onStatusUpdated={handleStatusUpdated}
        onCandidateSelected={onCandidateSelected}
      />
    );
  }

  // Post detail: the post's candidates shown straight away, with a rounds
  // dropdown to filter them - the rounds-cards step in between is gone.
  if (selectedPost) {
    return (
      <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-4 flex-1 min-h-0 flex flex-col`}>
        {/* Masthead - back control beside the title block, the post named as
            the description; no line separator. */}
        <div className={`shrink-0 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash} px-4 py-3.5 sm:px-5`}>
          <div className="flex min-w-0 items-center gap-3">
            <button
              className={`group inline-flex h-8 w-8 shrink-0 items-center justify-center ${skin.iconTile} rounded-lg cursor-pointer transition-colors duration-200 hover:border-ink/40 hover:text-ink ${FOCUS}`}
              onClick={() => { setSelectedPost(null); setSelectedRound(null); setSearchTerm(''); }}
              title="Back to posts"
              aria-label="Back to posts"
            >
              <ArrowLeft className="h-4 w-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <h2 className={`${skin.heading} truncate`}>Interview Rounds</h2>
              <p className={`mt-1.5 ${skin.body}`}>{selectedPost.jobTitle}</p>
            </div>
          </div>
        </div>

        {/* Controls row: search at the left end; candidate count followed by
            the rounds filter at the right end. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-ink/40" />
            </div>
            <input
              type="text"
              placeholder="Search candidates..."
              className={`block w-full h-9 pl-10 pr-3 sm:text-sm rounded-lg ${skin.field} ${FOCUS}`}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <span role="status" aria-atomic="true" className={`inline-flex shrink-0 items-center gap-1.5 ${skin.count} rounded-lg`}>
              {postCandidates.length} Candidate{postCandidates.length === 1 ? '' : 's'}
            </span>
            <div className="relative">
              <select
                value={selectedRound ?? ''}
                onChange={(e) => setSelectedRound(e.target.value || null)}
                className={`cursor-pointer appearance-none pl-3 pr-8 py-2 w-52 rounded-lg ${skin.field} ${FOCUS}`}
                aria-label="Filter by round"
              >
                {roundOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 ${skin.subtle}`}
              />
            </div>
          </div>
        </div>

        {/* Body - the white results panel, so the grey candidate list reads
            grey-on-white like the Shortlisted and Candidates modules. */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden thin-scrollbar">
          <div className={`${postCandidates.length === 0 ? 'min-h-full ' : ''}border ${skin.edge} ${skin.radius} ${skin.resultsPanel} p-3 md:p-4`}>
            <CandidateList
              candidates={postCandidates}
              onSelectCandidate={setSelectedCandidate}
              loading={loading}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              emptyMessage={selectedRound ? 'No candidates found in this round.' : 'No candidates in the interview pipeline for this post yet.'}
              hideHeader
              hideEmptyIcon
              onRefresh={fetchData}
            />
          </div>
        </div>
      </div>
    );
  }

  // View 1: Post cards
  const visiblePosts = posts.filter((p) => {
    if (!postSearch.trim()) return true;
    const term = postSearch.toLowerCase();
    return (
      p.jobTitle?.toLowerCase().includes(term) ||
      p.department?.toLowerCase().includes(term) ||
      p.location?.toLowerCase().includes(term)
    );
  });

  return (
    <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-4 flex-1 min-h-0 flex flex-col`}>
      {/* Header - brand-washed title over a description line, no separator. */}
      <div className={`shrink-0 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.headerWash} px-4 py-3.5 sm:px-5`}>
        <h2 className={skin.heading}>Interview Posts</h2>
        <p className={`mt-1.5 ${skin.body}`}>Select a post to view interview rounds</p>
      </div>

      {/* Controls row below the header: search at the left end, posts count at
          the right end - no animated indicator. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-ink/40" />
          </div>
          <input
            type="text"
            placeholder="Search posts..."
            className={`block w-full h-9 pl-10 pr-3 sm:text-sm rounded-lg ${skin.field} ${FOCUS}`}
            value={postSearch}
            onChange={(e) => setPostSearch(e.target.value)}
          />
        </div>
        <span role="status" aria-atomic="true" className={`inline-flex shrink-0 items-center gap-1.5 ${skin.count} rounded-lg`}>
          Posts: {visiblePosts.length}
        </span>
      </div>

      {/* Body - the white results panel, so the grey post cards read
          grey-on-white like the Shortlisted module. The panel hugs the grid
          and only fills the area while loading or empty. */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden thin-scrollbar">
      <div className={`${loading || visiblePosts.length === 0 ? 'min-h-full ' : ''}border ${skin.edge} ${skin.radius} ${skin.resultsPanel} p-3 md:p-4`}>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`animate-pulse border ${skin.edge} ${skin.cardSurface} ${skin.radius} p-6 space-y-3`}>
              <div className={`h-5 ${skin.skeleton} rounded w-2/3`}></div>
              <div className={`h-4 ${skin.skeleton} rounded w-1/3`}></div>
              <div className={`h-3 ${skin.skeleton} rounded w-1/2`}></div>
            </div>
          ))}
        </div>
      ) : visiblePosts.length === 0 ? (
        <div className={`border border-dashed ${skin.edge} ${skin.radius} p-12 text-center flex-1 flex items-center justify-center`}>
          <div>
            <h3 className={skin.emptyTitle}>{postSearch ? 'No matching posts' : 'No interview posts'}</h3>
            <p className={`mt-1 ${skin.body}`}>Posts will appear here once candidates enter the interview pipeline.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 content-start">
          {visiblePosts.map((post) => {
            const totalRounds = getPostRounds(post).length;
            return (
            <button
              key={post.id}
              onClick={() => setSelectedPost(post)}
              className={`border ${skin.edge} ${skin.cardSurface} ${skin.radius} p-6 text-left transition-colors duration-200 ${skin.cardHover} group ${FOCUS}`}
            >
              <div className="space-y-1 flex-1 min-w-0">
                <h4 className={`${skin.cardTitle} truncate`}>
                  {post.jobTitle}
                </h4>
                {post.department && (
                  <p className={`${skin.meta} truncate`}>{post.department}</p>
                )}
              </div>

              <div className={`mt-3 flex flex-wrap gap-3 ${skin.meta}`}>
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
                <div className="mt-3">
                  <span className={`mb-2 block ${skin.micro}`}>Skills</span>
                  <div className="flex flex-wrap gap-1">
                    {post.skills.split(',').slice(0, 3).map((skill, i) => (
                      <span key={i} className={`rounded-lg bg-border px-2 py-1 text-xs font-medium text-ink/70`}>
                        {skill.trim()}
                      </span>
                    ))}
                    {post.skills.split(',').length > 3 && (
                      <span className={`rounded-lg bg-border px-2 py-1 text-xs font-medium text-ink/70`}>
                        +{post.skills.split(',').length - 3}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 border-t ${skin.edge} pt-3`}>
                <span className={`${skin.statChip} rounded-lg`}>
                  {totalRounds} {totalRounds === 1 ? 'Round' : 'Rounds'}
                </span>
                <span className={`${skin.count} rounded-lg`}>
                  {post.interviewCount} {post.interviewCount === 1 ? 'Candidate' : 'Candidates'}
                </span>
              </div>
            </button>
            );
          })}
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
