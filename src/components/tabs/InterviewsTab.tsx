import type { InterviewDetails } from '@/types';
import type { DocumentData } from 'firebase/firestore';
import { toMillis } from '@/lib/dates';
import AppliedTab from '@/components/tabs/AppliedTab';
import PostStageList from '@/components/recruitment/PostStageList';
import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, doc, getDoc, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getAllApplications } from "@/lib/jobApplications";
import { getPostRounds, getRoundLabel } from "@/lib/interviewRounds";
import type { Candidate } from "@/types";
import type { RecruitmentRequest } from "@/types";
import StageCandidateTable from "@/components/recruitment/StageCandidateTable";
import InterviewCandidateDetail from "@/components/interview/InterviewCandidateDetail";
import { ChevronDown, Search } from "lucide-react";
import popup from '@/components/ui/Popup';
import { useSkin, FOCUS } from "@/styles/skin";

const normalizeSkills = (skills: unknown): string[] => {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills.filter(Boolean);
  if (typeof skills === 'string') return skills.split(',').map(s => s.trim()).filter(Boolean);
  return [];
};

// Interview-pipeline statuses: every stage except pending, shortlisted,
// rejected, and selected (selected candidates have left the pipeline and
// live in the Selected Candidates module). Card counts, post membership and
// the detail list must all use this so they never disagree.
const isInterviewStage = (status: string): boolean =>
  !!status && status !== 'pending' && status !== 'shortlisted' && status !== 'selected' && !status.endsWith('rejected');

interface PostWithCount extends RecruitmentRequest {
  interviewCount: number;
}

type InterviewsTabProps = { userRole?: string | null; userId?: string | null; onCandidateSelected?: () => void; canViewContact?: boolean };

