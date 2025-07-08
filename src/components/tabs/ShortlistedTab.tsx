import { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, updateDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Candidate } from "@/types";
import CandidateList from "@/components/resume/CandidateList";
import toast from "react-hot-toast";
import { ArrowLeft, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function ShortlistedTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const qs = await getDocs(collection(db, "candidates"));
        const list: Candidate[] = [];
        qs.forEach((d) => list.push({ id: d.id, ...d.data() } as Candidate));
        setCandidates(list);
      } catch (err) {
        console.error(err);
        toast.error("Failed to load candidates");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = candidates.filter((c) => (c as any).status === "shortlisted");

  const handleStatusUpdated = () => {
    // reload candidates list after status change
    setLoading(true);
    getDocs(collection(db, "candidates")).then((qs) => {
      const list: Candidate[] = [];
      qs.forEach((d) => list.push({ id: d.id, ...d.data() } as Candidate));
      setCandidates(list);
      setSelected(null);
      setLoading(false);
    });
  };

  if (selected) {
    return (
      <ShortlistedCandidateDetail
        candidate={selected}
        onBack={() => setSelected(null)}
        onStatusUpdated={handleStatusUpdated}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Shortlisted Candidates</h2>
      <CandidateList
        candidates={filtered}
        onSelectCandidate={setSelected}
        loading={loading}
        searchTerm={search}
        onSearchTermChange={setSearch}
        emptyMessage="No shortlisted candidates found."
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
      await updateDoc(doc(db, "candidates", candidate.id), { status: "round1", updatedAt: new Date() });
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
            <button
              disabled={moveLoading}
              onClick={moveToRound1}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {moveLoading ? 'Moving…' : 'Move to Round1'}
            </button>
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