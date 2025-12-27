'use client';

import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, getDoc, query as fsQuery, orderBy, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import type { Candidate } from '@/types';
import CandidateList from '@/components/resume/CandidateList';
import CandidateDetail from '@/components/resume/CandidateDetail';
import { ArrowLeft } from 'lucide-react';

export default function CandidatesTab({ postId, onClearFilter }: { postId?: string | null; onClearFilter?: () => void }) {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [filteredCandidates, setFilteredCandidates] = useState<Candidate[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
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
    }, []);

    // Auto-filter when postId prop changes
    useEffect(() => {
        if (postId) {
            setFilterPostId(postId);
            fetchApplicantsForPost(postId);
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
            const userIds = apps.map(a => (a as any).user_id).filter(uid => !!uid);
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
                            createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                            updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date()
                        } as any);
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

    if (selectedCandidate) {
        return (
            <CandidateDetail
                candidate={selectedCandidate}
                onBack={handleBackToList}
                onInviteSent={handleInviteSent}
                onRemoveCandidate={() => {
                    fetchCandidates();
                    setSelectedCandidate(null);
                }}
            />
        );
    }

    return (
        <div className="space-y-6 flex-1 flex flex-col">
            {activeView === 'list' && (
                <CandidateList
                    candidates={isFilteringApplicants ? filteredCandidates : candidates.filter(c => (c as any).status === 'pending' || !(c as any).status)}
                    onSelectCandidate={handleCandidateSelect}
                    loading={loading}
                    searchTerm={searchTerm}
                    onSearchTermChange={setSearchTerm}
                    onRefresh={isFilteringApplicants ? () => filterPostId && fetchApplicantsForPost(filterPostId) : fetchCandidates}
                    emptyMessage={isFilteringApplicants ? "No applicants found for this post." : undefined}
                />
            )}

            {activeView === 'list' && (
                <div className="flex justify-end mt-4">
                    <button
                        onClick={() => setActiveView('history')}
                        className="px-4 py-2 text-sm font-medium rounded-md text-primary-600 border border-primary-600 hover:bg-primary-50"
                    >
                        Resume History
                    </button>
                </div>
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
                    />
                </>
            )}
        </div>
    );
}
