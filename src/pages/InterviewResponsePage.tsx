import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, setDoc, Timestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';

export default function InterviewResponsePage() {
  const [searchParams] = useSearchParams();
  const candidateId = searchParams.get('candidateId');

  const [loading, setLoading] = useState(true);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [interest, setInterest] = useState<'interested' | 'not_interested' | ''>('');
  const [existingResponse, setExistingResponse] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!candidateId) {
        setLoading(false);
        return;
      }
      try {
        const snapshot = await getDoc(doc(db, 'candidates', candidateId));
        if (!snapshot.exists()) {
          toast.error('Invalid candidate ID');
          return;
        }
        const data: any = snapshot.data();
        setDates(data?.interviewDetails?.dates || []);

        // check already submitted
        const respSnap = await getDoc(doc(collection(db,'interviews'),candidateId));
        if(respSnap.exists()) {
          setExistingResponse(respSnap.data());
          setSubmitted(true);
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

  const handleSubmit = async () => {
    if (!candidateId) return;
    if (interest === 'interested' && (!selectedDate || !selectedTime)) {
      toast.error('Please select date & time');
      return;
    }
    try {
      const ref = doc(collection(db, 'interviews'), candidateId);
      const snap = await getDoc(ref);
      if(snap.exists()){
        toast.error('Already submitted');
        setExistingResponse(snap.data());
        return;
      }
      await setDoc(ref, {
        candidateId,
        response: interest === 'interested' ? 'accept' : 'decline',
        selectedDate: interest==='interested'?`${selectedDate} ${selectedTime}`:null,
        respondedAt: Timestamp.now(),
        dateOfJoining: '',
        currentSalary: '',
        expectedSalary: '',
        expectedSalaryPeriod: '',
        yearsExperience: '',
        experienceIn: '',
        readyToRelocate: '',
      });
      toast.success('Response recorded. Thank you!');
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      toast.error('Failed to record response');
    }
  };

  if (loading) return <p className="p-6 text-center">Loading…</p>;
  if (!candidateId) return <p className="p-6 text-center text-red-600">Invalid link.</p>;

  if(existingResponse || submitted){
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white w-full max-w-md rounded-lg shadow p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Thank you!</h1>
          <p className="text-gray-700">Your response has been recorded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white w-full max-w-xl rounded-lg shadow p-8 space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-4">Interview Availability</h1>

        {/* Interest toggle */}
        <div className="flex justify-center gap-4 mb-6">
          {[{value:'interested',label:'Interested'},{value:'not_interested',label:'Not Interested'}].map(opt=> (
            <button key={opt.value} onClick={()=>setInterest(opt.value as any)}
              className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${interest===opt.value? 'bg-primary-600 text-white border-primary-600':'bg-white text-primary-600 border-primary-600 hover:bg-primary-50'}`}>{opt.label}</button>
          ))}
        </div>

        {/* Date & time */}
        <div className={`${interest==='not_interested'?'opacity-40 pointer-events-none':''}`}>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Select a date &amp; time:</h2>
          <div className="space-y-4">
            {dates.map(d=>(
              <div key={d} className="border rounded-md p-3">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input type="radio" name="date" value={d} checked={selectedDate===d}
                    onChange={()=>{setSelectedDate(d);setSelectedTime('');}}
                    className="form-radio text-primary-600" disabled={interest!=='interested'} />
                  {d}
                </label>
                {selectedDate===d && (
                  <div className="mt-2 ml-6 flex flex-wrap gap-4">
                    {["10:00 - 12:00 PM","12:00 - 02:00 PM","02:00 - 04:00 PM"].map(t=>(
                      <label key={t} className="inline-flex items-center gap-2 text-sm cursor-pointer">
                        <input type="radio" name="time" value={t} checked={selectedTime===t} onChange={()=>setSelectedTime(t)} className="form-radio text-primary-600" />
                        {t}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          className="w-full bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 disabled:opacity-50"
          disabled={!interest || (interest==='interested' && (!selectedDate || !selectedTime))}
        >
          Submit
        </button>
      </div>
    </div>
  );
} 