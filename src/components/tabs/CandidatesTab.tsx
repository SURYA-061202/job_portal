'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, getDocs, getDoc, query as fsQuery, orderBy, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import type { Candidate } from '@/types';
import CandidateList from '@/components/resume/CandidateList';

import CandidateDetail from '@/components/resume/CandidateDetail';
import ManualDetailsModal from '@/components/resume/ManualDetailsModal';
import { clusterCandidates, saveClusters, fetchClusters } from '@/lib/clusteringService';
import { ArrowLeft, Sparkles, X, Clock, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function CandidatesTabContent({ postId, onClearFilter: _onClearFilter, onBack }: { postId?: string | null; onClearFilter?: () => void; onBack?: () => void }) {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [filteredCandidates, setFilteredCandidates] = useState<Candidate[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
    const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);

    // Clustering State
    const [clusters, setClusters] = useState<{ id: number; label: string; candidateIds: string[] }[]>([]);
    const [clusterLastUpdated, setClusterLastUpdated] = useState<Date | null>(null);
    const [activeClusterId, setActiveClusterId] = useState<number | null>(null);
    const [isClustering, setIsClustering] = useState(false);

    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState<'list' | 'history'>('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterPostId, setFilterPostId] = useState<string | null>(null);
    const [isFilteringApplicants, setIsFilteringApplicants] = useState(false);
    const isFilteringRef = useRef(false);

    useEffect(() => {
        isFilteringRef.current = isFilteringApplicants;
    }, [isFilteringApplicants]);

    useEffect(() => {
        fetchCandidates();
        fetchClusters().then((res) => {
            if (res.clusters && res.clusters.length > 0) {
                setClusters(res.clusters);
                if (res.lastUpdated) {
                    try {
                        const date = new Date(res.lastUpdated);
                        if (!isNaN(date.getTime())) {
                            setClusterLastUpdated(date);
                        }
                    } catch (e) {
                        console.error("Invalid date:", e);
                    }
                }
                toast.success("Loaded saved clusters");
            }
        });
    }, []);

    // Auto-filter when postId prop changes
    useEffect(() => {
        if (postId) {
            setFilterPostId(postId);
            fetchApplicantsForPost(postId);
        } else {
            setFilterPostId(null);
            setIsFilteringApplicants(false);
            isFilteringRef.current = false;
            fetchCandidates(true);
        }
    }, [postId]);

    const fetchCandidates = async (force = false) => {
        // If we are currently filtering for a specific post and this was called automatically, 
        // don't overwrite the filtered view.
        if (!force && isFilteringRef.current) {
            console.log('[DEBUG] fetchCandidates called but we are in filtering mode. Aborting.');
            return;
        }

        try {
            setLoading(true);
            // When explicitly fetching all candidates, we reset the filtering state
            if (force) {
                setFilterPostId(null);
                setIsFilteringApplicants(false);
                isFilteringRef.current = false;
                setFilteredCandidates([]);
            }

            const q = fsQuery(collection(db, 'candidates'), orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);
            const candidatesData: Candidate[] = [];
            querySnapshot.forEach((doc) => {
                candidatesData.push({ id: doc.id, ...doc.data() } as Candidate);
            });

            // Race condition check: If we started filtering while this was fetching, stop.
            if (isFilteringRef.current && !force) {
                console.log('[DEBUG] fetchCandidates finished but we are in filtering mode. Aborting update.');
                return;
            }

            // Fallback: ensure sorted correctly
            candidatesData.sort((a, b) => {
                const toDt = (val: any): number => {
                    if (!val) return 0;
                    if (typeof val.toDate === 'function') return val.toDate().getTime();
                    if (val.seconds !== undefined) return val.seconds * 1000;
                    return new Date(val).getTime();
                };
                return toDt(b.createdAt) - toDt(a.createdAt);
            });

            setCandidates(candidatesData);
        } catch (error) {
            console.error('Error fetching candidates:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchApplicantsForPost = async (postId: string) => {
        if (!postId) {
            console.error('[DEBUG] fetchApplicantsForPost called with null/empty postId');
            return;
        }

        // Update ref immediately to block other in-flight fetches
        isFilteringRef.current = true;
        setIsFilteringApplicants(true);
        setLoading(true);
        setFilteredCandidates([]); // Clear previous list immediately

        try {
            console.log(`[DEBUG] Fetching applicants for post ID: ${postId}`);

            // 1. Fetch applications from Supabase
            const { data: apps, error: appsError } = await supabase
                .from('job_applications')
                .select('user_id')
                .eq('post_id', postId);

            if (appsError) {
                console.error('[DEBUG] Supabase apps fetch error:', appsError);
                throw appsError;
            }

            if (!apps || apps.length === 0) {
                console.log('[DEBUG] No applicants found for this post.');
                setFilteredCandidates([]);
                return;
            }

            // 2. Fetch user details from Firestore for these applicants
            const userIds = apps.map((a: any) => a.user_id).filter((uid: any) => !!uid);
            console.log(`[DEBUG] Found ${userIds.length} user IDs:`, userIds);

            const fetchedApplicants: Candidate[] = [];
            for (const uid of userIds) {
                try {
                    const userDoc = await getDoc(doc(db, 'users', uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        fetchedApplicants.push({
                            id: uid,
                            name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || 'Unnamed Candidate',
                            email: data.email || '',
                            phone: data.mobile || '',
                            role: data.department || 'Applicant',
                            experience: data.yearsOfExperience || '',
                            skills: data.skills ? (typeof data.skills === 'string' ? data.skills.split(',').map((s: string) => s.trim()) : data.skills) : [],
                            resumeUrl: data.resumeUrl || '',
                            extractedData: {
                                summary: '',
                                workExperience: [],
                                education: [],
                                skills: data.skills ? (typeof data.skills === 'string' ? data.skills.split(',').map((s: string) => s.trim()) : data.skills) : [],
                                certifications: [],
                                projects: []
                            },
                            education: [],
                            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
                        } as Candidate);
                    }
                } catch (docErr) {
                    console.error(`[DEBUG] Error fetching user doc for UID ${uid}:`, docErr);
                }
            }

            console.log(`[DEBUG] Final fetched applicants count: ${fetchedApplicants.length}`);

            // Final check: if user switched away during load, don't update
            if (isFilteringRef.current) {
                setFilteredCandidates(fetchedApplicants);
            }
        } catch (error: any) {
            console.error('[DEBUG] Global error in fetchApplicantsForPost:', error);
            setFilteredCandidates([]);
        } finally {
            setLoading(false);
        }
    };

    const handleRunClustering = async () => {
        const targetList = isFilteringApplicants ? filteredCandidates : candidates;
        if (targetList.length < 3) {
            toast.error("Need at least 3 candidates to perform clustering.");
            return;
        }

        try {
            setIsClustering(true);
            toast.loading("Analyzing profiles and generating clusters...", { id: "clustering" });
            const result = await clusterCandidates(targetList);
            setClusters(result);
            setClusterLastUpdated(new Date());
            saveClusters(result); // Persist
            toast.success("Clusters generated & saved!", { id: "clustering" });
        } catch (error) {
            console.error(error);
            toast.error("Failed to generate clusters", { id: "clustering" });
        } finally {
            setIsClustering(false);
        }
    };

    const handleCandidateSelect = (candidate: Candidate) => {
        setSelectedCandidate(candidate);
    };

    const handleBackToList = () => {
        setSelectedCandidate(null);
    };

    const handleInviteSent = () => {
        // reload list and exit detail view
        fetchCandidates();
        setSelectedCandidate(null);
    };

    // Filter logic update to include clusters
    const displayCandidates = useMemo(() => {
        let list = isFilteringApplicants ? filteredCandidates : candidates.filter(c => c.status === 'pending' || !c.status);
        if (activeClusterId !== null) {
            const cluster = clusters.find(c => c.id === activeClusterId);
            if (cluster) {
                list = list.filter(c => cluster.candidateIds.includes(c.id));
            }
        }
        return list;
    }, [isFilteringApplicants, filteredCandidates, candidates, activeClusterId, clusters]);

    return (
        <div className="space-y-6 flex-1 flex flex-col">
            {selectedCandidate ? (
                <CandidateDetail
                    candidate={selectedCandidate}
                    onBack={handleBackToList}
                    onInviteSent={handleInviteSent}
                    onEdit={(candidate) => setEditingCandidate(candidate)}
                    onRemoveCandidate={() => {
                        fetchCandidates();
                        setSelectedCandidate(null);
                    }}
                />
            ) : (
                <>
                    {activeView === 'list' && (
                        <>
                            {/* Unified Header & Controls */}
                            <div className="mb-6 space-y-4">
                                {/* Top Bar: Title & Search */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                                    <div className="flex items-center gap-3">
                                        {(isFilteringApplicants || onBack) && (
                                            <button
                                                onClick={onBack}
                                                className="p-1.5 -ml-1.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                                                title="Back"
                                            >
                                                <ArrowLeft className="w-5 h-5" />
                                            </button>
                                        )}
                                        <h2 className="text-xl font-bold text-gray-900">Candidates</h2>
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                                            {searchTerm ? `${filteredCandidates.length} found` : candidates.length}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-3 flex-1 justify-end">
                                        {/* Search */}
                                        <div className="relative w-full md:w-64 group">
                                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                <Search className="h-4 w-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="Search candidates..."
                                                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 sm:text-sm transition-all duration-200"
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                            />
                                        </div>

                                        {/* AI Action Button (If no clusters) */}
                                        {clusters.length === 0 && (
                                            <button
                                                onClick={handleRunClustering}
                                                disabled={isClustering}
                                                className="hidden md:inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all gap-2 disabled:opacity-70"
                                            >
                                                {isClustering ? <Sparkles className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                                {isClustering ? 'Analyzing' : 'AI Group'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* AI Clustering Panel */}
                                {clusters.length > 0 ? (
                                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 animate-in fade-in slide-in-from-top-2">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex items-center gap-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-md">
                                                    <Sparkles className="w-3.5 h-3.5" />
                                                    AI Analysis Active
                                                </div>
                                                {clusterLastUpdated && !isNaN(clusterLastUpdated.getTime()) && (
                                                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                                        <Clock className="w-3 h-3" />
                                                        Updated {clusterLastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => { setClusters([]); setActiveClusterId(null); }}
                                                className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md transition-colors text-xs flex items-center gap-1"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                                Clear Analysis
                                            </button>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            {clusters.map((c) => (
                                                <button
                                                    key={c.id}
                                                    onClick={() => setActiveClusterId(activeClusterId === c.id ? null : c.id)}
                                                    className={`group relative inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-lg border transition-all duration-200 ${activeClusterId === c.id
                                                        ? 'bg-gray-900 text-white border-gray-900 shadow-md ring-1 ring-gray-900/10'
                                                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50/80 hover:text-gray-900'
                                                        }`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full mr-2 transition-colors ${activeClusterId === c.id ? 'bg-indigo-400' : 'bg-gray-300 group-hover:bg-indigo-400'
                                                        }`} />
                                                    {c.label}
                                                    <span className={`ml-2 text-xs py-0.5 px-1.5 rounded-md transition-colors ${activeClusterId === c.id
                                                        ? 'bg-white/20 text-white'
                                                        : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                                                        }`}>
                                                        {c.candidateIds.length}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="md:hidden">
                                        <button
                                            onClick={handleRunClustering}
                                            disabled={isClustering}
                                            className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all gap-2 disabled:opacity-70"
                                        >
                                            {isClustering ? <Sparkles className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                            Run AI Grouping Analysis
                                        </button>
                                    </div>
                                )}
                            </div>

                            <CandidateList
                                candidates={displayCandidates}
                                onSelectCandidate={handleCandidateSelect}
                                loading={loading}
                                searchTerm={searchTerm}
                                onSearchTermChange={setSearchTerm}
                                onRefresh={isFilteringApplicants ? () => filterPostId && fetchApplicantsForPost(filterPostId) : fetchCandidates}
                                emptyMessage={isFilteringApplicants ? "No applicants found for this post." : undefined}
                                onEdit={(candidate) => setEditingCandidate(candidate)}
                                hideHeader={true}
                            />
                        </>
                    )}

                    {activeView === 'history' && (
                        <>
                            <div className="flex items-center gap-2 mb-4 cursor-pointer text-primary-600 hover:text-primary-800" onClick={() => setActiveView('list')}>
                                <ArrowLeft className="h-5 w-5" />
                                <span>Back</span>
                            </div>
                            <CandidateList
                                candidates={candidates}
                                onSelectCandidate={handleCandidateSelect}
                                loading={loading}
                                searchTerm={searchTerm}
                                onSearchTermChange={setSearchTerm}
                                emptyMessage="No resumes uploaded yet."
                                onRefresh={fetchCandidates}
                                onEdit={(candidate) => setEditingCandidate(candidate)}
                            />
                        </>
                    )}
                </>
            )}

            {editingCandidate && (
                <ManualDetailsModal
                    candidate={editingCandidate}
                    onCancel={() => setEditingCandidate(null)}
                    onSaved={() => {
                        setEditingCandidate(null);
                        // If user is currently looking at this candidate's details, update the detail view too
                        if (selectedCandidate && selectedCandidate.id === editingCandidate.id) {
                            // We can update the selected candidate with the new data from the form implicitly by re-fetching.
                            // OR better: we can manually merge the changes if we knew them.
                            // Simplest: re-fetch and re-select.
                            // But for now, fetchCandidates() refreshes the list.
                            // The detail view uses `selectedCandidate` state. 
                            // We need to update that state.
                            // Let's do a trick: we know the ID, fetch again and set it.
                            fetchCandidates().then(() => {
                                // this might not be enough because fetchCandidates updates `candidates` array.
                                // We need to find the new data and update `selectedCandidate`.
                                // Let's just do a specific doc fetch to be fast and accurate.
                                getDoc(doc(db, 'candidates', editingCandidate.id)).then(snapshot => {
                                    if (snapshot.exists()) {
                                        setSelectedCandidate({ id: snapshot.id, ...snapshot.data() } as Candidate);
                                    }
                                });
                            });
                        } else {
                            // Just refresh list
                            if (isFilteringApplicants && filterPostId) {
                                fetchApplicantsForPost(filterPostId);
                            } else {
                                fetchCandidates(false);
                            }
                        }
                    }}
                />
            )}
        </div>
    );
}

export default function CandidatesTab(props: { postId?: string | null; onClearFilter?: () => void; onBack?: () => void }) {
    return (
        <ErrorBoundary>
            <CandidatesTabContent {...props} />
        </ErrorBoundary>
    );
}
