import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Candidate } from '@/types';
import { toast } from 'react-hot-toast';
import { User, X, ArrowRight, Trash2, Search } from 'lucide-react';

type PipelineColumn = {
    id: string;
    title: string;
    status: string[];
    color: string;
};

const COLUMNS: PipelineColumn[] = [
    { id: 'new', title: 'New Applicants', status: ['pending', 'new'], color: 'border-blue-500' },
    { id: 'shortlisted', title: 'Shortlisted', status: ['shortlisted'], color: 'border-yellow-500' },
    { id: 'screening', title: 'Screening / Interview', status: ['round1', 'round2', 'round3', 'technical', 'hr'], color: 'border-purple-500' },
    { id: 'offer', title: 'Offer Sent', status: ['offer_sent', 'offer'], color: 'border-indigo-500' },
    { id: 'hired', title: 'Hired', status: ['hired', 'selected'], color: 'border-green-500' },
    { id: 'rejected', title: 'Rejected', status: ['rejected', 'declined'], color: 'border-red-500' },
];

const getIconColor = (columnId: string) => {
    switch (columnId) {
        case 'new': return 'text-blue-500';
        case 'shortlisted': return 'text-yellow-500';
        case 'screening': return 'text-purple-500';
        case 'offer': return 'text-indigo-500';
        case 'hired': return 'text-green-500';
        case 'rejected': return 'text-red-500';
        default: return 'text-gray-500';
    }
};

