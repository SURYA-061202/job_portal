'use client';

import { useState, useEffect, useRef, useMemo, useDeferredValue } from 'react';
import { collection, getDocs, getDoc, query as fsQuery, orderBy, where, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getAllApplications, getApplicantCounts, getPostApplications, getUserApplications } from '@/lib/jobApplications';
import { getUserCertificates, getUserCourses, getUserEducation, getUserExperience, getUserProjects, getUserSkills } from '@/lib/userToCandidate';
import { parseKeywords, searchCandidates } from '@/lib/candidateSearch';
import {
    activeFilterChips,
    buildCandidateFilterSections,
    hasActiveFilters,
    matchesCandidateFilters,
    type SelectedFilters
} from '@/lib/candidateFilters';
import { isUnlimited } from '@/lib/subscriptions';
import { spendCredits, unlockKey } from '@/lib/credits';
import type { Candidate } from '@/types';
import CandidateList from '@/components/resume/CandidateList';
import CandidateTable from '@/components/resume/CandidateTable';
import CandidateCarousel from '@/components/resume/CandidateCarousel';
import BackRow from '@/components/layout/BackRow';
import CandidateSearchResults from '@/components/resume/CandidateSearchResults';
import InviteFlow from '@/components/resume/InviteFlow';

import CandidateDetail from '@/components/resume/CandidateDetail';
import ManualDetailsModal from '@/components/resume/ManualDetailsModal';
import FilterSidebar from '@/components/recruitment/FilterSidebar';
import { ArrowLeft, Search, LayoutGrid, List, Briefcase, Calendar, Lock, X, SlidersHorizontal } from 'lucide-react';
import popup from '@/components/ui/Popup';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { RecruitmentRequest } from '@/types';
import { useSkin, FOCUS } from '@/styles/skin';
import { useRecordProfileView } from '@/lib/profileViews';
import { matchScore } from '@/lib/postMatch';

interface CandidatesTabProps {
    postId?: string | null;
    postTitle?: string | null;
    onClearFilter?: () => void;
    onBack?: () => void;
    onNavigateToShortlisted?: (candidateId: string) => void;
    userRole?: string | null;
    userId?: string | null;
    /** How many candidates the recruiter's plan lets them see (UNLIMITED = no cap). */
    candidateLimit?: number;
    /** Name of the plan that sets candidateLimit, for the upgrade banner. */
    planName?: string;
    /** True with an active subscription (or admin): contact details and resumes are visible. */
    canViewContact?: boolean;
    /** Opens the Subscription screen. */
    onViewPlans?: () => void;
}

/** Builds the Candidate shape the list/detail views expect from a platform user's profile document. */
function userDocToCandidate(
    id: string,
    data: Record<string, any>,
    fallbackName: string,
    fallbackRole: string,
    extra: Record<string, unknown> = {}
): Candidate {
    return {
        id,
        name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || fallbackName,
        email: data.email || '',
        phone: data.mobile || '',
        role: data.department || fallbackRole,
        experience: data.yearsOfExperience || '',
        skills: getUserSkills(data),
        resumeUrl: data.resumeUrl || '',
        extractedData: {
            summary: '',
            workExperience: [],
            education: getUserEducation(data),
            skills: getUserSkills(data),
            certifications: data.certifications || [],
            projects: data.keyProjects || data.projects || []
        },
        education: getUserEducation(data),
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(),
        rankings: data.rankings, // Include AI rankings
        // Profile text the keyword search looks through and the result cards show.
        profileExtras: {
            location: data.address || data.city || data.location || '',
            experience: getUserExperience(data),
            projects: getUserProjects(data),
            certificates: getUserCertificates(data),
            courses: getUserCourses(data)
        },
        ...extra
    } as unknown as Candidate;
}

/**
 * Recruiter-uploaded candidates only carry education parsed from a resume. When the same person
 * has a platform profile (matched by email), show the education they entered there instead:
 * duration, grade, arrears, gap and the uploaded marksheet.
 */
async function withProfileEducation(list: Candidate[]): Promise<Candidate[]> {
    if (list.length === 0) return list;
    try {
        const snap = await getDocs(fsQuery(collection(db, 'users'), where('role', '==', 'user')));
        const byEmail = new Map<string, Record<string, any>>();
        // Several accounts can share an email: keep the one whose education has the most details filled in.
        const detail = (data: Record<string, any>) =>
            (data.educationItems as Record<string, any>[]).reduce(
                (n, e) => n + (e.marksheetUrl ? 2 : 0) + (e.grade ? 1 : 0) + (e.duration ? 1 : 0) + (e.hasArrears ? 1 : 0) + (e.hasGap ? 1 : 0),
                0
            );
        snap.forEach((d) => {
            const data = d.data();
            const email = String(data.email || '').trim().toLowerCase();
            if (!email || !Array.isArray(data.educationItems) || data.educationItems.length === 0) return;
            const existing = byEmail.get(email);
            if (!existing || detail(data) >= detail(existing)) byEmail.set(email, data);
        });
        return list.map((c) => {
            const profile = byEmail.get(String(c.email || '').trim().toLowerCase());
            if (!profile) return c;
            const education = getUserEducation(profile);
            return { ...c, education, extractedData: c.extractedData ? { ...c.extractedData, education } : c.extractedData } as Candidate;
        });
    } catch (error) {
        console.error('Could not load profile education for candidates:', error);
        return list;
    }
}

