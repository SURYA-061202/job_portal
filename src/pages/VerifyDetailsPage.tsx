import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, addDoc, collection, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

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
        toast.error('Invalid candidate link');
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
      await updateDoc(doc(db, 'interviews', candidateId), {
        ...form,
        submittedAt: new Date(),
      });
      // Add notification entry
      let candName = '';
      let candEmail = '';
      try {
        const candSnap = await getDoc(doc(db, 'candidates', candidateId));
        if (candSnap.exists()) {
          const c: any = candSnap.data();
          candName = c?.name || '';
          candEmail = c?.email || '';
        }
      } catch (e) { console.error(e); }
      try {
        await addDoc(collection(db, 'candidates', candidateId, 'notifications'), {
          message: 'Submitted verify details form',
          name: candName,
          email: candEmail,
          createdAt: Timestamp.now(),
          viewed: false,
        });
      } catch (err) {
        console.error('Failed to add notification', err);
      }

      toast.success('Details submitted successfully');
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to submit');
    }
  };

  if (loading) return <p className="p-6 text-center">Loading…</p>;
  if (!candidateId) return <p className="p-6 text-center text-red-600">Invalid link</p>;
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white w-full max-w-md rounded-lg shadow p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Thank you!</h1>
          <p className="text-gray-700">Your details have been recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-3 sm:p-4">
      <div className="bg-white w-full max-w-[95vw] sm:max-w-xl rounded-lg shadow p-6 sm:p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-4">Verify Your Details</h1>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date of Joining</label>
            <input type="date" name="dateOfJoining" value={form.dateOfJoining} onChange={handleChange} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Salary (₹)</label>
            <input type="number" name="currentSalary" value={form.currentSalary} onChange={handleChange} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Salary (₹)</label>
            <div className="flex gap-2">
              <input type="number" name="expectedSalary" value={form.expectedSalary} onChange={handleChange} className="flex-1 border rounded-md px-3 py-2 text-sm" />
              <select name="expectedSalaryPeriod" value={form.expectedSalaryPeriod} onChange={handleChange} className="border rounded-md px-2 py-2 text-sm">
                <option value="month">Per Month</option>
                <option value="year">Per Year</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience</label>
            <input type="number" name="yearsExperience" value={form.yearsExperience} onChange={handleChange} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Experience In</label>
            <input type="text" name="experienceIn" value={form.experienceIn} onChange={handleChange} className="w-full border rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ready to Relocate</label>
            <select name="readyToRelocate" value={form.readyToRelocate} onChange={handleChange} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Do you have a Laptop?</label>
            <select name="laptop" value={form.laptop} onChange={handleChange} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>

        <button onClick={handleSubmit} className="w-full bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700">
          Submit
        </button>
      </div>
    </div>
  );
} 