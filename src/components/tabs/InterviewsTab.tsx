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
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Interview Candidates</h2>

        {/* Filter chips */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as FilterStatus)}
          className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-40"
        >
          {FILTER_STATUSES.map((s) => (
            <option key={s} value={s} className="capitalize">
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      <CandidateList
        candidates={filtered}
        onSelectCandidate={setSelectedCandidate}
        loading={loading}
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
        emptyMessage="No interview candidates found."
      />
    </div>
  );
} 