/** Interview: the running pipeline, plus an Applied section for people who applied and haven't been invited. */
export default function InterviewsTab(props: InterviewsTabProps) {
  const [section, setSection] = useState<'pipeline' | 'applied'>('pipeline');
  const skin = useSkin();
  const switcher = (
    <div role="tablist" aria-label="Interview sections" className={`inline-flex h-9 items-center rounded-lg border ${skin.edge} bg-surface p-0.5`}>
      {([['pipeline', 'Interview'], ['applied', 'Applied']] as const).map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={section === key}
          onClick={() => setSection(key)}
          className={`h-8 cursor-pointer rounded-md px-3 text-xs font-semibold transition-colors duration-200 ${FOCUS} ${section === key ? 'bg-ink/70 text-surface' : 'text-ink/60 hover:text-ink'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
  return section === 'applied'
    ? <AppliedTab userRole={props.userRole} userId={props.userId} canViewContact={props.canViewContact} switcher={switcher} />
    : <InterviewPipeline {...props} switcher={switcher} />;
}

function InterviewPipeline({ userRole, userId, onCandidateSelected, switcher }: InterviewsTabProps & { switcher?: React.ReactNode }) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [posts, setPosts] = useState<PostWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<PostWithCount | null>(null);
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [postSearch, setPostSearch] = useState("");
  const skin = useSkin();

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Initial load on mount only
  }, []);

  const fetchData = async () => {
    try {
      const allCandidates: Candidate[] = [];
      const isAdmin = userRole === 'admin';

      // 1. Fetch from Firestore candidates
      const candQuery = query(collection(db, "candidates"), orderBy('createdAt', 'desc'));
      const qs = await getDocs(candQuery);
      qs.forEach((d) => {
        allCandidates.push({ id: d.id, ...d.data() } as Candidate);
      });

      allCandidates.sort((a, b) => {
        return toMillis(b.createdAt) - toMillis(a.createdAt);
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
            let userData: DocumentData | null = null;
            let intData: DocumentData = {};

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
                role: userData.department || userData.role || 'Applicant',
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
                status: app.status,
                postId: app.post_id,
                interviewDetails: intData as InterviewDetails
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
        const pid = c.postId;
        if (pid && isInterviewStage(c.status || '')) {
          postIds.add(pid);
        }
      }

      const postList: PostWithCount[] = [];
      for (const pid of postIds) {
        try {
          const postDoc = await getDoc(doc(db, 'recruits', pid));
          if (postDoc.exists()) {
            const postData = { id: postDoc.id, ...postDoc.data() } as RecruitmentRequest;
            const count = allCandidates.filter(c => c.postId === pid && isInterviewStage(c.status || '')).length;
            postList.push({ ...postData, interviewCount: count });
          }
        } catch (err) {
          console.error(`Error fetching post ${pid}:`, err);
        }
      }

      postList.sort((a, b) => {
        return toMillis(b.createdAt) - toMillis(a.createdAt);
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
    candidates.filter((c) => isInterviewStage(c.status || '')),
    [candidates]
  );

  // Candidates shown for the selected post: every interview-stage candidate by
  // default, narrowed to one round when the dropdown says so.
  const postCandidates = useMemo(() => {
    if (!selectedPost) return [];
    return activeCandidates.filter((c) => {
      if (c.postId !== selectedPost.id) return false;
      if (!selectedRound) return true;
      return (c.status || '') === selectedRound;
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

  // Opening a post (or closing the open one) starts with fresh table filters.
  const openPost = (post: PostWithCount | null) => {
    setSelectedPost(post);
    setSelectedRound(null);
    setSearchTerm('');
  };

  const visiblePosts = posts.filter((p) => {
    if (!postSearch.trim()) return true;
    const term = postSearch.toLowerCase();
    return (
      p.jobTitle?.toLowerCase().includes(term) ||
      p.department?.toLowerCase().includes(term) ||
      p.location?.toLowerCase().includes(term)
    );
  });

  // Candidate search and round filter sit in the table's header.
  const tableFilters = (
    <>
      <div className="relative">
        <Search aria-hidden="true" className={`pointer-events-none absolute inset-y-0 left-3 my-auto h-4 w-4 ${skin.subtle}`} />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search candidates"
          aria-label="Search candidates"
          className={`h-9 w-48 rounded-lg border border-ink/20 bg-surface pl-9 pr-3 text-sm text-ink shadow-sm transition-colors placeholder:text-ink/40 hover:border-ink/40 ${FOCUS}`}
        />
      </div>
      <div className="relative">
        <select
          value={selectedRound ?? ''}
          onChange={(e) => setSelectedRound(e.target.value || null)}
          className={`h-9 w-44 cursor-pointer appearance-none rounded-lg border border-ink/20 bg-surface pl-3 pr-8 text-sm text-ink shadow-sm transition-colors hover:border-ink/40 ${FOCUS}`}
          aria-label="Filter by round"
        >
          {roundOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className={`pointer-events-none absolute inset-y-0 right-3 my-auto h-4 w-4 ${skin.subtle}`} />
      </div>
    </>
  );

  // Same layout as Shortlisted: post cards on the left, the open post's
  // candidates as a table on the right; a row expands to its interview details.
  return (
    <PostStageList
      title="Interview"
      plain
      items={visiblePosts.map((post) => ({ post, count: post.interviewCount }))}
      countNoun="candidate"
      loading={loading}
      search={postSearch}
      onSearch={setPostSearch}
      actions={switcher}
      selectedId={selectedPost?.id ?? null}
      onOpen={(post) => openPost(selectedPost?.id === post.id ? null : post as PostWithCount)}
      emptyTitle="No interview posts"
      emptyText="Posts will appear here once candidates enter the interview pipeline."
      detail={selectedPost ? (
        // Removal is off: it only deletes uploaded-candidate records, not job applications.
        <StageCandidateTable
          key={selectedPost.id}
          candidates={postCandidates}
          loading={loading}
          search={searchTerm}
          onClose={() => openPost(null)}
          emptyText={selectedRound ? 'No candidates found in this round.' : 'No candidates in the interview pipeline for this post yet.'}
          removable={false}
          toolbar={tableFilters}
          renderDetail={(candidate, close) => (
            // Keyed by round so the form starts fresh after a move.
            <InterviewCandidateDetail
              key={`${candidate.id}-${candidate.status}`}
              candidate={candidate}
              post={selectedPost}
              onClose={close}
              onStatusUpdated={fetchData}
              onCandidateSelected={onCandidateSelected}
            />
          )}
        />
      ) : undefined}
    />
  );
}