export default function RecruitmentPipelineTab() {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(true);
    const [_draggedId, setDraggedId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchCandidates();
    }, []);

    const fetchCandidates = async () => {
        try {
            setLoading(true);
            const querySnapshot = await getDocs(collection(db, 'candidates'));
            const data: Candidate[] = [];
            querySnapshot.forEach((doc: QueryDocumentSnapshot) => {
                data.push({ id: doc.id, ...doc.data() } as Candidate);
            });
            setCandidates(data);
        } catch (error) {
            console.error('Error fetching candidates:', error);
            toast.error('Failed to load pipeline');
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (candidateId: string, newStatus: string) => {
        try {
            const candidateRef = doc(db, 'candidates', candidateId);
            await updateDoc(candidateRef, {
                status: newStatus,
                updatedAt: new Date()
            });

            setCandidates((prev: Candidate[]) => prev.map(c =>
                c.id === candidateId ? { ...c, status: newStatus } : c
            ));
            toast.success(`Moved to ${newStatus}`);
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Failed to update status');
        }
    };

    const handleDelete = async (candidateId: string) => {
        if (!window.confirm("Are you sure you want to delete this candidate?")) return;
        try {
            await deleteDoc(doc(db, 'candidates', candidateId));
            setCandidates((prev: Candidate[]) => prev.filter(c => c.id !== candidateId));
            toast.success("Candidate deleted");
        } catch (err) {
            console.error(err);
            toast.error("Failed to delete");
        }
    };

    const getCandidatesByStatus = (statusList: string[]) => {
        return candidates.filter((c: Candidate) => {
            const s = (c as any).status || 'pending';
            const matchesStatus = statusList.includes(s) || (statusList.includes('new') && !s);

            if (!searchTerm) return matchesStatus;

            // Search filter
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch =
                c.name?.toLowerCase().includes(searchLower) ||
                c.role?.toLowerCase().includes(searchLower) ||
                c.experience?.toLowerCase().includes(searchLower);

            return matchesStatus && matchesSearch;
        });
    };

    const onDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData('candidateId', id);
        setDraggedId(id);
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const onDrop = async (e: React.DragEvent, targetStatus: string) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('candidateId');
        if (id) {
            await updateStatus(id, targetStatus);
        }
        setDraggedId(null);
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Loading pipeline...</div>;
    }

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)]">
            {/* Header Section */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0 mb-4">
                <div className="flex items-center gap-3">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Recruitment Pipeline</h2>
                        <p className="text-sm text-gray-500">Manage candidates through different stages of the hiring process.</p>
                    </div>
                </div>

                {/* Search Input */}
                <div className="relative w-full md:w-72">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search by name, role, experience..."
                        className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 sm:text-sm transition-all duration-200"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-hidden hover-scrollbar pb-2">
                <div className="flex space-x-4 min-w-[1200px] h-full">
                    {COLUMNS.map(col => (
                        <div
                            key={col.id}
                            className={`flex-[0_0_300px] w-[300px] bg-gray-50 rounded-lg flex flex-col h-full border-t-4 ${col.color}`} // Fixed width and full height
                            onDragOver={onDragOver}
                            onDrop={(e) => onDrop(e, col.status[0])}
                        >
                            <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-white rounded-t-lg flex-shrink-0">
                                <h3 className="font-semibold text-gray-700">{col.title}</h3>
                                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">
                                    {getCandidatesByStatus(col.status).length}
                                </span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2 space-y-2 hover-scrollbar">
                                {getCandidatesByStatus(col.status).map(candidate => (
                                    <div
                                        key={candidate.id}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, candidate.id || '')}
                                        className="bg-white p-3 rounded border border-gray-200 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow group flex flex-col h-56 overflow-y-auto hover-scrollbar"
                                    >
                                        <div className="flex justify-between items-start mb-2 flex-shrink-0">
                                            <h4 className="font-medium text-gray-900 truncate pr-2" title={candidate.name}>{candidate.name}</h4>
                                            <button onClick={() => handleDelete(candidate.id || '')} className="text-gray-400 hover:text-red-500 transition-opacity">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>

                                        <div className="text-xs text-gray-500 space-y-1 flex-1">
                                            <div className="flex items-center gap-1">
                                                <BriefcaseIcon className={`h-3 w-3 flex-shrink-0 ${getIconColor(col.id)}`} />
                                                <span className="">{candidate.role || 'No Role'}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <User className={`h-3 w-3 flex-shrink-0 ${getIconColor(col.id)}`} />
                                                <span>{candidate.experience || '0'} YoE</span>
                                            </div>
                                            {/* Example of potentially long content */}
                                            {candidate.extractedData?.summary && (
                                                <p className="mt-1 text-[10px] text-gray-400 border-t border-gray-50 pt-1">
                                                    {candidate.extractedData.summary}
                                                </p>
                                            )}
                                        </div>

                                        <div className="mt-3 pt-2 border-t border-gray-50 flex justify-between items-center flex-shrink-0">
                                            <span className="text-[10px] text-gray-400">
                                                {new Date((candidate as any).createdAt?.seconds * 1000 || Date.now()).toLocaleDateString()}
                                            </span>

                                            {/* Quick Move Buttons (if dragndrop is hard) */}
                                            <div className="flex gap-1">
                                                {col.id !== 'rejected' && (
                                                    <button
                                                        onClick={() => updateStatus(candidate.id || '', 'rejected')}
                                                        className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded"
                                                        title="Reject"
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </button>
                                                )}
                                                {col.id === 'new' && (
                                                    <button
                                                        onClick={() => updateStatus(candidate.id || '', 'shortlisted')}
                                                        className="p-1 hover:bg-blue-50 text-blue-500 rounded"
                                                        title="Shortlist"
                                                    >
                                                        <ArrowRight className="h-3 w-3" />
                                                    </button>
                                                )}
                                                {col.id === 'shortlisted' && (
                                                    <button
                                                        onClick={() => updateStatus(candidate.id || '', 'round1')}
                                                        className="p-1 hover:bg-purple-50 text-purple-500 rounded"
                                                        title="Move to Screening"
                                                    >
                                                        <ArrowRight className="h-3 w-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {getCandidatesByStatus(col.status).length === 0 && (
                                    <div className="text-center py-8 text-gray-300 text-sm italic">
                                        No candidates
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function BriefcaseIcon(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
    )
}
