import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
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
      const qs = await getDocs(collection(db, "candidates"));
      const list: Candidate[] = [];
      qs.forEach((d) => list.push({ id: d.id, ...d.data() } as Candidate));
      setCandidates(list);
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