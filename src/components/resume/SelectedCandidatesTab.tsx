import { useState } from 'react';
import CandidateList from './CandidateList';
import type { Candidate } from '@/types';
import { useSkin, FOCUS } from '@/styles/skin';
export default function CandidatesTab() {
  const [candidates] = useState<Candidate[]>([]);
  
  const [view, setView] = useState<'selected' | 'rejected' | 'not'>('selected');
  // add loading flag, currently static false but can be integrated later
  const [loading] = useState(false);
  const skin = useSkin();

  // load list no change

  // filtering before passing to CandidateList
  const filtered = candidates.filter(c => {
    const st = c.status || '';
    if (view === 'selected') return st === 'selected';
    if (view === 'rejected') return st.endsWith('rejected');
    return st === 'not_interested';
  });

  // render top header include buttons
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <h2 className={skin.heading}>Candidates</h2>
        <div className="flex space-x-2">
          {(['selected','rejected','not'] as const).map(v => (
            <button key={v}
              onClick={()=>setView(v)}
              className={`${view===v ? `cursor-pointer ${skin.cta} ${FOCUS}` : `${skin.secondary} ${FOCUS}`}`}
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