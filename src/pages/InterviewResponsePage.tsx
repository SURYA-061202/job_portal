import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, setDoc, addDoc, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { notifyRecruiterOfInterviewResponse } from '@/lib/notificationHelper';

/**
 * Single candidate-facing step for an interview invite: the candidate confirms
 * availability *and* verifies their details on one page. (These used to be two
 * separate emails/pages — the verify-details mail is no longer sent.)
 */
export default function InterviewResponsePage() {
  const [searchParams] = useSearchParams();
  const candidateId = searchParams.get('candidateId');

  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const [candidateInfo, setCandidateInfo] = useState<{ name: string; email: string } | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [interest, setInterest] = useState<'interested' | 'not_interested' | ''>('');
  const [existingResponse, setExistingResponse] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
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
    const fetchDetails = async () => {
      if (!candidateId) {
        setLoading(false);
        return;
      }
      try {
        let snapshot = await getDoc(doc(db, 'candidates', candidateId));
        if (!snapshot.exists()) {
          snapshot = await getDoc(doc(db, 'users', candidateId));
        }

        if (snapshot.exists()) {
          const data: any = snapshot.data();
          setCandidateInfo({ name: data?.name || '', email: data?.email || '' });
        } else {
          toast.error('Invalid candidate ID');
        }

        // Always fetch interview details from 'interviews' collection
        const respSnap = await getDoc(doc(db, 'interviews', candidateId));
        if (respSnap.exists()) {
          const intData = respSnap.data();
          setDates(intData?.dates || []);

          if (intData?.response) {
            setExistingResponse(intData);
            setSubmitted(true);
          }
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to load details');
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [candidateId]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!candidateId || saving) return;
    if (interest === 'interested' && (!selectedDate || !selectedTime)) {
      toast.error('Please select date & time');
      return;
    }
    setSaving(true);
    try {
      const ref = doc(collection(db, 'interviews'), candidateId);
      const snap = await getDoc(ref);
      if (snap.exists() && snap.data()?.response) {
        toast.error('Already submitted');
        setExistingResponse(snap.data());
        setSaving(false);
        return;
      }

      const accepted = interest === 'interested';
      // Merge so the invite details written by the recruiter (role, dates,
      // roundType, interviewers, postId) survive this write.
      await setDoc(
        ref,
        {
          candidateId,
          response: accepted ? 'accept' : 'decline',
          selectedDate: accepted ? `${selectedDate} ${selectedTime}` : null,
          respondedAt: Timestamp.now(),
          ...(accepted
            ? { ...form, detailsSubmitted: true, submittedAt: Timestamp.now() }
            : {}),
        },
        { merge: true }
      );

      // Let the recruiter who raised the invite know how the candidate answered.
      void notifyRecruiterOfInterviewResponse({
        postId: snap.exists() ? snap.data()?.postId : null,
        candidateId,
        accepted,
        slot: accepted ? `${selectedDate} ${selectedTime}` : null,
      });

      // Add notification entry
      try {
        const message = accepted
          ? `Accepted interview on ${selectedDate} ${selectedTime} and submitted their details`
          : `Declined interview invitation`;
        await addDoc(collection(db, 'candidates', candidateId, 'notifications'), {
          message,
          name: candidateInfo?.name || '',
          email: candidateInfo?.email || '',
          createdAt: Timestamp.now(),
          viewed: false,
        });
      } catch (err) {
        console.error('Failed to add notification', err);
      }

      toast.success('Response recorded. Thank you!');
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to record response');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="p-6 text-center">Loading…</p>;
  if (!candidateId) return <p className="p-6 text-center text-red-600">Invalid link.</p>;

  if (existingResponse || submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white w-full max-w-md rounded-lg shadow p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Thank you!</h1>
          <p className="text-gray-700">Your response has been recorded.</p>
        </div>
      </div>
    );
  }

  const isInterested = interest === 'interested';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-3 sm:p-4">
      <div className="bg-white w-full max-w-[95vw] sm:max-w-xl rounded-lg shadow p-6 sm:p-8 space-y-6 my-6">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-4">Interview Confirmation</h1>

        {/* Interest toggle */}
        <div className="flex justify-center gap-4 mb-6">
          {[{ value: 'interested', label: 'Interested' }, { value: 'not_interested', label: 'Not Interested' }].map(opt => (
            <button key={opt.value} onClick={() => setInterest(opt.value as any)}
              className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${interest === opt.value ? 'bg-brand text-white border-brand' : 'bg-white text-brand border-brand hover:bg-brand/10'}`}>{opt.label}</button>
          ))}
        </div>

        {/* Date & time */}
        <div className={`${interest === 'not_interested' ? 'opacity-40 pointer-events-none' : ''}`}>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Select a date &amp; time:</h2>
          <div className="space-y-4">
            {dates.map(d => (
              <div key={d} className="border rounded-md p-3">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input type="radio" name="date" value={d} checked={selectedDate === d}
                    onChange={() => { setSelectedDate(d); setSelectedTime(''); }}
                    className="form-radio text-brand" disabled={!isInterested} />
                  {d}
                </label>
                {selectedDate === d && (
                  <div className="mt-2 ml-6 flex flex-wrap gap-4">
                    {["10:00 - 12:00 PM", "12:00 - 02:00 PM", "02:00 - 04:00 PM"].map(t => (
                      <label key={t} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="time" value={t} checked={selectedTime === t} onChange={() => setSelectedTime(t)} className="form-radio text-brand" />
                        {t}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Details — collected in the same step as the availability confirmation */}
        <div className={`${!isInterested ? 'opacity-40 pointer-events-none' : ''} border-t pt-6`}>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Verify your details</h2>
          <p className="text-sm text-gray-500 mb-4">This saves us a follow-up email before your first round.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date of Joining</label>
              <input type="date" name="dateOfJoining" value={form.dateOfJoining} onChange={handleFormChange} disabled={!isInterested} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Salary (₹)</label>
              <input type="number" name="currentSalary" value={form.currentSalary} onChange={handleFormChange} disabled={!isInterested} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected Salary (₹)</label>
              <div className="flex gap-2">
                <input type="number" name="expectedSalary" value={form.expectedSalary} onChange={handleFormChange} disabled={!isInterested} className="flex-1 border rounded-md px-3 py-2 text-sm" />
                <select name="expectedSalaryPeriod" value={form.expectedSalaryPeriod} onChange={handleFormChange} disabled={!isInterested} className="border rounded-md px-2 py-2 text-sm">
                  <option value="month">Per Month</option>
                  <option value="year">Per Year</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience</label>
              <input type="number" name="yearsExperience" value={form.yearsExperience} onChange={handleFormChange} disabled={!isInterested} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Experience In</label>
              <input type="text" name="experienceIn" value={form.experienceIn} onChange={handleFormChange} disabled={!isInterested} className="w-full border rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ready to Relocate</label>
              <select name="readyToRelocate" value={form.readyToRelocate} onChange={handleFormChange} disabled={!isInterested} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Do you have a Laptop?</label>
              <select name="laptop" value={form.laptop} onChange={handleFormChange} disabled={!isInterested} className="w-full border rounded-md px-3 py-2 text-sm">
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          className="w-full bg-brand text-white px-4 py-2 rounded-md hover:bg-brand/90 disabled:opacity-50"
          disabled={saving || !interest || (isInterested && (!selectedDate || !selectedTime))}
        >
          {saving ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