function CandidatesTabContent({ postId, postTitle, onClearFilter: _onClearFilter, onBack, onNavigateToShortlisted, userRole, userId, candidateLimit, planName, canViewContact = false, onViewPlans }: CandidatesTabProps) {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [filteredCandidates, setFilteredCandidates] = useState<Candidate[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
    // Opening a candidate, from the cards or the detail page, shows on their Profile Visibility.
    useRecordProfileView(selectedCandidate?.id);
    const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);

    // Clustering State
    const [clusters, setClusters] = useState<{ id: number; label: string; candidateIds: string[] }[]>([]);
    const [activeClusterId, setActiveClusterId] = useState<number | null>(null);

    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState<'list' | 'history'>('list');
    const [searchTerm, setSearchTerm] = useState('');
    // The search runs live as the recruiter types; the results follow the box.
    const [committedSearch, setCommittedSearch] = useState('');
    const deferredSearch = useDeferredValue(committedSearch);
    // One charge per typing session: idle until the first character, then the
    // session is billing/charged/failed and stays that way until the box is cleared.
    const chargeStateRef = useRef<'idle' | 'charging' | 'charged' | 'failed'>('idle');
    const chargeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearChargeTimer = () => {
        if (chargeTimerRef.current) {
            clearTimeout(chargeTimerRef.current);
            chargeTimerRef.current = null;
        }
    };

    // Bills the session once. Results are already on screen; a failed charge
    // (out of credit points) hides them again - spendCredits shows the message.
    const chargeOnce = async (term: string) => {
        if (chargeStateRef.current !== 'idle') return;
        chargeStateRef.current = 'charging';
        const { ok } = await spendCredits('search', { note: term, label: 'A search' });
        chargeStateRef.current = ok ? 'charged' : 'failed';
        if (!ok) setCommittedSearch('');
    };

    // Live search: every keystroke updates the results; the first character of a
    // session schedules the charge (debounced, so a finished keyword is what gets
    // billed and a stray keypress costs nothing). Clearing is free and ends the
    // session, so the next search charges again.
    const handleSearchInput = (value: string) => {
        setSearchTerm(value);
        clearChargeTimer();
        if (!value.trim()) {
            if (chargeStateRef.current !== 'charging') chargeStateRef.current = 'idle';
            setCommittedSearch('');
            return;
        }
        // A failed session stays hidden until the box is cleared.
        if (chargeStateRef.current === 'failed') return;
        setCommittedSearch(value);
        if (chargeStateRef.current === 'idle') {
            chargeTimerRef.current = setTimeout(() => {
                chargeTimerRef.current = null;
                void chargeOnce(value);
            }, 500);
        }
    };

    // Enter bills right away instead of waiting out the debounce.
    const flushSearchCharge = () => {
        clearChargeTimer();
        if (searchTerm.trim() && chargeStateRef.current === 'idle') void chargeOnce(searchTerm);
    };

    useEffect(() => clearChargeTimer, []);

    // Facet filters from the sidebar: instant and free (never routed through
    // the keyword search, so they never cost a credit point).
    const [selectedFilters, setSelectedFilters] = useState<SelectedFilters>({});
    const [filtersOpen, setFiltersOpen] = useState(false);
    const toggleFilter = (section: string, option: string) => {
        setSelectedFilters(prev => {
            const current = prev[section] ?? [];
            return {
                ...prev,
                [section]: current.includes(option)
                    ? current.filter(value => value !== option)
                    : [...current, option]
            };
        });
    };
    const clearAllFilters = () => setSelectedFilters({});

    const [filterPostId, setFilterPostId] = useState<string | null>(null);
    const [isFilteringApplicants, setIsFilteringApplicants] = useState(false);

    // Registered Candidates State - the module opens on Registered Candidates;
    // the Uploaded Candidates list is hidden, so this never switches views.
    const viewMode: 'job-candidates' | 'registered-users' = 'registered-users';
    const [registeredUsers, setRegisteredUsers] = useState<Candidate[]>([]);
    const [userApplications, setUserApplications] = useState<any[]>([]);
    const [showPostView, setShowPostView] = useState(false);
    const [postCards, setPostCards] = useState<(RecruitmentRequest & { applicantCount: number })[]>([]);
    const skin = useSkin();
    // Table (default) or cards; remembered per browser.
    const [layout, setLayout] = useState<'table' | 'cards'>(() => {
        try { return localStorage.getItem('candidatesViewMode') === 'cards' ? 'cards' : 'table'; } catch { return 'table'; }
    });
    const changeLayout = (mode: 'table' | 'cards') => {
        setLayout(mode);
        try { localStorage.setItem('candidatesViewMode', mode); } catch { /* private mode: just not remembered */ }
    };
    const CandidatesView = layout === 'cards' ? CandidateCarousel : CandidateTable;
    const [inviteFor, setInviteFor] = useState<Candidate | null>(null);
    // Post path: the post being viewed (for match scores) and the Applied / Non Applied switch.
    const [post, setPost] = useState<RecruitmentRequest | null>(null);
    const [showNonApplied, setShowNonApplied] = useState(false);
    const [usersLoaded, setUsersLoaded] = useState(false);
    // candidate id -> ids of this recruiter's posts they applied to
    const [appliedPosts, setAppliedPosts] = useState<Record<string, string[]>>({});

    useEffect(() => {
        (async () => {
            try {
                const isAdmin = userRole === 'admin';
                let owned: Set<string> | null = null;
                if (!isAdmin && userId) {
                    const snap = await getDocs(fsQuery(collection(db, 'recruits'), where('recruiterId', '==', userId)));
                    owned = new Set(snap.docs.map(d => d.id));
                }
                const apps = await getAllApplications();
                const map: Record<string, string[]> = {};
                apps.forEach(a => {
                    if (owned && !owned.has(a.post_id)) return;
                    (map[a.user_id] ||= []).push(a.post_id);
                });
                setAppliedPosts(map);
            } catch (err) {
                console.error('Failed to load applicants', err);
            }
        })();
    }, [userId, userRole]);
    // Same rule as contact details: no plan, no Interview Invite.
    const inviteHandler = canViewContact ? (c: Candidate) => setInviteFor(c) : undefined;

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

    useEffect(() => {
        setShowNonApplied(false);
        setPost(null);
        if (!postId) return;
        let cancelled = false;
        getDoc(doc(db, 'recruits', postId))
            .then((snap) => { if (!cancelled && snap.exists()) setPost({ id: snap.id, ...snap.data() } as RecruitmentRequest); })
            .catch((err) => console.error('Failed to load post for matching', err));
        return () => { cancelled = true; };
    }, [postId]);

    // Non Applied needs every registered user; load them the first time it is opened.
    useEffect(() => {
        if (postId && showNonApplied && !usersLoaded) {
            setUsersLoaded(true);
            fetchRegisteredUsers();
        }
    }, [postId, showNonApplied, usersLoaded]);

    // Fetch posts + applicant counts for post card grid view
    useEffect(() => {
        if (!showPostView) return;
        const fetchPostCards = async () => {
            try {
                const recruitsRef = collection(db, 'recruits');
                // Each user (recruiter or admin) only sees posts they created.
                const q = userId
                    ? fsQuery(recruitsRef, where('recruiterId', '==', userId))
                    : fsQuery(recruitsRef, orderBy('createdAt', 'desc'));
                const snapshot = await getDocs(q);
                let posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as RecruitmentRequest));
                if (userId) {
                    posts = posts.sort((a, b) => {
                        const dateA = (a.createdAt as any)?.toDate ? (a.createdAt as any).toDate() : (a.createdAt || 0);
                        const dateB = (b.createdAt as any)?.toDate ? (b.createdAt as any).toDate() : (b.createdAt || 0);
                        return Number(dateB) - Number(dateA);
                    });
                }

                // Fetch applicant counts
                const counts: Record<string, number> = await getApplicantCounts();

                // Add counts from Firestore uploaded candidates
                const candSnap = await getDocs(collection(db, 'candidates'));
                candSnap.forEach(cDoc => {
                    const cData = cDoc.data();
                    const targetPostId = cData.postId || cData.recruitmentId;
                    if (targetPostId) {
                        counts[targetPostId] = (counts[targetPostId] || 0) + 1;
                    }
                });

                setPostCards(posts.map(p => ({ ...p, applicantCount: counts[p.id || ''] || 0 })));
            } catch (error) {
                console.error('Error fetching post cards:', error);
            }
        };
        fetchPostCards();
    }, [showPostView, userId]);

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

            if (userRole && userRole !== 'admin' && userId) {
                // Recruiters only see candidates they uploaded themselves; admin sees all.
                q = fsQuery(candidatesRef, where('recruiterId', '==', userId));
            }
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

            setCandidates(await withProfileEducation(candidatesData));
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

            const enriched = await withProfileEducation(allCandidates);
            allCandidates.splice(0, allCandidates.length, ...enriched);
            console.log(`[DEBUG] Found ${allCandidates.length} manually uploaded candidates for this post`);

            // 2. Fetch applications (include all statuses)
            let apps: { user_id: string; status: string }[] = [];
            try {
                apps = await getPostApplications(postId);
            } catch (appsError) {
                console.error('[DEBUG] job_applications fetch error:', appsError);
                // Don't throw — uploaded candidates are in Firestore only
            }

            if (!apps || apps.length === 0) {
                console.log('[DEBUG] No applicants found for this post.');
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

                            allCandidates.push(
                                userDocToCandidate(uid, data, 'Unnamed Candidate', 'Applicant', { postId, status: appStatus })
                            );
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
                // Job seekers can switch off "Show me to recruiters" on their profile.
                if (data.searchable === false) {
                    return;
                }
                users.push(userDocToCandidate(doc.id, data, 'Unnamed User', 'User', { status: 'pending' }));
            });

            setRegisteredUsers(await withProfileEducation(users));

        } catch (error) {
            console.error('Error fetching registered users:', error);
            popup.error('Failed to load registered users');
        } finally {
            setLoading(false);
        }
    };

    // Fetch job applications for a specific user
    const fetchUserApplications = async (userId: string) => {
        try {
            const applications = await getUserApplications(userId);

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

    // Opening a candidate's profile costs credit points, once per candidate.
    const chargeProfileView = async (candidate: Candidate): Promise<boolean> =>
        (await spendCredits('view', { kind: 'view_profile', note: candidate.name, unlockKey: unlockKey(candidate.id, 'profile'), label: 'Viewing profile details' })).ok;

    const handleCandidateSelect = async (candidate: Candidate) => {
        // If in registered users view, fetch their application history
        if (viewMode === 'registered-users') {
            if (!(await chargeProfileView(candidate))) return;
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
        if (!(await chargeProfileView(candidate))) return;
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

    // Keywords typed into the search box (deferred so typing stays smooth on long lists).
    const keywords = useMemo(() => parseKeywords(deferredSearch), [deferredSearch]);
    const isSearching = keywords.length > 0;

    // Everything the recruiter could see before the plan limit is applied.
    const baseList = useMemo(() => {
        let list: Candidate[] = [];

        // 1. Determine base list: on the Posts path the post's applicants win;
        // otherwise the module's registered list.
        if (viewMode === 'registered-users' && !postId) {
            list = registeredUsers;
        } else if (postId && showNonApplied) {
            // Everyone registered who has not applied to (or been added to) this post.
            const applied = new Set(filteredCandidates.map(c => c.id));
            list = registeredUsers.filter(c => !applied.has(c.id));
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

        return list;
    }, [viewMode, postId, showNonApplied, registeredUsers, isFilteringApplicants, filteredCandidates, candidates, activeClusterId, clusters]);

    // Sidebar sections with per-option counts, derived from the list on screen.
    const filterSections = useMemo(() => buildCandidateFilterSections(baseList), [baseList]);
    const filtersActive = hasActiveFilters(selectedFilters);
    const activeFilterCount = Object.values(selectedFilters).reduce((n, values) => n + values.length, 0);
    const filterChips = useMemo(
        () => (filtersActive ? activeFilterChips(selectedFilters, filterSections) : []),
        [filtersActive, selectedFilters, filterSections]
    );

    // Facets narrow the list BEFORE keyword search and the plan cap, so counts,
    // rankings and the "N locked" banner all describe the filtered set.
    const facetList = useMemo(
        () => (filtersActive ? baseList.filter(candidate => matchesCandidateFilters(candidate, selectedFilters)) : baseList),
        [baseList, selectedFilters, filtersActive]
    );

    // On the Posts path every candidate gets a 0-100 fit for this post, best first.
    const scores = useMemo(() => {
        if (!postId || !post) return undefined;
        const out: Record<string, number> = {};
        for (const c of facetList) out[c.id] = matchScore(c, post);
        return out;
    }, [postId, post, facetList]);

    // Most common skills across the list, offered as one-click search chips.
    const topSkills = useMemo(() => {
        const counts = new Map<string, { label: string; n: number }>();
        for (const c of facetList) {
            for (const raw of Array.isArray(c.skills) ? c.skills : []) {
                const label = String(raw).trim();
                if (!label) continue;
                const key = label.toLowerCase();
                const cur = counts.get(key);
                if (cur) cur.n += 1; else counts.set(key, { label, n: 1 });
            }
        }
        return [...counts.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([key, v]) => ({ key, label: v.label }));
    }, [facetList]);

    const toggleSkill = (skill: string) => {
        const parts = searchTerm.split(',').map((p) => p.trim()).filter(Boolean);
        const has = parts.some((p) => p.toLowerCase() === skill.toLowerCase());
        const next = (has ? parts.filter((p) => p.toLowerCase() !== skill.toLowerCase()) : [...parts, skill]).join(', ');
        handleSearchInput(next);
    };

    // Keyword search runs over the FULL list and ranks by relevance; the plan
    // limit is applied afterwards, so a keyword never reveals a hidden candidate
    // and the best matches are the ones a limited plan still shows.
    const searchResults = useMemo(
        () => {
            const found = searchCandidates(facetList, keywords, 'any');
            // Without keywords the list order is ours to choose: best post match first.
            return scores && keywords.length === 0
                ? [...found].sort((a, b) => (scores[b.candidate.id] ?? 0) - (scores[a.candidate.id] ?? 0))
                : found;
        },
        [facetList, keywords, scores]
    );

    // Admins are never capped. A recruiter is capped by their plan.
    const capped = userRole !== 'admin' && candidateLimit !== undefined && !isUnlimited(candidateLimit);
    const visibleResults = useMemo(
        () => (capped ? searchResults.slice(0, candidateLimit) : searchResults),
        [searchResults, capped, candidateLimit]
    );
    const displayCandidates = useMemo(() => visibleResults.map(r => r.candidate), [visibleResults]);
    const hiddenCount = searchResults.length - visibleResults.length;
    // Beside an opened profile during a search: the matches first, then everyone else.
    const splitCandidates = useMemo(() => {
        const matchedIds = new Set(visibleResults.map((r) => r.candidate.id));
        const rest = facetList.filter((c) => !matchedIds.has(c.id));
        const all = [...visibleResults.map((r) => r.candidate), ...rest];
        return capped ? all.slice(0, candidateLimit) : all;
    }, [visibleResults, facetList, capped, candidateLimit]);

    // The white results panel hugs the list, but fills the whole body area
    // when there is nothing to show.
    // Plain candidate table: the body is one screen tall and only the table scrolls.
    const tableFill = !showPostView && (!isSearching || !!selectedCandidate);
    const listEmpty = showPostView ? postCards.length === 0 : displayCandidates.length === 0;

    // Opening a candidate from the plain list keeps the list on screen, moved to the right.
    const splitView = !!selectedCandidate && activeView === 'list' && !showPostView;
    const detailEl = selectedCandidate ? (
        <CandidateDetail
            candidate={selectedCandidate}
            onBack={handleBackToList}
            onInviteSent={handleInviteSent}
            onRemoveCandidate={() => {
                fetchCandidates();
                setSelectedCandidate(null);
            }}
            userApplications={!postId && viewMode === 'registered-users' ? userApplications : undefined}
            activePostId={postId}
        />
    ) : null;

    return (
        <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-4 flex-1 min-h-0 flex flex-col`}>
            {selectedCandidate && !splitView ? (
                detailEl
            ) : (
                <>
                    {activeView === 'list' && (
                        // Left: facet sidebar (desktop). Right: search masthead
                        // + the only scrollable body, so the table keeps its
                        // own scroll area beside a sticky filter panel.
                        <div className={`flex-1 min-h-0 flex flex-col ${showPostView ? '' : 'lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6'}`}>
                            {!showPostView && (
                                <aside aria-label="Candidate filters" className="hidden lg:block lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto thin-scrollbar lg:pr-1">
                                    <FilterSidebar
                                        sections={filterSections}
                                        selectedFilters={selectedFilters}
                                        onToggleFilter={toggleFilter}
                                        onClearFilters={clearAllFilters}
                                    />
                                </aside>
                            )}
                            <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-4 lg:min-h-0">
                            {postId && onBack ? (
                                <div className="mb-3 flex items-center gap-3 px-4">
                                    <button
                                        type="button"
                                        onClick={onBack}
                                        aria-label="Back to posts"
                                        title="Back to posts"
                                        className={`flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-black bg-black text-white shadow-sm transition-colors duration-200 hover:bg-black/80 ${FOCUS}`}
                                    >
                                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                    <h2 className="min-w-0 text-2xl font-bold leading-tight text-ink sm:text-3xl">{postTitle || 'Post Applicants'}</h2>
                                    <div role="group" aria-label="Candidate group" className="ml-auto inline-flex shrink-0 overflow-hidden rounded-lg border border-black">
                                        {([['Applied', false], ['Non Applied', true]] as const).map(([label, value]) => (
                                            <button
                                                key={label}
                                                type="button"
                                                aria-pressed={showNonApplied === value}
                                                onClick={() => { setShowNonApplied(value); setSelectedCandidate(null); }}
                                                className={`cursor-pointer px-4 py-1.5 text-sm font-semibold transition-colors duration-200 ${showNonApplied === value ? 'bg-black text-white' : 'bg-surface text-ink hover:bg-ink/5'} ${FOCUS}`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (isFilteringApplicants || onBack) && (
                                <BackRow
                                    onBack={onBack}
                                    label="Go back"
                                    title={postId ? (postTitle || 'Post Applicants') : undefined}
                                    className="mb-3"
                                />
                            )}
                            <div className="shrink-0">
                                {/* Controls row below the header: search at the
                                    left end, candidates count at the right end.
                                    The post-based toggle rides next to the
                                    search; it is not offered on the Posts path. */}
                                <div className="flex flex-wrap items-center justify-center gap-3">
                                    <div className="flex min-w-0 flex-wrap items-center justify-center gap-2 sm:gap-3">
                                        <div className="relative w-full sm:w-[36rem] max-w-full">
                                            <label htmlFor="candidate-keyword-search" className="sr-only">
                                                Search candidates by keywords
                                            </label>
                                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                                <Search className="h-5 w-5 text-ink/40" />
                                            </div>
                                            <input
                                                id="candidate-keyword-search"
                                                type="text"
                                                placeholder="Search by skill, role, company or college"
                                                title='Separate keywords with commas, e.g. "site engineer, autocad". Without commas each word is a keyword; use "quotes" to keep a phrase together. The search runs as you type (1 credit point per search).'
                                                className={`block w-full h-12 pl-11 pr-10 text-sm rounded-lg border border-ink/20 bg-surface text-ink placeholder:text-ink/40 shadow-sm transition-colors hover:border-ink/40 ${FOCUS}`}
                                                value={searchTerm}
                                                onChange={(e) => handleSearchInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        flushSearchCharge();
                                                    } else if (e.key === 'Escape' && searchTerm) {
                                                        e.preventDefault();
                                                        handleSearchInput('');
                                                    }
                                                }}
                                            />
                                            {searchTerm && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleSearchInput('')}
                                                    aria-label="Clear search"
                                                    className={`absolute inset-y-0 right-0 my-auto mr-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                                                >
                                                    <X className="h-4 w-4" aria-hidden="true" />
                                                </button>
                                            )}
                                        </div>
                                        {!postId && !isFilteringApplicants && viewMode !== 'registered-users' && (
                                            <button
                                                onClick={() => setShowPostView(!showPostView)}
                                                className={`flex h-9 w-9 items-center justify-center border border-ink/70 bg-ink/70 text-surface ${skin.radius} transition-colors duration-200 hover:bg-ink/60 ${FOCUS}`}
                                                title="Post-based view"
                                            >
                                                <LayoutGrid className="w-5 h-5" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {!showPostView && !loading && (
                                    <div className="mx-auto mt-3 w-full max-w-[72rem] px-4">
                                        {topSkills.length > 0 && (
                                            <div className="flex flex-wrap items-center justify-center gap-2">
                                                <span className="text-xs font-medium text-ink/50">Popular skills:</span>
                                                {topSkills.map((t) => {
                                                    const active = keywords.some((k) => k.toLowerCase() === t.key);
                                                    return (
                                                        <button
                                                            key={t.key}
                                                            type="button"
                                                            onClick={() => toggleSkill(t.label)}
                                                            aria-pressed={active}
                                                            className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200 ${active ? 'border-ink bg-ink text-surface' : 'border-ink/15 bg-surface text-ink/70 hover:border-ink/40'} ${FOCUS}`}
                                                        >
                                                            {t.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {/* Same side padding as the card grid, so the count lines up with the first card. */}
                                {!showPostView && !loading && (
                                    <>
                                    <div aria-live="polite" className="mt-5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-4">
                                        <p className="flex items-baseline gap-1.5">
                                            <span className="text-2xl font-black leading-none tabular-nums text-ink">{displayCandidates.length}</span>
                                            <span className="text-sm font-semibold text-ink/60">
                                                {isSearching ? (displayCandidates.length === 1 ? 'match' : 'matches') : (displayCandidates.length === 1 ? 'candidate' : 'candidates')}
                                            </span>
                                        </p>
                                        {isSearching && (
                                            <span className="max-w-[22rem] truncate rounded-full bg-ink/5 px-3 py-1 text-xs font-medium text-ink/70" title={keywords.join(', ')}>
                                                for {keywords.join(', ')}
                                            </span>
                                        )}
                                        {hiddenCount > 0 && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                                                <Lock className="h-3 w-3" aria-hidden="true" />
                                                {hiddenCount} locked
                                            </span>
                                        )}
                                        <div className="ml-auto flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setFiltersOpen(true)}
                                                className={`relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-ink/70 bg-surface px-3 text-xs font-semibold text-ink transition-colors duration-200 hover:bg-ink/5 lg:hidden ${FOCUS}`}
                                            >
                                                <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                                                Filters
                                                {activeFilterCount > 0 && (
                                                    <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold tabular-nums text-white">
                                                        {activeFilterCount}
                                                    </span>
                                                )}
                                            </button>
                                            <div role="group" aria-label="Candidate layout" className="inline-flex overflow-hidden rounded-md border border-ink/70">
                                                {([['table', List, 'Table view'], ['cards', LayoutGrid, 'Card view']] as const).map(([mode, Icon, label]) => (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => changeLayout(mode)}
                                                        aria-pressed={layout === mode}
                                                        aria-label={label}
                                                        title={label}
                                                        className={`flex h-8 w-9 cursor-pointer items-center justify-center transition-colors duration-200 ${layout === mode ? 'bg-ink/70 text-surface' : 'bg-surface text-ink hover:bg-ink/5'} ${FOCUS}`}
                                                    >
                                                        <Icon className="h-4 w-4" aria-hidden="true" />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    {filterChips.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-2 px-4">
                                            {filterChips.map((chip) => (
                                                <button
                                                    key={`${chip.sectionKey}:${chip.value}`}
                                                    type="button"
                                                    onClick={() => toggleFilter(chip.sectionKey, chip.value)}
                                                    aria-label={`Remove filter ${chip.label}`}
                                                    className={`group inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-200 ${FOCUS} border-ink/15 bg-surface text-ink/70 hover:border-ink/40`}
                                                >
                                                    {chip.label}
                                                    <X className="h-3 w-3 text-ink/40 group-hover:text-ink" aria-hidden="true" />
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                onClick={clearAllFilters}
                                                className={`cursor-pointer px-1 text-xs font-bold text-destructive transition-colors duration-200 hover:underline ${FOCUS}`}
                                            >
                                                Clear all
                                            </button>
                                        </div>
                                    )}
                                </>)}
                            </div>


                            {/* Body - the only scrollable area, on the same
                                white results panel the Posts module uses, so
                                the cards read grey-on-white. The panel hugs
                                the list and only fills the area when empty.
                                The masthead above stays put. */}
                            <div className={tableFill ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'flex-1 min-h-0 overflow-y-auto overflow-x-hidden thin-scrollbar'}>
                            <div className={`${tableFill ? 'flex-1 min-h-0 overflow-hidden ' : listEmpty ? 'min-h-full ' : ''}${showPostView ? `border ${skin.edge} ${skin.radius} ${skin.resultsPanel} p-3 md:p-4` : 'px-4 py-1'} flex flex-col`}>
                            {showPostView ? (
                                /* Post Card Grid View */
                                <div className="space-y-4 flex flex-col flex-1">
                                    {postCards.length === 0 ? (
                                        <div className={`flex-1 flex items-center justify-center border ${skin.edge} ${skin.cardSurface} ${skin.radius} px-6 py-14 text-center`}>
                                            <div>
                                                <Briefcase className="h-12 w-12 text-brand mx-auto mb-4" />
                                                <h3 className={skin.emptyTitle}>No posts found</h3>
                                                <p className={`mt-1 ${skin.body}`}>Create a job post to get started.</p>
                                            </div>
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
                                                    className={`group relative border ${skin.edge} ${skin.cardSurface} ${skin.radius} transition-colors duration-200 ${skin.cardHover} cursor-pointer overflow-hidden flex flex-col h-full ${FOCUS}`}
                                                >
                                                    {/* Top accent bar */}
                                                    <div className="h-1 w-full bg-brand transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />

                                                    <div className="p-4 sm:p-6 flex-1 flex flex-col">
                                                        {/* Header */}
                                                        <div className="flex justify-between items-start mb-3 sm:mb-4">
                                                            <div className="flex-1 pr-2">
                                                                <div className="flex justify-between items-center gap-4">
                                                                    <h3 className={`${skin.cardTitle} line-clamp-2 flex-1`}>
                                                                        {post.jobTitle}
                                                                    </h3>
                                                                    {post.positionLevel && (
                                                                        <span className={`flex-shrink-0 inline-flex items-center ${skin.chip} rounded-lg`}>
                                                                            {post.positionLevel}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <p className={`${skin.meta} mt-1`}>
                                                                    {post.department}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Key Metrics Grid */}
                                                        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
                                                            {post.yearsExperience && (
                                                                <div className={`flex flex-col p-2 border ${skin.edge} ${skin.canvas} ${skin.radius}`}>
                                                                    <span className={`${skin.micro} mb-0.5`}>Experience</span>
                                                                    <div className={`flex items-center ${skin.cardValue}`}>
                                                                        {post.yearsExperience}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {post.location && (
                                                                <div className={`flex flex-col p-2 border ${skin.edge} ${skin.canvas} ${skin.radius}`}>
                                                                    <span className={`${skin.micro} mb-0.5`}>Location</span>
                                                                    <div className={`flex items-center ${skin.cardValue}`}>
                                                                        {post.location}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Skills Chips */}
                                                        {post.skills && (
                                                            <div className="mb-4 sm:mb-6 flex-1">
                                                                <span className={`${skin.micro} block mb-2`}>Key Skills</span>
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {post.skills.split(',').slice(0, 3).map((skill: string, i: number) => (
                                                                        <span key={i} className={`${skin.tag} rounded-lg`}>
                                                                            {skill.trim()}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Footer */}
                                                        <div className={`pt-3 sm:pt-4 mt-auto border-t ${skin.edge} flex items-center justify-between`}>
                                                            {post.createdAt && (
                                                                <div className={`flex items-center ${skin.meta}`}>
                                                                    <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1 sm:mr-1.5 text-brand" />
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
                                                            <div className={`${skin.count} rounded-lg`}>
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
                                <>
                                    {hiddenCount > 0 && (
                                        <div
                                            role="status"
                                            className={`mb-4 shrink-0 flex flex-wrap items-center justify-between gap-3 border ${skin.edge} ${skin.cardSurface} ${skin.radius} px-4 py-3`}
                                        >
                                            <p className={`flex items-center gap-2 ${skin.body}`}>
                                                <Lock className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                                                <span>
                                                    Your {planName || 'current'} plan shows {candidateLimit} candidates.{' '}
                                                    {hiddenCount} more {isSearching ? (hiddenCount === 1 ? 'match is' : 'matches are') : (hiddenCount === 1 ? 'candidate is' : 'candidates are')} locked.
                                                </span>
                                            </p>
                                            {onViewPlans && (
                                                <button type="button" onClick={onViewPlans} className={`cursor-pointer rounded-lg ${skin.cta} ${FOCUS}`}>
                                                    View plans
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    {isSearching && !loading ? (
                                        visibleResults.length === 0 ? (
                                            <div className={`flex min-h-[240px] items-center justify-center border ${skin.edge} ${skin.cardSurface} ${skin.radius} p-12 text-center`}>
                                                <div>
                                                    <h3 className={skin.emptyTitle}>No matching candidates</h3>
                                                    <p className={`mt-1 ${skin.body}`}>
                                                        Try different or fewer keywords.
                                                    </p>
                                                </div>
                                            </div>
                                        ) : selectedCandidate ? (
                                            /* Opened from search: same layout as the plain list - the profile on the left,
                                               the other matches as cards beside it, sliding for more. */
                                            <CandidatesView
                                                candidates={splitCandidates}
                                                loading={false}
                                                onSelectCandidate={handleCandidateSelect}
                                                selected={selectedCandidate}
                                                onCloseSelected={handleBackToList}
                                                canViewContact={canViewContact}
                                                onViewPlans={onViewPlans}
                                                keywords={keywords}
                                                showStatus={!!postId && !showNonApplied}
 scores={scores}
 onInvite={inviteHandler}
                                            />
                                        ) : (
                                            <CandidateSearchResults
                                                results={visibleResults}
                                                keywords={keywords}
                                                onSelectCandidate={handleCandidateSelect}
                                            />
                                        )
                                    ) : (
                                        <CandidatesView
                                            candidates={displayCandidates}
                                            loading={loading}
                                            onSelectCandidate={handleCandidateSelect}
                                            selected={splitView ? selectedCandidate : null}
                                            onCloseSelected={handleBackToList}
                                            canViewContact={canViewContact}
                                            onViewPlans={onViewPlans}
                                            emptyMessage={filtersActive ? 'No candidates match the selected filters.' : showNonApplied ? 'Every registered candidate has applied to this post.' : isFilteringApplicants ? 'No applicants found for this post.' : 'No candidates yet.'}
                                            showStatus={!!postId && !showNonApplied}
 scores={scores}
 onInvite={inviteHandler}
                                        />
                                    )}
                                </>
                            )}
                            </div>
                            </div>
                            </div>
                        </div>
                    )}

                    {activeView === 'history' && (
                        <>
                            <div className={`flex items-center gap-2 cursor-pointer text-ink/70 hover:text-ink ${FOCUS}`} onClick={() => setActiveView('list')}>
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

            {filtersOpen && (
                <div className="fixed inset-0 z-50 flex items-end lg:hidden" role="dialog" aria-modal="true" aria-label="Filter candidates">
                    <div
                        className="absolute inset-0 bg-black/40"
                        onClick={() => setFiltersOpen(false)}
                        aria-hidden="true"
                    />
                    <div className={`relative flex max-h-[85vh] w-full flex-col overflow-hidden border-t ${skin.edge} ${skin.surface} rounded-t-2xl`}>
                        <div className={`flex shrink-0 items-center justify-between border-b px-4 py-3 ${skin.edge}`}>
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-ink">Filters</h3>
                            <button
                                type="button"
                                onClick={() => setFiltersOpen(false)}
                                aria-label="Close filters"
                                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto p-4 thin-scrollbar">
                            <FilterSidebar
                                sections={filterSections}
                                selectedFilters={selectedFilters}
                                onToggleFilter={toggleFilter}
                                onClearFilters={clearAllFilters}
                            />
                        </div>
                        <div className={`shrink-0 border-t p-3 ${skin.edge}`}>
                            <button
                                type="button"
                                onClick={() => setFiltersOpen(false)}
                                className={`w-full cursor-pointer rounded-lg ${skin.cta} py-2.5 text-sm font-semibold ${FOCUS}`}
                            >
                                Show {displayCandidates.length} {displayCandidates.length === 1 ? 'candidate' : 'candidates'}
                            </button>
                        </div>
                    </div>
                </div>
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
            {inviteFor && (
                <InviteFlow
                    candidate={inviteFor}
                    userRole={userRole}
                    userId={userId}
                    appliedPostIds={appliedPosts[inviteFor.id] ?? []}
                    postId={postId}
                    onClose={() => setInviteFor(null)}
                    onSent={() => { setInviteFor(null); handleInviteSent(); }}
                />
            )}
        </div>
    );
}

export default function CandidatesTab(props: CandidatesTabProps) {
    return (
        <ErrorBoundary>
            <CandidatesTabContent {...props} />
        </ErrorBoundary>
    );
}
