import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { Candidate } from '@/types';
import { Search } from 'lucide-react';

// Helpers ------------------------------------------------------------

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

function wordsToNumber(w: string): number | null {
  return WORD_NUMBERS[w.toLowerCase()] ?? null;
}

interface ParsedQuery {
  type: 'experience';
  comparator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: number;
}

function parseSearch(query: string): ParsedQuery | null {
  query = query.toLowerCase().trim();

  // Only handle experience queries for now
  if (!query.includes('experience')) return null;

  // Detect comparator phrases
  let comparator: ParsedQuery['comparator'] = 'eq';
  if (/(at least|minimum|not less than|>=|≥)/.test(query)) comparator = 'gte';
  else if (/(at most|maximum|no more than|not greater than|<=|≤)/.test(query)) comparator = 'lte';
  else if (/(more than|greater than|over|above|>)/.test(query)) comparator = 'gt';
  else if (/(less than|below|under|<)/.test(query)) comparator = 'lt';
  else if (/(equal to|equals|exactly|==)/.test(query)) comparator = 'eq';

  // Extract numeric value (digit)
  const digitMatch = query.match(/(\d+)/);
  let value: number | null = digitMatch ? parseInt(digitMatch[1], 10) : null;

  // If no digit, try word number (e.g., three, five)
  if (value === null) {
    const wordMatch = query.match(new RegExp(`(${Object.keys(WORD_NUMBERS).join('|')})`));
    if (wordMatch) value = wordsToNumber(wordMatch[1]);
  }

  if (value === null) return null;

  return { type: 'experience', comparator, value };
}

function getExperienceYears(experienceStr?: string): number {
  if (!experienceStr) return 0;

  // Match any number in the string (e.g., "5", "5.5", "10")
  const matches = experienceStr.match(/\d+(?:\.\d+)?/g);
  if (matches) {
    // Find first value that looks like a realistic experience count (< 60 yrs)
    for (const m of matches) {
      const n = parseFloat(m);
      if (n < 60) return n;
    }
  }

  // attempt word number (e.g., "five years")
  const word = experienceStr.split(/\s+/)[0];
  const num = wordsToNumber(word);
  return num ?? 0;
}

function isMonthsExperience(str?: string): boolean {
  if (!str) return false;
  return /month/i.test(str);
}

function toTitleCase(str?: string) {
  if (!str) return '';
  return str
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// Main component -------------------------------------------------------

export default function StatsTab() {
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);

  // Load all candidates once
  useEffect(() => {
    const load = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'candidates'));
        const list: Candidate[] = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as Candidate));
        setCandidates(list);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Parse query & filter
  const parsed = useMemo(() => parseSearch(search), [search]);

  const filtered = useMemo(() => {
    // Ignore month-based experience entirely
    const eligible = candidates.filter((c) => !isMonthsExperience(c.experience));

    if (!parsed) return eligible;
    if (parsed.type === 'experience') {
      return eligible.filter((c) => {
        const yrs = getExperienceYears(c.experience);
        switch (parsed.comparator) {
          case 'gt':
            return yrs > parsed.value;
          case 'lt':
            return yrs < parsed.value;
          case 'gte':
            return yrs >= parsed.value;
          case 'lte':
            return yrs <= parsed.value;
          default:
            return yrs === parsed.value;
        }
      });
    }
    return eligible;
  }, [candidates, parsed]);

  const total = candidates.filter((c) => !isMonthsExperience(c.experience)).length;

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      {/* Header Section - Similar to Job Posts */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-900">Stats</h2>
          {!loading && (
            <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold border border-gray-200">
              {total}
            </span>
          )}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="e.g. experience more than three"
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500 transition-all placeholder:text-gray-400"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-y-auto custom-scrollbar" style={{ maxHeight: 'calc(100vh - 170px)' }}>
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">S.No</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Name</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Role</th>
                  <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">Experience</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filtered.map((c, index) => (
                  <tr key={c.id} className="group hover:bg-gray-50/80 transition-colors duration-150">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{index + 1}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900">{toTitleCase(c.name)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{toTitleCase(c.role)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 border border-gray-200">
                        {getExperienceYears(c.experience)} Years
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}