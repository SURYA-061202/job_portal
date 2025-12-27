import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { Candidate } from '@/types';
import { COLORS } from '@/constants/colors';

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

// Chart colours
const MATCH_COLOR = COLORS.primary[500];
const REMAIN_COLOR = COLORS.secondary.gray[300];

// Donut chart (with total in centre) -----------------------------------

function DonutChart({ percent }: { percent: number }) {
  const bg = `conic-gradient(${MATCH_COLOR} 0% ${percent}%, ${REMAIN_COLOR} ${percent}% 100%)`;
  return (
    <div
      className="relative w-40 h-40 flex items-center justify-center border border-gray-300 rounded-full"
      style={{ background: bg }}
    >
      {/* inner hole */}
      <div
        className="absolute flex items-center justify-center bg-white text-lg font-bold text-gray-900 rounded-full"
        style={{ width: '5.5rem', height: '5.5rem' }}
      >
        {percent}%
      </div>
    </div>
  );
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
  const matchCount = filtered.length;
  const percent = total ? Math.round((matchCount / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Title row with total at right */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Stats</h2>
        {!loading && (
          <span className="text-sm font-semibold text-gray-700">Total Candidates: {total}</span>
        )}
      </div>

      {/* Search input */}
      <input
        type="text"
        placeholder="e.g. Candidates with experience more than three"
        className="w-full md:w-96 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <p>Loading…</p>
      ) : !parsed ? (
        <p className="border rounded-lg p-10 text-center text-gray-600">No Candidates</p>
      ) : (
        <div className="border rounded-lg p-6 flex flex-col items-center gap-6">
          {/* Donut chart & legend */}
          <div className="flex flex-col items-center gap-4">
            <DonutChart percent={percent} />

            <div className="flex gap-4">
              <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-700">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: MATCH_COLOR }}></span>
                Matched ({matchCount})
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-700">
                <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: REMAIN_COLOR }}></span>
                Remaining ({total - matchCount})
              </span>
            </div>
          </div>

          {/* List */}
          <div className="overflow-x-auto w-full mt-6">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider">Experience (yrs)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-primary-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-900">{toTitleCase(c.name)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{toTitleCase(c.role)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{getExperienceYears(c.experience)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {matchCount === 0 && (
              <p className="p-6 text-center text-gray-600">No matching candidates.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
} 