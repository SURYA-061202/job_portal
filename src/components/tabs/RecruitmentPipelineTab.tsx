import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllApplications, upsertApplication, setApplicationStatus } from '@/lib/jobApplications';
import type { RecruitmentRequest } from '@/types';
import { toast } from 'react-hot-toast';
import { User, X, ArrowRight, Trash2, Search, Loader2, Briefcase as BriefcaseIcon, Tag, ChevronDown, ChevronUp } from 'lucide-react';
import { usePopup } from '@/components/ui/Popup';

type PipelineColumn = {
    id: string;
    title: string;
    status: string[];
    color: string;
};

const COLUMNS: PipelineColumn[] = [
    { id: 'new', title: 'New Applicants', status: ['pending', 'new', 'applied'], color: 'border-brand' },
    { id: 'shortlisted', title: 'Shortlisted', status: ['shortlisted'], color: 'border-brand' },
    { id: 'round1', title: 'Interview Round 1', status: ['round1'], color: 'border-brand' },
    { id: 'round2', title: 'Interview Round 2', status: ['round2'], color: 'border-brand' },
    { id: 'round3', title: 'Interview Round 3', status: ['round3'], color: 'border-brand' },
    { id: 'round4', title: 'Interview Round 4', status: ['round4', 'technical', 'hr'], color: 'border-brand' },
    { id: 'offer', title: 'Offer Sent', status: ['offer_sent', 'offer'], color: 'border-brand' },
    { id: 'hired', title: 'Hired', status: ['hired', 'selected'], color: 'border-brand' },
    { id: 'rejected', title: 'Rejected', status: ['rejected', 'declined'], color: 'border-brand' },
];

const getIconColor = (columnId: string) => {
    switch (columnId) {
        case 'new': return 'text-brand';
        case 'shortlisted': return 'text-brand';
        case 'round1': return 'text-brand';
        case 'round2': return 'text-brand';
        case 'round3': return 'text-brand';
        case 'round4': return 'text-brand';
        case 'offer': return 'text-brand';
        case 'hired': return 'text-brand';
        case 'rejected': return 'text-brand';
        default: return 'text-gray-500';
    }
};

// A pipeline card can represent three kinds of person, each backed by a different
// data source and mutable in a different way:
//  - 'manual'     : a resume this recruiter uploaded, not yet shortlisted to a post
//                    (Firestore `candidates` doc, status lives there).
//  - 'registered'  : a platform job-seeker who hasn't applied/been shortlisted to any
//                    of this recruiter's posts yet (Firestore `users` doc, no status yet).
//  - 'applicant'   : anyone (uploaded candidate or registered user) once they've been
//                    shortlisted to a specific post (status lives in the job_applications collection).
type PipelineItem = {
    key: string;
    id: string;
    name: string;
    role: string;
    experience: string;
    skills: string[];
    summary?: string;
    status: string;
    postId?: string;
    postTitle?: string;
    source: 'manual' | 'registered' | 'applicant';
    createdAt?: any;
};

const normalizeSkills = (skills: any): string[] => {
    if (!skills) return [];
    if (Array.isArray(skills)) return skills.filter(Boolean);
    if (typeof skills === 'string') return skills.split(',').map(s => s.trim()).filter(Boolean);
    return [];
};

