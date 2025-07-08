import React, { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Candidate } from "@/types";
import CandidateList from "@/components/resume/CandidateList";
import toast from "react-hot-toast";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function SelectedCandidateDetail({ candidate, onBack }: { candidate: Candidate; onBack: () => void }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<boolean>(() => {
    const success = (candidate as any).interviewDetails?.successmail;
    return success === true;
  });
  const body = encodeURIComponent(
    `Dear ${candidate.name},\n\n` +
    `Congratulations! You have been selected.\n\n` +
    `Please submit the following documents to this email:\n` +
    `1. MarkSheets\n` +
    `2. Degree Completion certificates\n` +
    `3. Experience certificate (if applicable)\n` +
    `4. Bank Account details\n\n` +
    `Regards,\nHR Team`
  );
  const mailto = `mailto:${candidate.email}?subject=Congratulations&body=${body}`;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-5 w-5" />
        <span>Back to List</span>
      </button>

      <div className="bg-white rounded-lg shadow overflow-x-auto p-6 space-y-4">
        <h2 className="text-2xl font-bold text-gray-900">{candidate.name}</h2>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Mobile</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-gray-900">{candidate.email}</td>
              <td className="px-6 py-4 whitespace-nowrap text-gray-900">{candidate.phone || '-'}</td>
              <td className="px-6 py-4 whitespace-nowrap text-gray-900">{candidate.role}</td>
              <td className="px-6 py-4 whitespace-nowrap">
                <button
                  disabled={sending || sent}
                  onClick={async () => {
                    setSending(true);
                    try {
                      const { data, error } = await supabase.functions.invoke('send_congratulations_mail', {
                        body: { candidate: { id: candidate.id, name: candidate.name, email: candidate.email } },
                      });
                      if (error || !data?.success) throw new Error(error?.message || data?.error || 'Failed to send');

                      // update Firestore interviews doc
                      const interviewRef = doc(db, 'interviews', candidate.id);
                      const snap = await getDoc(interviewRef);
                      if (snap.exists()) {
                        await updateDoc(interviewRef, { successmail: true, updatedAt: new Date() });
                      } else {
                        await setDoc(interviewRef, { successmail: true, createdAt: new Date() });
                      }

                      // also update in candidate's interviewDetails
                      await updateDoc(doc(db, 'candidates', candidate.id), { 'interviewDetails.successmail': true });

                      toast.success('Email sent successfully');
                      setSent(true);
                    } catch (err: any) {
                      toast.error(err.message || 'Failed to send email');
                    } finally {
                      setSending(false);
                    }
                  }}
                  className={`inline-flex items-center gap-2 px-3 py-1 text-xs font-medium rounded ${sent ? 'bg-green-600 text-white' : 'bg-primary-600 text-white hover:bg-primary-700'} disabled:opacity-50`}
                >
                  {sending && (
                    <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                  )}
                  {sent ? 'Sent' : sending ? 'Sending…' : 'Send Congratulations'}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RejectedCandidateDetail({ candidate, onBack }: { candidate: Candidate; onBack: () => void }) {
  const status: string = (candidate as any).status || '';
  let rejectedRound: string | null = null;
  const match = status.match(/round(\d+)rejected/);
  if (match) {
    rejectedRound = `Round ${match[1]}`;
  }

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-5 w-5" />
        <span>Back to List</span>
      </button>

      <div className="bg-white rounded-lg shadow overflow-x-auto p-6 space-y-4">
        <h2 className="text-2xl font-bold text-gray-900">{candidate.name}</h2>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Mobile</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Rejected In</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-gray-900">{candidate.email}</td>
              <td className="px-6 py-4 whitespace-nowrap text-gray-900">{candidate.phone || '-'}</td>
              <td className="px-6 py-4 whitespace-nowrap text-gray-900">{candidate.role}</td>
              <td className="px-6 py-4 whitespace-nowrap text-gray-900">{rejectedRound || '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CandidatesTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<'selected' | 'rejected'>('selected');

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

  const filtered = candidates.filter((c) => {
    const st = (c as any).status || '';
    if (view === 'selected') return st === 'selected';
    if (view === 'rejected') return st.endsWith('rejected');
    return false;
  });

  if (selected) {
    const status = (selected as any).status || '';
    if (status === 'selected') {
    return <SelectedCandidateDetail candidate={selected} onBack={() => setSelected(null)} />;
    }
    if (status.endsWith('rejected')) {
      return <RejectedCandidateDetail candidate={selected} onBack={() => setSelected(null)} />;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Candidates</h2>
        <select
          value={view}
          onChange={(e) => setView(e.target.value as any)}
          className="border px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 w-48"
        >
          <option value="selected">Selected Candidates</option>
          <option value="rejected">Rejected Candidates</option>
        </select>
      </div>
      <CandidateList
        candidates={filtered}
        onSelectCandidate={setSelected}
        loading={loading}
        searchTerm={search}
        onSearchTermChange={setSearch}
        emptyMessage="No candidates found."
      />
    </div>
  );
} 