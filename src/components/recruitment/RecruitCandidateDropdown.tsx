import { useState, useRef, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { upsertApplication } from '@/lib/jobApplications';
import { UserPlus, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { useSkin, FOCUS } from '@/styles/skin';

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
    const skin = useSkin();

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
                if (registeredIds.has(id)) {
                    // Registered user — create application
                    await upsertApplication(postId, id, 'pending');
                } else {
                    // Manually uploaded candidate — tie them to this post in Firestore
                    await updateDoc(doc(db, 'candidates', id), {
                        postId,
                        status: 'pending',
                        updatedAt: new Date(),
                    });
                    // Also create a job_applications row so the pipeline can track them
                    await upsertApplication(postId, id, 'pending');
                }
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
                className={`inline-flex items-center gap-2 cursor-pointer whitespace-nowrap ${skin.cta} ${FOCUS}`}
            >
                <UserPlus className="w-4 h-4" />
                Recruit Candidate
                {selected.size > 0 && (
                    <span className="bg-surface/25 text-surface text-xs font-bold px-1.5 py-0.5 rounded-full">{selected.size}</span>
                )}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open && (
                <div className={`absolute z-20 mt-2 w-full border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} overflow-hidden`}>
                    <div className="max-h-80 overflow-y-auto hover-scrollbar">
                        {loading ? (
                            <div className={`p-6 text-center ${skin.body}`}>Loading…</div>
                        ) : totalOptions === 0 ? (
                            <div className={`p-6 text-center ${skin.body}`}>No candidates available to recruit.</div>
                        ) : (
                            <>
                                {registeredOptions.length > 0 && (
                                    <div>
                                        <div className={`px-3 py-2 ${skin.canvas} sticky top-0 ${skin.micro}`}>
                                            Registered Candidates
                                        </div>
                                        {registeredOptions.map(opt => (
                                            <label key={opt.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${skin.rowHover}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(opt.id)}
                                                    onChange={() => toggleSelect(opt.id)}
                                                    className={`rounded ${skin.edge} text-brand ${FOCUS}`}
                                                />
                                                <span className="flex-1 min-w-0">
                                                    <span className="block truncate text-ink/80">{opt.name}</span>
                                                    {opt.sub && <span className="block truncate text-xs text-ink/40">{opt.sub}</span>}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                                {uploadedOptions.length > 0 && (
                                    <div>
                                        <div className={`px-3 py-2 ${skin.canvas} sticky top-0 ${skin.micro}`}>
                                            Uploaded Candidates
                                        </div>
                                        {uploadedOptions.map(opt => (
                                            <label key={opt.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${skin.rowHover}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(opt.id)}
                                                    onChange={() => toggleSelect(opt.id)}
                                                    className={`rounded ${skin.edge} text-brand ${FOCUS}`}
                                                />
                                                <span className="flex-1 min-w-0">
                                                    <span className="block truncate text-ink/80">{opt.name}</span>
                                                    {opt.sub && <span className="block truncate text-xs text-ink/40">{opt.sub}</span>}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <div className={`p-2 border-t ${skin.edge} flex justify-end`}>
                        <button
                            onClick={handleRecruit}
                            disabled={selected.size === 0 || submitting}
                            className={`inline-flex items-center gap-2 cursor-pointer ${skin.cta} ${FOCUS} disabled:opacity-50`}
                        >
                            {submitting ? 'Recruiting…' : `Recruit Selected (${selected.size})`}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