export default function RecruitmentPipelineTab({ userRole, userId }: { userRole?: string | null; userId?: string | null }) {
    const [items, setItems] = useState<PipelineItem[]>([]);
    const [posts, setPosts] = useState<RecruitmentRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [_draggedKey, setDraggedKey] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [deletingKey, setDeletingKey] = useState<string | null>(null);
    const [pickerItem, setPickerItem] = useState<PipelineItem | null>(null);
    const [pickerPostId, setPickerPostId] = useState('');
    const [shortlisting, setShortlisting] = useState(false);
    const [expandedSkills, setExpandedSkills] = useState<Set<string>>(new Set());
    const { showSuccess, showError } = usePopup();

    const toggleSkillsExpanded = (key: string) => {
        setExpandedSkills(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    useEffect(() => {
        fetchData();
    }, [userRole, userId]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const isAdmin = userRole === 'admin';

            // Posts this recruiter owns (all posts for admin) — scopes both the
            // "uploaded candidates" and "applicants" pools, and labels applicant cards.
            const postsQ = (!isAdmin && userId)
                ? query(collection(db, 'recruits'), where('recruiterId', '==', userId))
                : query(collection(db, 'recruits'));
            const postsSnap = await getDocs(postsQ);
            const postsData = postsSnap.docs.map(d => ({ id: d.id, ...d.data() } as RecruitmentRequest));
            const postTitleById: Record<string, string> = {};
            postsData.forEach(p => { if (p.id) postTitleById[p.id] = p.jobTitle || 'Untitled Post'; });
            const ownedPostIds = postsData.map(p => p.id as string);
            setPosts(postsData);

            // Candidates uploaded by this recruiter (all, for admin)
            const candQ = (!isAdmin && userId)
                ? query(collection(db, 'candidates'), where('recruiterId', '==', userId))
                : query(collection(db, 'candidates'));
            const candSnap = await getDocs(candQ);
            const manualById: Record<string, any> = {};
            candSnap.forEach(d => { manualById[d.id] = d.data(); });

            console.log('[Pipeline] Uploaded candidates:', Object.keys(manualById).map(id => `${id} | ${manualById[id].name} | postId: ${manualById[id].postId || 'none'} | status: ${manualById[id].status}`));

            const nextItems: PipelineItem[] = [];

            // New Applicants (manual): uploaded but not yet shortlisted to any post
            Object.entries(manualById).forEach(([id, data]) => {
                if (data.postId) return; // now tracked via the application below
                nextItems.push({
                    key: `${id}::new`,
                    id,
                    name: data.name || 'Unnamed Candidate',
                    role: data.role || 'Not specified',
                    experience: data.experience || '',
                    skills: normalizeSkills(data.skills),
                    summary: data.extractedData?.summary,
                    status: data.status || 'new',
                    source: 'manual',
                    createdAt: data.createdAt,
                });
            });

            // Registered users (job seekers), visible to every recruiter
            const usersSnap = await getDocs(collection(db, 'users'));
            const registeredById: Record<string, any> = {};
            usersSnap.forEach(d => {
                const data = d.data();
                if (data.role === 'user') registeredById[d.id] = data;
            });

            // Applications against owned posts: covers registered users who applied,
            // and uploaded candidates once shortlisted to a post.
            let apps: { user_id: string; post_id: string; status: string }[] = [];
            if (isAdmin || ownedPostIds.length > 0) {
                try {
                    apps = await getAllApplications();
                    if (!isAdmin) apps = apps.filter(app => ownedPostIds.includes(app.post_id));
                } catch (error) {
                    console.error('Error fetching applications:', error);
                }
            }

            console.log('[Pipeline] Applications:', apps.map(app => `user_id: ${app.user_id} | post_id: ${app.post_id} | status: ${app.status}`));

            const appliedRegisteredIds = new Set<string>();
            const processedCandidateIds = new Set<string>();

            apps.forEach(app => {
                const registered = registeredById[app.user_id];
                const manual = manualById[app.user_id];
                const display = registered || manual;
                if (!display) {
                    console.log('[Pipeline] Skipping orphaned application:', app.user_id, app.post_id);
                    return; // orphaned application (e.g. candidate deleted)
                }

                if (registered) appliedRegisteredIds.add(app.user_id);
                processedCandidateIds.add(app.user_id);

                nextItems.push({
                    key: `${app.user_id}::${app.post_id}`,
                    id: app.user_id,
                    name: registered
                        ? (`${registered.firstName || ''} ${registered.lastName || ''}`.trim() || registered.email || 'Unnamed')
                        : (display.name || 'Unnamed Candidate'),
                    role: (registered ? registered.department : display.role) || 'Not specified',
                    experience: (registered ? registered.yearsOfExperience : display.experience) || '',
                    skills: normalizeSkills(display.skills),
                    status: app.status || 'shortlisted',
                    postId: app.post_id,
                    postTitle: postTitleById[app.post_id] || 'Untitled Post',
                    source: registered ? 'applicant' : 'manual',
                    createdAt: display.createdAt,
                });
            });

            // Also add uploaded candidates with postId but no matching application
            Object.entries(manualById).forEach(([id, data]) => {
                if (!data.postId) return; // already handled above
                if (processedCandidateIds.has(id)) return; // already added via application
                nextItems.push({
                    key: `${id}::${data.postId}`,
                    id,
                    name: data.name || 'Unnamed Candidate',
                    role: data.role || 'Not specified',
                    experience: data.experience || '',
                    skills: normalizeSkills(data.skills),
                    summary: data.extractedData?.summary,
                    status: data.status || 'pending',
                    postId: data.postId,
                    postTitle: postTitleById[data.postId] || 'Untitled Post',
                    source: 'manual',
                    createdAt: data.createdAt,
                });
            });

            // Registered users with no application yet against an owned post
            Object.entries(registeredById).forEach(([id, data]) => {
                if (appliedRegisteredIds.has(id)) return;
                nextItems.push({
                    key: `${id}::new`,
                    id,
                    name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || 'Unnamed',
                    role: data.department || 'Not specified',
                    experience: data.yearsOfExperience || '',
                    skills: normalizeSkills(data.skills),
                    status: 'new',
                    source: 'registered',
                    createdAt: data.createdAt,
                });
            });

            nextItems.sort((a, b) => {
                const dateA = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate() : (a.createdAt || 0);
                const dateB = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : (b.createdAt || 0);
                return Number(dateB) - Number(dateA);
            });

            setItems(nextItems);
        } catch (error) {
            console.error('Error fetching pipeline data:', error);
            toast.error('Failed to load pipeline');
        } finally {
            setLoading(false);
        }
    };

    // Status changes for items that already have a post association (source 'applicant',
    // or 'manual' once shortlisted) go to job_applications; raw uploaded-but-unshortlisted
    // 'manual' items are updated directly in Firestore.
    const updateStatus = async (item: PipelineItem, newStatus: string) => {
        try {
            if (item.postId) {
                await setApplicationStatus(item.postId, item.id, newStatus);
            } else if (item.source === 'manual') {
                await updateDoc(doc(db, 'candidates', item.id), { status: newStatus, updatedAt: new Date() });
            } else {
                return; // registered user with no post yet — must be shortlisted first
            }
            setItems(prev => prev.map(i => i.key === item.key ? { ...i, status: newStatus } : i));
            toast.success(`Moved to ${newStatus}`);
        } catch (error) {
            console.error('Error updating status:', error);
            toast.error('Failed to update status');
        }
    };

    const handleDelete = async (item: PipelineItem) => {
        if (item.source !== 'manual' || item.postId) return; // only raw uploads are deletable here
        setDeletingKey(item.key);
        try {
            await deleteDoc(doc(db, 'candidates', item.id));
            setItems(prev => prev.filter(i => i.key !== item.key));
            showSuccess('Candidate deleted');
        } catch (err) {
            console.error(err);
            showError('Failed to delete');
        } finally {
            setDeletingKey(null);
        }
    };

    const openShortlistPicker = (item: PipelineItem) => {
        setPickerItem(item);
        setPickerPostId(posts[0]?.id || '');
    };

    const confirmShortlist = async () => {
        if (!pickerItem || !pickerPostId) return;
        setShortlisting(true);
        try {
            if (pickerItem.source === 'manual') {
                await updateDoc(doc(db, 'candidates', pickerItem.id), {
                    postId: pickerPostId,
                    status: 'shortlisted',
                    updatedAt: new Date(),
                });
            }
            await upsertApplication(pickerPostId, pickerItem.id, 'shortlisted');

            toast.success('Shortlisted');
            setPickerItem(null);
            fetchData();
        } catch (error) {
            console.error('Error shortlisting:', error);
            toast.error('Failed to shortlist');
        } finally {
            setShortlisting(false);
        }
    };

    const getItemsByStatus = (statusList: string[]) => {
        return items.filter((item) => {
            const matchesStatus = statusList.includes(item.status) || (statusList.includes('new') && !item.status);

            if (!searchTerm) return matchesStatus;

            const searchLower = searchTerm.toLowerCase();
            const matchesSearch =
                item.name?.toLowerCase().includes(searchLower) ||
                item.role?.toLowerCase().includes(searchLower) ||
                item.postTitle?.toLowerCase().includes(searchLower);

            return matchesStatus && matchesSearch;
        });
    };

    const onDragStart = (e: React.DragEvent, key: string) => {
        e.dataTransfer.setData('itemKey', key);
        setDraggedKey(key);
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const onDrop = async (e: React.DragEvent, col: PipelineColumn) => {
        e.preventDefault();
        const key = e.dataTransfer.getData('itemKey');
        const item = items.find(i => i.key === key);
        setDraggedKey(null);
        if (!item) return;

        if (!item.postId) {
            // Not yet tied to a post — the only valid move from here is into Shortlisted,
            // which requires picking which post they're being shortlisted for.
            if (col.id === 'shortlisted') openShortlistPicker(item);
            return;
        }
        await updateStatus(item, col.status[0]);
    };

    if (loading) {
        return (
            <div className="-m-4 md:-m-6 p-4 md:p-6 bg-surface flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                        <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-3" />
                        <p>Loading pipeline...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="-m-4 md:-m-6 p-4 md:p-6 bg-surface flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Header Section */}
            <div className="bg-surface p-4 rounded-xl border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0 mb-4">
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
                        placeholder="Search by name, role, post..."
                        className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-white placeholder-gray-400 focus:outline-none focus:bg-surface focus:ring-2 focus:ring-brand/20 focus:border-brand sm:text-sm transition-all duration-200"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden hover-scrollbar pb-2">
                <div className="flex space-x-4 min-w-[1800px] h-full">
                    {COLUMNS.map(col => (
                        <div
                            key={col.id}
                            className={`flex-[0_0_300px] w-[300px] bg-gray-50 rounded-lg flex flex-col h-full border border-gray-200 border-t-4 ${col.color}`}
                            onDragOver={onDragOver}
                            onDrop={(e) => onDrop(e, col)}
                        >
                            <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-surface rounded-t-lg flex-shrink-0">
                                <h3 className="font-semibold text-gray-700">{col.title}</h3>
                                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-medium">
                                    {getItemsByStatus(col.status).length}
                                </span>
                            </div>

                            <div className="flex-1 overflow-y-auto p-2 space-y-2 hover-scrollbar">
                                {getItemsByStatus(col.status).map(item => {
                                    const canDelete = item.source === 'manual' && !item.postId;
                                    const canReject = item.source === 'manual' || !!item.postId;
                                    const canShortlist = col.id === 'new';
                                    return (
                                        <div
                                            key={item.key}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, item.key)}
                                            className="bg-surface p-3 rounded border border-gray-200 cursor-grab active:cursor-grabbing hover:border-brand/40 transition-colors group flex flex-col h-56 overflow-y-auto hover-scrollbar"
                                        >
                                            <div className="flex justify-between items-start mb-2 flex-shrink-0">
                                                <h4 className="font-medium text-gray-900 truncate pr-2" title={item.name}>{item.name}</h4>
                                                {canDelete && (
                                                    <button
                                                        onClick={() => handleDelete(item)}
                                                        disabled={deletingKey === item.key}
                                                        className="text-gray-400 hover:text-red-500 transition-opacity disabled:opacity-50"
                                                    >
                                                        {deletingKey === item.key ? (
                                                            <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                                                        ) : (
                                                            <Trash2 className="h-4 w-4" />
                                                        )}
                                                    </button>
                                                )}
                                            </div>

                                            {item.postTitle && (
                                                <div className="mb-2 flex-shrink-0">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-brand/10 text-brand border border-brand/20">
                                                        <BriefcaseIcon className="h-2.5 w-2.5" />
                                                        {item.postTitle}
                                                    </span>
                                                </div>
                                            )}

                                            <div className="text-xs text-gray-500 space-y-1 flex-1">
                                                <div className="flex items-center gap-1">
                                                    <BriefcaseIcon className={`h-3 w-3 flex-shrink-0 ${getIconColor(col.id)}`} />
                                                    <span>{item.role || 'No Role'}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <User className={`h-3 w-3 flex-shrink-0 ${getIconColor(col.id)}`} />
                                                    <span>{item.experience || '0'} YoE</span>
                                                </div>
                                                {item.skills.length > 0 && (
                                                    <div className="flex items-start gap-1 pt-0.5">
                                                        <Tag className={`h-3 w-3 flex-shrink-0 mt-0.5 ${getIconColor(col.id)}`} />
                                                        <div className="flex flex-wrap gap-1">
                                                            {(expandedSkills.has(item.key) ? item.skills : item.skills.slice(0, 6)).map((skill, i) => (
                                                                <span key={i} className="px-1.5 py-0.5 bg-gray-50 border border-gray-200 text-gray-600 text-[9px] font-bold rounded">
                                                                    {skill}
                                                                </span>
                                                            ))}
                                                            {item.skills.length > 6 && (
                                                                <button
                                                                    onClick={() => toggleSkillsExpanded(item.key)}
                                                                    className="flex items-center gap-0.5 px-1.5 py-0.5 text-gray-400 hover:text-gray-600 text-[9px] font-bold"
                                                                >
                                                                    {expandedSkills.has(item.key) ? (
                                                                        <>Less <ChevronUp className="h-2.5 w-2.5" /></>
                                                                    ) : (
                                                                        <>+{item.skills.length - 6} <ChevronDown className="h-2.5 w-2.5" /></>
                                                                    )}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                                {item.summary && (
                                                    <p className="mt-1 text-[10px] text-gray-400 border-t border-gray-50 pt-1">
                                                        {item.summary}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="mt-3 pt-2 border-t border-gray-50 flex justify-between items-center flex-shrink-0">
                                                <span className="text-[10px] text-gray-400">
                                                    {new Date((item.createdAt as any)?.seconds * 1000 || Date.now()).toLocaleDateString()}
                                                </span>

                                                <div className="flex gap-1">
                                                    {col.id !== 'rejected' && canReject && (
                                                        <button
                                                            onClick={() => updateStatus(item, 'rejected')}
                                                            className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded"
                                                            title="Reject"
                                                        >
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                    {canShortlist && (
                                                        <button
                                                            onClick={() => openShortlistPicker(item)}
                                                            className="p-1 hover:bg-brand/10 text-brand rounded"
                                                            title="Shortlist"
                                                        >
                                                            <ArrowRight className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                    {col.id === 'shortlisted' && (
                                                        <button
                                                            onClick={() => updateStatus(item, 'round1')}
                                                            className="p-1 hover:bg-brand/10 text-brand rounded"
                                                            title="Move to Round 1"
                                                        >
                                                            <ArrowRight className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                    {col.id === 'round1' && (
                                                        <button
                                                            onClick={() => updateStatus(item, 'round2')}
                                                            className="p-1 hover:bg-brand/10 text-brand rounded"
                                                            title="Move to Round 2"
                                                        >
                                                            <ArrowRight className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                    {col.id === 'round2' && (
                                                        <button
                                                            onClick={() => updateStatus(item, 'round3')}
                                                            className="p-1 hover:bg-brand/10 text-brand rounded"
                                                            title="Move to Round 3"
                                                        >
                                                            <ArrowRight className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                    {col.id === 'round3' && (
                                                        <button
                                                            onClick={() => updateStatus(item, 'round4')}
                                                            className="p-1 hover:bg-brand/10 text-brand rounded"
                                                            title="Move to Round 4"
                                                        >
                                                            <ArrowRight className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                    {col.id === 'round4' && (
                                                        <button
                                                            onClick={() => updateStatus(item, 'offer_sent')}
                                                            className="p-1 hover:bg-brand/10 text-brand rounded"
                                                            title="Send Offer"
                                                        >
                                                            <ArrowRight className="h-3 w-3" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {getItemsByStatus(col.status).length === 0 && (
                                    <div className="text-center py-8 text-gray-300 text-sm italic">
                                        No candidates
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Shortlist post-picker modal */}
            {pickerItem && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-surface rounded-xl shadow-xl w-full max-w-sm p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">Shortlist {pickerItem.name}</h3>
                        <p className="text-sm text-gray-500 mb-4">Choose which of your job posts to shortlist them for.</p>
                        {posts.length === 0 ? (
                            <p className="text-sm text-red-600">You don't have any job posts yet.</p>
                        ) : (
                            <select
                                value={pickerPostId}
                                onChange={(e) => setPickerPostId(e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                            >
                                {posts.map(p => (
                                    <option key={p.id} value={p.id}>{p.jobTitle}</option>
                                ))}
                            </select>
                        )}
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setPickerItem(null)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmShortlist}
                                disabled={shortlisting || !pickerPostId}
                                className="px-4 py-2 rounded-lg text-sm font-bold bg-orange-gradient text-white disabled:opacity-50"
                            >
                                {shortlisting ? 'Shortlisting…' : 'Shortlist'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
