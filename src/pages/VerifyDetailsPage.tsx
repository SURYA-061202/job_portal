import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import popup from '@/components/ui/Popup';
import { notifyRecruiterOfDetailsSubmitted } from '@/lib/notificationHelper';

export default function VerifyDetailsPage() {
  const [searchParams] = useSearchParams();
  const candidateId = searchParams.get('candidateId');

  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    dateOfJoining: '',
    currentSalary: '',
    expectedSalary: '',
    expectedSalaryPeriod: 'month',
    yearsExperience: '',
    experienceIn: '',
    readyToRelocate: 'no',
    laptop: 'no',
  });

  useEffect(() => {
    const load = async () => {
      if (!candidateId) {
        setLoading(false);
        return;
      }
      const snap = await getDoc(doc(db, 'interviews', candidateId));
      if (!snap.exists()) {
        popup.error('Invalid candidate link');
        setLoading(false);
        return;
      }
      const data: any = snap.data();
      if (data.readyToRelocate) {
        // already submitted
        setSubmitted(true);
      }
      setLoading(false);
    };
    load();
  }, [candidateId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!candidateId) return;
    try {
      const intSnap = await getDoc(doc(db, 'interviews', candidateId));
      await updateDoc(doc(db, 'interviews', candidateId), {
        ...form,
        submittedAt: new Date(),
      });

      // Tell the recruiter/admin the candidate verified their details. (This used
      // to write to candidates/{id}/notifications — a subcollection no screen
      // ever read, so the response never reached anyone.)
      void notifyRecruiterOfDetailsSubmitted({
        postId: intSnap.exists() ? (intSnap.data()?.postId ?? null) : null,
        candidateId,
      });

      popup.success('Details submitted successfully');
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      popup.error('Failed to submit');
    }
  };

  if (loading) return <p className="p-6 text-center">Loading…</p>;
  if (!candidateId) return <p className="p-6 text-center text-destructive">Invalid link</p>;
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted p-4">
        <div className="bg-surface w-full max-w-md rounded-2xl border border-border shadow-xl p-8 text-center space-y-4">
          <h1 className="text-2xl font-black text-ink">Thank you!</h1>
          <p className="text-ink/80">Your details have been recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-3 sm:p-4">
      <div className="bg-surface w-full max-w-[95vw] sm:max-w-xl rounded-2xl border border-border shadow-xl p-6 sm:p-8 space-y-6">
        <h1 className="text-2xl font-black text-ink text-center mb-4">Verify Your Details</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink/80 mb-1">Date of Joining</label>
            <input type="date" name="dateOfJoining" value={form.dateOfJoining} onChange={handleChange} className="w-full border border-border bg-surface rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-ink focus:ring-brand/20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/80 mb-1">Current Salary (₹)</label>
            <input type="number" name="currentSalary" value={form.currentSalary} onChange={handleChange} className="w-full border border-border bg-surface rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-ink focus:ring-brand/20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/80 mb-1">Expected Salary (₹)</label>
            <div className="flex gap-2">
              <input type="number" name="expectedSalary" value={form.expectedSalary} onChange={handleChange} className="flex-1 border border-border bg-surface rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-ink focus:ring-brand/20" />
              <select name="expectedSalaryPeriod" value={form.expectedSalaryPeriod} onChange={handleChange} className="border border-border bg-surface rounded-xl px-2 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-ink focus:ring-brand/20">
                <option value="month">Per Month</option>
                <option value="year">Per Year</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/80 mb-1">Years of Experience</label>
            <input type="number" name="yearsExperience" value={form.yearsExperience} onChange={handleChange} className="w-full border border-border bg-surface rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-ink focus:ring-brand/20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/80 mb-1">Experience In</label>
            <input type="text" name="experienceIn" value={form.experienceIn} onChange={handleChange} className="w-full border border-border bg-surface rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-ink focus:ring-brand/20" />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/80 mb-1">Ready to Relocate</label>
            <select name="readyToRelocate" value={form.readyToRelocate} onChange={handleChange} className="w-full border border-border bg-surface rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-ink focus:ring-brand/20">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink/80 mb-1">Do you have a Laptop?</label>
            <select name="laptop" value={form.laptop} onChange={handleChange} className="w-full border border-border bg-surface rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-ink focus:ring-brand/20">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>

        <button onClick={handleSubmit} className="w-full border border-ink bg-ink text-surface font-semibold px-4 py-2 rounded-xl hover:border-brand hover:bg-brand hover:text-ink">
          Submit
        </button>
      </div>
    </div>
  );
} 