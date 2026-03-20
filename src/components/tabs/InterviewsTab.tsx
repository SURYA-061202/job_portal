import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import type { Candidate } from "@/types";
import CandidateList from "@/components/resume/CandidateList";
import InterviewCandidateDetail from "@/components/interview/InterviewCandidateDetail";
import { SelectedCandidateDetail } from "@/components/tabs/SelectedCandidatesTab";
import toast from "react-hot-toast";

const FILTER_STATUSES = [
  "all",
  "round1",
  "round2",
  "round3",
  "selected",
] as const;

type FilterStatus = (typeof FILTER_STATUSES)[number];

export default function InterviewsTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchCandidates();
  }, []);

  const fetchCandidates = async () => {
    try {
      const allCandidates: Candidate[] = [];

      // 1. Fetch from Firestore candidates
      const qs = await getDocs(collection(db, "candidates"));
      qs.forEach((d) => {
        allCandidates.push({ id: d.id, ...d.data() } as Candidate);
      });

      // 2. Fetch from Supabase job_applications
      const { data: applications, error: appsError } = await supabase
        .from('job_applications')
        .select('user_id, post_id, status')
        .in('status', ['round1', 'round2', 'round3', 'selected']);

      if (appsError) {
        console.error('Error fetching Supabase applications:', appsError);
      } else if (applications && applications.length > 0) {
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
      console.error("Failed to load interview candidates", err);
      toast.error("Failed to load candidates");
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 'all'
    ? candidates.filter((c) => {
      const st = (c as any).status || '';
      return st && st !== 'pending' && st !== 'shortlisted' && !st.endsWith('rejected');
    })
    : candidates.filter((c) => (c as any).status === filter);

  const handleStatusUpdated = () => {
    fetchCandidates();
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

  return (
    <div className="space-y-6">
      <CandidateList
        candidates={filtered}
        onSelectCandidate={setSelectedCandidate}
        loading={loading}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        emptyMessage="No interview candidates found."
        title="Interview Candidates"
        filterValue={filter}
        filterOptions={FILTER_STATUSES.map(s => ({
          value: s,
          label: s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)
        }))}
        onFilterChange={(value) => setFilter(value as FilterStatus)}
      />
    </div>
  );
} 