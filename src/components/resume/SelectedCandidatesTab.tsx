//eslint-disable-next-line
import { useState } from 'react';
import CandidateList from './CandidateList';
import type { Candidate } from '@/types';
export default function CandidatesTab() {
  //eslint-disable-next-line
  const [candidates] = useState<Candidate[]>([]);
  
  const [view, setView] = useState<'selected' | 'rejected' | 'not'>('selected');
  // add loading flag, currently static false but can be integrated later
  const [loading] = useState(false);

  // load list no change

  // filtering before passing to CandidateList
  const filtered = candidates.filter(c => {
    const st = (c as any).status || '';
    if (view === 'selected') return st === 'selected';
    if (view === 'rejected') return st.endsWith('rejected');
    return st === 'not_interested';
  });

  // render top header include buttons
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Candidates</h2>
        <div className="flex space-x-2">
          {['selected','rejected','not'].map(v => (
            <button key={v}
              onClick={()=>setView(v as any)}
              className={`px-3 py-1 rounded-md text-sm font-medium ${view===v?'bg-primary-600 text-white':'border border-primary-600 text-primary-600 hover:bg-primary-50'}`}
            >{v==='selected'?'Selected':v==='rejected'?'Rejected':'Not Interested'}</button>
          ))}
        </div>
      </div>

      // CandidateList uses filtered
      <CandidateList
        candidates={filtered}
        onSelectCandidate={() => { /* no-op for now */ }}
        loading={loading}
      />
    </div>
  );
} 