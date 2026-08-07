import { useState, useRef, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import { UserPlus, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

interface Option {
    id: string;
    name: string;
    sub?: string;
}

export default function RecruitCandidateDropdown({
    postId,
    userRole,
    userId,
    excludeIds,
    onRecruited,
}: {
    postId: string;
    userRole?: string | null;
    userId?: string | null;
    excludeIds: string[];
    onRecruited: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [registeredOptions, setRegisteredOptions] = useState<Option[]>([]);
    const [uploadedOptions, setUploadedOptions] = useState<Option[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [submitting, setSubmitting] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const loadedRef = useRef(false);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadOptions = async () => {
        if (loadedRef.current) return;
        loadedRef.current = true;
        setLoading(true);
        try {
            const excludeSet = new Set(excludeIds);
            const isAdmin = userRole === 'admin';

            // Registered users (job seekers) not already associated with this post
            const usersSnap = await getDocs(collection(db, 'users'));
            const registered: Option[] = [];
            usersSnap.forEach(d => {
                if (excludeSet.has(d.id)) return;
                const data = d.data();
                if (data.role !== 'user') return;
                registered.push({
                    id: d.id,
                    name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || 'Unnamed',
                    sub: data.department || undefined,
                });
            });
            setRegisteredOptions(registered);

            // Candidates this recruiter uploaded, not already tied to this post
            const candQ = (!isAdmin && userId)
                ? query(collection(db, 'candidates'), where('recruiterId', '==', userId))
                : query(collection(db, 'candidates'));
            const candSnap = await getDocs(candQ);
            const uploaded: Option[] = [];
            candSnap.forEach(d => {
                if (excludeSet.has(d.id)) return;
                const data = d.data();
                if (data.postId === postId) return;
                uploaded.push({ id: d.id, name: data.name || 'Unnamed Candidate', sub: data.role || undefined });
            });
            setUploadedOptions(uploaded);
        } catch (error) {
            console.error('Error loading candidates to recruit:', error);
            toast.error('Failed to load candidates');
        } finally {
            setLoading(false);
        }
    };

    const toggleOpen = () => {
        if (!open) loadOptions();
        setOpen(prev => !prev);
    };

    const toggleSelect = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleRecruit = async () => {
        if (selected.size === 0) return;
        setSubmitting(true);
        try {
            const registeredIds = new Set(registeredOptions.map(o => o.id));
            for (const id of selected) {
                if (!registeredIds.has(id)) {
                    // Manually uploaded candidate — tie them to this post in Firestore too
                    await updateDoc(doc(db, 'candidates', id), {
                        postId,
                        status: 'pending',
                        updatedAt: new Date(),
                    });
                }
                const { error } = await supabase.from('job_applications').upsert({
                    user_id: id,
                    post_id: postId,
                    status: 'pending',
                    created_at: new Date().toISOString(),
                }, { onConflict: 'user_id, post_id' });
                if (error) throw error;
            }
            toast.success(`Recruited ${selected.size} candidate${selected.size > 1 ? 's' : ''}`);
            setSelected(new Set());
            setOpen(false);
            loadedRef.current = false;
            onRecruited();
        } catch (error) {
            console.error('Error recruiting candidates:', error);
            toast.error('Failed to recruit candidates');
        } finally {
            setSubmitting(false);
        }
    };

    const totalOptions = registeredOptions.length + uploadedOptions.length;

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={toggleOpen}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-orange-gradient text-white hover:shadow-lg hover:shadow-orange-500/20 transition-all whitespace-nowrap"
            >
                <UserPlus className="w-4 h-4" />
                Recruit Candidate
                {selected.size > 0 && (
                    <span className="bg-white/25 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">{selected.size}</span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className="absolute z-20 mt-2 w-full bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
                    <div className="max-h-80 overflow-y-auto hover-scrollbar">
                        {loading ? (
                            <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
                        ) : totalOptions === 0 ? (
                            <div className="p-6 text-center text-sm text-gray-400">No candidates available to recruit.</div>
                        ) : (
                            <>
                                {registeredOptions.length > 0 && (
                                    <div>
                                        <div className="px-3 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500 sticky top-0">
                                            Registered Candidates
                                        </div>
                                        {registeredOptions.map(opt => (
                                            <label key={opt.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(opt.id)}
                                                    onChange={() => toggleSelect(opt.id)}
                                                    className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                                                />
                                                <span className="flex-1 min-w-0">
                                                    <span className="block truncate text-gray-800">{opt.name}</span>
                                                    {opt.sub && <span className="block truncate text-xs text-gray-400">{opt.sub}</span>}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                                {uploadedOptions.length > 0 && (
                                    <div>
                                        <div className="px-3 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500 sticky top-0">
                                            Uploaded Candidates
                                        </div>
                                        {uploadedOptions.map(opt => (
                                            <label key={opt.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(opt.id)}
                                                    onChange={() => toggleSelect(opt.id)}
                                                    className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                                                />
                                                <span className="flex-1 min-w-0">
                                                    <span className="block truncate text-gray-800">{opt.name}</span>
                                                    {opt.sub && <span className="block truncate text-xs text-gray-400">{opt.sub}</span>}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <div className="p-2 border-t border-gray-100 flex justify-end">
                        <button
                            onClick={handleRecruit}
                            disabled={selected.size === 0 || submitting}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
                        >
                            {submitting ? 'Recruiting…' : `Recruit Selected (${selected.size})`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
