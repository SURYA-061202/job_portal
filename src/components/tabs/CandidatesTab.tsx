'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { collection, getDocs, getDoc, query as fsQuery, orderBy, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { supabase } from '@/lib/supabase';
import type { Candidate } from '@/types';
import CandidateList from '@/components/resume/CandidateList';

import CandidateDetail from '@/components/resume/CandidateDetail';
import ManualDetailsModal from '@/components/resume/ManualDetailsModal';
import { ArrowLeft, Search, LayoutGrid, Briefcase, MapPin, Calendar, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { RecruitmentRequest } from '@/types';

function CandidatesTabContent({ postId, onClearFilter: _onClearFilter, onBack, onNavigateToShortlisted, userRole, isPremium }: { postId?: string | null; onClearFilter?: () => void; onBack?: () => void; onNavigateToShortlisted?: (candidateId: string) => void; userRole?: string | null; userId?: string | null; isPremium?: boolean }) {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [filteredCandidates, setFilteredCandidates] = useState<Candidate[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
    const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);

    // Clustering State
    const [clusters, setClusters] = useState<{ id: number; label: string; candidateIds: string[] }[]>([]);
    const [activeClusterId, setActiveClusterId] = useState<number | null>(null);

    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState<'list' | 'history'>('list');
    const [searchTerm, setSearchTerm] = useState('');
    const [filterPostId, setFilterPostId] = useState<string | null>(null);
    const [isFilteringApplicants, setIsFilteringApplicants] = useState(false);

    // Registered Candidates State
    const [viewMode, setViewMode] = useState<'job-candidates' | 'registered-users'>('job-candidates');
    const [registeredUsers, setRegisteredUsers] = useState<Candidate[]>([]);
    const [userApplications, setUserApplications] = useState<any[]>([]);
    const [selectedDateFilter, setSelectedDateFilter] = useState<string>('all');
    const [userAppDates, setUserAppDates] = useState<Record<string, Date[]>>({});
    const [showPostView, setShowPostView] = useState(false);
    const [postCards, setPostCards] = useState<(RecruitmentRequest & { applicantCount: number })[]>([]);

    // Extract unique dates for filter
    const availableDates = useMemo(() => {
        console.log('[DateFilter] Recalculating availableDates. UserAppDates keys:', Object.keys(userAppDates).length);
        const dates = new Set<string>();
        Object.values(userAppDates).flat().forEach(date => {
            if (!isNaN(date.getTime())) {
                const monthYear = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                dates.add(monthYear);
            }
        });
        // Sort by date descending
        return Array.from(dates).sort((a, b) => {
            const dateA = new Date(a);
            const dateB = new Date(b);
            return dateB.getTime() - dateA.getTime();
        });
    }, [userAppDates]);

    const isFilteringRef = useRef(false);

    useEffect(() => {
        isFilteringRef.current = isFilteringApplicants;
    }, [isFilteringApplicants]);


    // Unified AI Analysis State Management
    useEffect(() => {
        // 1. Always clear clusters and active selection when context changes
        setClusters([]);
        setActiveClusterId(null);

        // 2. Handle Job-Specific Context (Applied Candidates)
        if (postId) {
            setFilterPostId(postId);
            fetchApplicantsForPost(postId);
        }
        // 3. Handle Registered Users Context
        else if (viewMode === 'registered-users') {
            setFilterPostId(null);
            setIsFilteringApplicants(false);
            isFilteringRef.current = false;
            fetchRegisteredUsers();
        }
        // 4. Handle Global Uploaded Candidates Context
        else {
            setFilterPostId(null);
            setIsFilteringApplicants(false);
            isFilteringRef.current = false;
            fetchCandidates(true);
        }
    }, [postId, viewMode]);

    // Fetch posts + applicant counts for post card grid view
    useEffect(() => {
        if (!showPostView) return;
        const fetchPostCards = async () => {
            try {
                const q = fsQuery(collection(db, 'recruits'), orderBy('createdAt', 'desc'));
                const snapshot = await getDocs(q);
                const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RecruitmentRequest));

                // Fetch applicant counts from Supabase
                const { data: allApps } = await supabase.from('job_applications').select('post_id');
                const counts: Record<string, number> = {};
                if (allApps) {
                    allApps.forEach((app: any) => {
                        counts[app.post_id] = (counts[app.post_id] || 0) + 1;
                    });
                }

                setPostCards(posts.map(p => ({ ...p, applicantCount: counts[p.id || ''] || 0 })));
            } catch (error) {
                console.error('Error fetching post cards:', error);
            }
        };
        fetchPostCards();
    }, [showPostView]);

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

            const candidatesRef = collection(db, 'candidates');
            let q = fsQuery(candidatesRef, orderBy('createdAt', 'desc'));

            // No longer filtering candidates by recruiterId as per user request to show candidates/users same like before
            const querySnapshot = await getDocs(q);
            let candidatesData: Candidate[] = [];
            querySnapshot.forEach((doc) => {
                candidatesData.push({ id: doc.id, ...doc.data() } as Candidate);
            });

            // Sort manually
            candidatesData = candidatesData.sort((a, b) => {
                const dateA = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate() : (a.createdAt || 0);
                const dateB = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : (b.createdAt || 0);
                return Number(dateB) - Number(dateA);
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

            const allCandidates: Candidate[] = [];

            // 1. Fetch manually uploaded candidates from Firestore candidates collection
            const candidatesQuery = fsQuery(
                collection(db, 'candidates'),
                orderBy('createdAt', 'desc')
            );
            const candidatesSnapshot = await getDocs(candidatesQuery);

            candidatesSnapshot.forEach((doc) => {
                const data = doc.data();
                // Check if this candidate is associated with the specific post
                if (data.postId === postId || data.recruitmentId === postId) {
                    allCandidates.push({ id: doc.id, ...data } as Candidate);
                }
            });

            console.log(`[DEBUG] Found ${allCandidates.length} manually uploaded candidates for this post`);

            // 2. Fetch applications from Supabase (include all statuses)
            const { data: apps, error: appsError } = await supabase
                .from('job_applications')
                .select('user_id, status')
                .eq('post_id', postId);

            if (appsError) {
                console.error('[DEBUG] Supabase apps fetch error:', appsError);
                throw appsError;
            }

            if (!apps || apps.length === 0) {
                console.log('[DEBUG] No applicants found for this post in Supabase.');
                // Don't return here - we might still have manual candidates
                if (allCandidates.length === 0) {
                    setFilteredCandidates([]);
                    return;
                }
            } else {

                // 3. Fetch user details from Firestore for these applicants
                const userIds = apps.map((a: any) => a.user_id).filter((uid: any) => !!uid);
                console.log(`[DEBUG] Found ${userIds.length} user IDs:`, userIds);

                for (const uid of userIds) {
                    try {
                        const userDoc = await getDoc(doc(db, 'users', uid));
                        if (userDoc.exists()) {
                            const data = userDoc.data();
                            // Find the application status for this user
                            const app = apps.find((a: any) => a.user_id === uid);
                            const appStatus = app?.status || 'applied';

                            allCandidates.push({
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
                                    certifications: data.certifications || [],
                                    projects: data.keyProjects || data.projects || []
                                },
                                education: [],
                                createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                                updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
                                postId: postId, // Add postId for Supabase updates
                                status: appStatus as any, // Add status from Supabase
                                rankings: data.rankings // Include AI rankings
                            } as Candidate);
                        }
                    } catch (docErr) {
                        console.error(`[DEBUG] Error fetching user doc for UID ${uid}:`, docErr);
                    }
                }
            }

            console.log(`[DEBUG] Total candidates (manual + applicants): ${allCandidates.length}`);

            // Final check: if user switched away during load, don't update
            if (isFilteringRef.current) {
                setFilteredCandidates(allCandidates);
            }
        } catch (error: any) {
            console.error('[DEBUG] Global error in fetchApplicantsForPost:', error);
            setFilteredCandidates([]);
        } finally {
            setLoading(false);
        }
    };

    // Fetch all registered users from Firestore
    const fetchRegisteredUsers = async () => {
        setLoading(true);
        try {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            const users: Candidate[] = [];

            usersSnapshot.forEach((doc) => {
                const data = doc.data();
                // Only include users with role 'user'
                if (data.role !== 'user') {
                    return;
                }
                users.push({
                    id: doc.id,
                    name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || 'Unnamed User',
                    email: data.email || '',
                    phone: data.mobile || '',
                    role: data.department || 'User',
                    experience: data.yearsOfExperience || '',
                    skills: data.skills ? (typeof data.skills === 'string' ? data.skills.split(',').map((s: string) => s.trim()) : data.skills) : [],
                    resumeUrl: data.resumeUrl || '',
                    extractedData: {
                        summary: '',
                        workExperience: [],
                        education: [],
                        skills: data.skills ? (typeof data.skills === 'string' ? data.skills.split(',').map((s: string) => s.trim()) : data.skills) : [],
                        certifications: data.certifications || [],
                        projects: data.keyProjects || data.projects || []
                    },
                    education: [],
                    createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
                    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
                    status: 'pending' as any,
                    rankings: data.rankings // Include AI rankings
                } as Candidate);
            });

            setRegisteredUsers(users);

            // Fetch all applications to determine applied dates
            const { data: allApps, error: appsError } = await supabase
                .from('job_applications')
                .select('user_id, created_at');

            if (appsError) {
                console.error('[DateFilter] Error fetching apps:', appsError);
            } else if (allApps) {
                console.log(`[DateFilter] Fetched ${allApps.length} applications.`);
                const datesMap: Record<string, Date[]> = {};
                allApps.forEach(app => {
                    if (app.user_id && app.created_at) {
                        if (!datesMap[app.user_id]) datesMap[app.user_id] = [];
                        datesMap[app.user_id].push(new Date(app.created_at));
                    }
                });
                console.log(`[DateFilter] Constructed datesMap for ${Object.keys(datesMap).length} users.`);
                setUserAppDates(datesMap);
            }

        } catch (error) {
            console.error('Error fetching registered users:', error);
            toast.error('Failed to load registered users');
        } finally {
            setLoading(false);
        }
    };

    // Fetch job applications for a specific user
    const fetchUserApplications = async (userId: string) => {
        try {
            const { data: applications, error } = await supabase
                .from('job_applications')
                .select('post_id, status, created_at')
                .eq('user_id', userId);

            if (error) throw error;

            if (applications && applications.length > 0) {
                // Fetch job post details for each application
                const details = await Promise.all(
                    applications.map(async (app) => {
                        const postDoc = await getDoc(doc(db, 'recruits', app.post_id));
                        if (postDoc.exists()) {
                            const postData = postDoc.data();
                            return {
                                ...app,
                                postDetails: { id: postDoc.id, ...postData }
                            };
                        }
                        return { ...app, postDetails: null };
                    })
                );

                // Filter: For non-admins, only show applications for their own posts
                const filtered = userRole === 'admin' 
                    ? details 
                    : details.filter(app => app.postDetails && (app.postDetails as any).recruiterId === userId);

                setUserApplications(filtered);
            } else {
                setUserApplications([]);
            }
        } catch (error) {
            console.error('Error fetching user applications:', error);
            setUserApplications([]);
        }
    };

    const handleCandidateSelect = (candidate: Candidate) => {
        // If in registered users view, fetch their application history
        if (viewMode === 'registered-users') {
            fetchUserApplications(candidate.id);
            setSelectedCandidate(candidate);
            return;
        }

        // If candidate is shortlisted, navigate to Shortlisted tab instead
        if (candidate.status === 'shortlisted' || (candidate as any).status === 'shortlisted') {
            if (onNavigateToShortlisted) {
                onNavigateToShortlisted(candidate.id);
            }
            return;
        }
        setSelectedCandidate(candidate);
    };

    const handleBackToList = () => {
        setSelectedCandidate(null);
    };

    const handleInviteSent = () => {
        // Reload list based on current filtering state and exit detail view
        if (isFilteringApplicants && filterPostId) {
            fetchApplicantsForPost(filterPostId);
        } else {
            fetchCandidates(true);
        }
        setSelectedCandidate(null);

        // Navigate to Shortlisted tab after sending invite
        if (onNavigateToShortlisted) {
            onNavigateToShortlisted('');
        }
    };

    // Filter logic update to include clusters and view mode
    const displayCandidates = useMemo(() => {
        let list: Candidate[] = [];

        // 1. Determine base list based on view mode
        if (viewMode === 'registered-users') {
            console.log(`[DateFilter] Filtering. Selected: ${selectedDateFilter}, Total Users: ${registeredUsers.length}`);

            if (selectedDateFilter === 'all') {
                list = registeredUsers;
            } else {
                list = registeredUsers.filter(u => {
                    const appDates = userAppDates[u.id];
                    if (!appDates || appDates.length === 0) return false;

                    // Check if ANY of the application dates match the selected filter
                    return appDates.some(date => {
                        const monthYear = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                        return monthYear === selectedDateFilter;
                    });
                });
            }
            console.log(`[DateFilter] Filtered Result Count: ${list.length}`);
        } else {
            // Otherwise show job candidates
            list = isFilteringApplicants
                ? filteredCandidates
                : candidates.filter(c => c.status === 'pending' || !c.status || c.status === 'shortlisted');
        }

        // 2. Apply AI Cluster filter to WHATEVER list is active
        if (activeClusterId !== null) {
            const cluster = clusters.find(c => c.id === activeClusterId);
            if (cluster) {
                list = list.filter(c => cluster.candidateIds.includes(c.id));
            }
        }

        // 3. Apply Premium Limit (30 Candidates) for non-premium recruiters
        if (userRole !== 'admin' && !isPremium) {
            list = list.slice(0, 30);
        }

        return list;
    }, [viewMode, registeredUsers, isFilteringApplicants, filteredCandidates, candidates, activeClusterId, clusters, selectedDateFilter, userAppDates, userRole, isPremium]);

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
                    userApplications={viewMode === 'registered-users' ? userApplications : undefined}
                />
            ) : (
                <>
                    {activeView === 'list' && (
                        <>
                            {/* Unified Header & Controls */}
                            <div className="mb-6 space-y-4">
                                {/* Top Bar: Title, Description & Controls */}
                                <div className="bg-white p-4 rounded-xl border border-gray-200">
                                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                                        {/* Title, Count and Description */}
                                        <div className="flex items-start gap-3">
                                            {(isFilteringApplicants || onBack) && (
                                                <button
                                                    onClick={onBack}
                                                    className="p-1.5 mt-0.5 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors flex-shrink-0"
                                                    title="Back"
                                                >
                                                    <ArrowLeft className="w-5 h-5" />
                                                </button>
                                            )}
                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <h2 className="text-xl font-bold text-gray-900">
                                                        {postId ? 'Post Applicants' : (viewMode === 'registered-users' ? 'Registered Candidates' : 'Uploaded Candidates')}
                                                    </h2>
                                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                                                        {displayCandidates.length}
                                                    </span>
                                                    {userRole !== 'admin' && !isPremium && (
                                                        <div className="group relative">
                                                            <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-600 text-xs font-black border border-orange-200 cursor-help uppercase tracking-tighter">
                                                                Get Premium
                                                            </span>
                                                            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-max px-3 py-1.5 bg-gray-900 text-white text-[10px] rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-[60] font-bold">
                                                                Get premium To View All Candidates
                                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-8 border-transparent border-b-gray-900" />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-sm text-gray-500">Review and manage candidate applications and profiles</p>
                                            </div>
                                        </div>

                                        {/* Search and AI Group Controls */}
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:flex-1 md:flex-initial md:w-auto">
                                            {/* Post View Toggle */}
                                            {!postId && !isFilteringApplicants && viewMode !== 'registered-users' && (
                                                <button
                                                    onClick={() => setShowPostView(!showPostView)}
                                                    className={`p-2 rounded-lg transition-all ${showPostView
                                                        ? 'bg-orange-600 text-white shadow-md'
                                                        : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                                                        }`}
                                                    title="Post-based view"
                                                >
                                                    <LayoutGrid className="w-5 h-5" />
                                                </button>
                                            )}

                                            {/* Search */}
                                            <div className="relative flex-1 sm:w-64 md:w-72">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <Search className="h-4 w-4 text-gray-400" />
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Search candidates..."
                                                    className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 sm:text-sm transition-all duration-200"
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                />
                                            </div>

                                            {/* Date Filter (Only for Registered Candidates) */}
                                            {viewMode === 'registered-users' && (
                                                <div className="relative">
                                                    <select
                                                        value={selectedDateFilter}
                                                        onChange={(e) => setSelectedDateFilter(e.target.value)}
                                                        className="appearance-none bg-white border border-gray-200 text-gray-700 py-2 pl-3 pr-8 rounded-lg leading-tight focus:outline-none focus:bg-white focus:border-gray-500 text-sm h-full"
                                                    >
                                                        <option value="all">All Dates</option>
                                                        {availableDates.map(date => (
                                                            <option key={date} value={date}>{date}</option>
                                                        ))}
                                                    </select>
                                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Registered Candidates Button - When not viewing a specific post */}
                                            {!postId && (
                                                <button
                                                    onClick={() => {
                                                        if (viewMode === 'job-candidates') {
                                                            setViewMode('registered-users');
                                                        } else {
                                                            setViewMode('job-candidates');
                                                            setUserApplications([]);
                                                        }
                                                    }}
                                                    className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${viewMode === 'registered-users'
                                                        ? 'bg-orange-600 text-white shadow-md'
                                                        : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    {viewMode === 'registered-users' ? 'Uploaded Candidates' : 'Registered Candidates'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {showPostView ? (
                                /* Post Card Grid View */
                                <div className="space-y-4">
                                    {postCards.length === 0 ? (
                                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
                                            <Briefcase className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                                            <h3 className="text-lg font-medium text-gray-900">No posts found</h3>
                                            <p className="mt-1 text-gray-500">Create a job post to get started.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                                            {postCards.map((post) => (
                                                <div
                                                    key={post.id}
                                                    onClick={() => {
                                                        setShowPostView(false);
                                                        setFilterPostId(post.id || null);
                                                        setIsFilteringApplicants(true);
                                                        isFilteringRef.current = true;
                                                        fetchApplicantsForPost(post.id || '');
                                                    }}
                                                    className="bg-white rounded-2xl border border-gray-200 hover:border-orange-500/20 hover:-translate-y-0.5 transition-all duration-300 cursor-pointer overflow-hidden group"
                                                >
                                                    {/* Top accent bar */}
                                                    <div className="h-1 w-full bg-gradient-to-r from-orange-500 to-pink-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />

                                                    <div className="p-4 sm:p-6 flex-1 flex flex-col">
                                                        {/* Title + Position Level */}
                                                        <div className="flex items-start justify-between gap-2 mb-3">
                                                            <h3 className="text-lg sm:text-xl font-bold text-gray-900 leading-tight line-clamp-2">{post.jobTitle}</h3>
                                                            {post.positionLevel && (
                                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-100 whitespace-nowrap">
                                                                    {post.positionLevel}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Department */}
                                                        {post.department && (
                                                            <div className="flex items-center text-xs sm:text-sm text-gray-500 font-medium mb-3">
                                                                <Briefcase className="w-3.5 h-3.5 mr-1.5 text-gray-400" />
                                                                {post.department}
                                                            </div>
                                                        )}

                                                        {/* Metrics grid */}
                                                        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
                                                            {post.yearsExperience && (
                                                                <div className="bg-gray-50 p-2 rounded-lg border border-gray-100">
                                                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Experience</div>
                                                                    <div className="flex items-center text-xs sm:text-sm font-medium text-gray-700">
                                                                        <Clock className="w-3 h-3 mr-1 text-orange-500" />
                                                                        {post.yearsExperience}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {post.location && (
                                                                <div className="bg-gray-50 p-2 rounded-lg border border-gray-100">
                                                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">Location</div>
                                                                    <div className="flex items-center text-xs sm:text-sm font-medium text-gray-700">
                                                                        <MapPin className="w-3 h-3 mr-1 text-blue-500" />
                                                                        {post.location}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Skills */}
                                                        {post.skills && (
                                                            <div className="flex flex-wrap gap-1 mb-4">
                                                                {post.skills.split(',').slice(0, 3).map((skill: string, i: number) => (
                                                                    <span key={i} className="text-[10px] px-2 py-0.5 bg-white border border-gray-200 text-gray-600 font-bold rounded">
                                                                        {skill.trim()}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* Footer */}
                                                        <div className="mt-auto pt-3 border-t border-gray-100 flex items-center justify-between">
                                                            {post.createdAt && (
                                                                <div className="flex items-center text-xs font-medium text-gray-400">
                                                                    <Calendar className="w-3 h-3 mr-1" />
                                                                    {(() => {
                                                                        const d = (post.createdAt as any)?.toDate ? (post.createdAt as any).toDate() : new Date(post.createdAt);
                                                                        const diff = Date.now() - d.getTime();
                                                                        const days = Math.floor(diff / 86400000);
                                                                        if (days === 0) return 'Just now';
                                                                        if (days === 1) return '1d ago';
                                                                        if (days < 30) return `${days}d ago`;
                                                                        return d.toLocaleDateString();
                                                                    })()}
                                                                </div>
                                                            )}
                                                            <div className="text-xs font-bold text-orange-600">
                                                                {post.applicantCount} Applicant{post.applicantCount !== 1 ? 's' : ''}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
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
                                    jobId={filterPostId}
                                />
                            )}
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

export default function CandidatesTab(props: { postId?: string | null; onClearFilter?: () => void; onBack?: () => void; onNavigateToShortlisted?: (candidateId: string) => void; userRole?: string | null; userId?: string | null; isPremium?: boolean }) {
    return (
        <ErrorBoundary>
            <CandidatesTabContent {...props} />
        </ErrorBoundary>
    );
}
