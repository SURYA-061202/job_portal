import { useState } from 'react';
import type { Candidate } from '@/types';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

interface Props {
  candidate: Candidate;
  onClose: () => void;
  onSent?: () => void;
}

export default function InterviewInviteModal({ candidate, onClose, onSent }: Props) {
  const [role, setRole] = useState(candidate.role || '');
  const [dates, setDates] = useState<string[]>(['', '', '']);
  const [roundType, setRoundType] = useState('Technical');
  const [interviewers, setInterviewers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const interviewurl = `${window.location.origin}`;
  const interviewerOptions = ['Dhinesh Kumar', 'Naresh Kumar', 'Manthra'];

  const handleCheckbox = (name: string) => {
    setInterviewers((prev) =>
      prev.includes(name) ? prev.filter((i) => i !== name) : [...prev, name]
    );
  };

  const handleDateChange = (idx: number, value: string) => {
    setDates((prev) => prev.map((d, i) => (i === idx ? value : d)));
  };
 
  const handleSend = async () => {
    if (!role || dates.some((d) => !d) || !roundType || interviewers.length === 0) {
      toast.error('Please fill all fields');
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('send_interview_invite', {
        body: {
          candidate,
          interviewDetails: { role, dates, roundType, interviewers, baseUrl: interviewurl },
          baseUrl: interviewurl,
        },
      });

      if (error || !data?.success) throw new Error(error?.message || data?.error || 'Failed to send');

      // Update candidate status and interview details in Firestore
      try {
        const candidateRef = doc(db, 'candidates', candidate.id);
        const todayStr = new Date().toISOString().split('T')[0];
        await updateDoc(candidateRef, {
          status: 'shortlisted',
          interviewDetails: {
            role,
            dates,
            roundType,
            interviewers,
            currentSalary: 30000,
            expectedSalary: 30000,
            joiningDate: todayStr,
            feedback: 'Good',
            sentAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        });
      } catch (err) {
        console.error('Failed to update candidate after sending invite', err);
      }

      toast.success('Email sent successfully');
      onSent?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to send email');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-lg rounded-lg shadow-lg p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-semibold mb-4">Send Interview Invite</h2>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Interview Role */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interview Role</label>
            <input
              type="text"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 hover:border-primary-400 transition-colors"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>

          {/* Dates */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Choose Three Dates</label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {dates.map((d, idx) => (
                <input
                  key={idx}
                  type="date"
                  className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 hover:border-primary-400 transition-colors"
                  value={d}
                  onChange={(e) => handleDateChange(idx, e.target.value)}
                />
              ))}
            </div>
          </div>

          {/* Round Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Round Type</label>
            <input
              type="text"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 hover:border-primary-400 transition-colors"
              value={roundType}
              onChange={(e) => setRoundType(e.target.value)}
            />
          </div>

          {/* Interviewers */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interviewers</label>
            <div className="grid grid-cols-1 gap-2">
              {interviewerOptions.map((name) => (
                <label key={name} className="inline-flex items-center text-sm rounded hover:bg-primary-50 px-2 py-1 transition-colors">
                  <input
                    type="checkbox"
                    className="form-checkbox h-4 w-4 text-primary-600 mr-2"
                    checked={interviewers.includes(name)}
                    onChange={() => handleCheckbox(name)}
                  />
                  {name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border rounded-md text-gray-700 hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            className="px-4 py-2 text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
} 