import { useState, useEffect, useRef } from 'react';
import { db, auth, storage } from '@/lib/firebase';
import { doc, getDoc, updateDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { FileDown, CheckCircle2, AlertCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import UserHeader from '@/components/layout/UserHeader';
import { Skeleton, ContentCardSkeleton } from '@/components/user/SkeletonLoaders';
import popup from '@/components/ui/Popup';

/** Pull the storage object path out of a Firebase download URL. */
const decodeStoragePath = (url: string): string | null => {
    try {
        const part = url.split('/o/')[1];
        if (!part) return null;
        return decodeURIComponent(part.split('?')[0]);
    } catch {
        return null;
    }
};

/** True when the URL points at a CV this page generated for this user. */
const isGeneratedResumeUrl = (url: string, uid: string): boolean => {
    const path = decodeStoragePath(url);
    return !!path && path.startsWith(`resumes/${uid}/`) && path.includes('_Generated_Resume');
};

/** Diagnostic trail for the "Use In Your Profile" state. Filter console with `[CV]`. */
const log = (...args: unknown[]) => console.log('[CV]', ...args);

/** Stable short tag for a profile signature so two entries can be compared at a glance. */
const sigTag = (sig: string | undefined | null): string => {
    if (!sig) return '(empty)';
    let h = 5381;
    for (let i = 0; i < sig.length; i++) h = ((h << 5) + h + sig.charCodeAt(i)) | 0;
    return `${(h >>> 0).toString(16)}/${sig.length}`;
};

/** JSON with object keys sorted recursively. Firestore map values are
 *  unordered, so re-reading unchanged data (or any write to the document)
 *  can reshuffle nested key order and change the serialized bytes without
 *  changing a single value. */
const stableJson = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
    }
    return JSON.stringify(value) ?? 'null';
};

/** True when the applied copy still matches the profile data. A pure key-order
 *  reshuffle is NOT a profile change, so the comparison is order-insensitive
 *  (this also keeps signatures written by older builds comparable). */
const sigMatches = (appliedSig: string, currentSig: string): boolean => {
    if (appliedSig === currentSig) return true;
    if (!appliedSig || !currentSig) return false;
    try {
        return stableJson(JSON.parse(appliedSig)) === stableJson(JSON.parse(currentSig));
    } catch {
        return false;
    }
};

/** Field-by-field breakdown of a signature mismatch, for the log. */
const sigDiff = (appliedSig: string, currentSig: string): unknown => {
    if (appliedSig === currentSig) return { kind: 'identical' };
    let a: Record<string, unknown>;
    let b: Record<string, unknown>;
    try {
        a = JSON.parse(appliedSig);
        b = JSON.parse(currentSig);
    } catch {
        return { kind: 'unparseable' };
    }
    const clip = (s: string) => (s.length > 240 ? `${s.slice(0, 240)}...(${s.length})` : s);
    const fields: Record<string, { applied: string; current: string; keyOrderOnly?: boolean }> = {};
    for (const key of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
        const av = JSON.stringify((a ?? {})[key] ?? null);
        const bv = JSON.stringify((b ?? {})[key] ?? null);
        if (av === bv) continue;
        const keyOrderOnly = stableJson((a ?? {})[key]) === stableJson((b ?? {})[key]);
        fields[key] = { applied: clip(av), current: clip(bv), ...(keyOrderOnly ? { keyOrderOnly: true } : {}) };
    }
    const keys = Object.keys(fields);
    if (!keys.length) return { kind: 'same-values-raw-differs' };
    return {
        kind: keys.every((k) => fields[k].keyOrderOnly) ? 'key-order-only' : 'value-changed',
        fields,
    };
};

const buildUserData = (data: any, fallbackEmail: string) => ({
    firstName: data.firstName || '',
    lastName: data.lastName || '',
    email: data.email || fallbackEmail || '',
    mobile: data.mobile || '',
    address: data.address || '',
    resumeUrl: data.resumeUrl || '',
    educationItems: data.educationItems || [],
    projectItems: data.projectItems || [],
    certificateItems: data.certificateItems || [],
    experienceItems: data.experienceItems || [],
    courseItems: data.courseItems || [],
    skillItems: data.skillItems || [],
    portfolio: data.portfolio || '',
    linkedin: data.linkedin || '',
    github: data.github || ''
});

/** Fingerprint of everything the resume template renders. */
const signatureOf = (u: any) => JSON.stringify({
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    mobile: u.mobile,
    address: u.address,
    portfolio: u.portfolio,
    linkedin: u.linkedin,
    github: u.github,
    educationItems: u.educationItems,
    experienceItems: u.experienceItems,
    courseItems: u.courseItems,
    projectItems: u.projectItems,
    certificateItems: u.certificateItems,
    skillItems: u.skillItems,
});

/** Snapshot of the resume this page put into the profile. Held in React state
 *  (not refs) so the restore and the rendered label always agree. */
type AppliedState = { url: string; path: string; sig: string; prev: string };

/** Survives component unmount/remount within the same SPA session, so
 *  switching tabs restores instantly with no async dependency. */
const appliedStateByUid = new Map<string, AppliedState>();

export default function PersonalizedCVPage() {
    const [userData, setUserData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    /** null = the profile keeps its own resume. */
    const [applied, setApplied] = useState<AppliedState | null>(null);
    const [applyingResume, setApplyingResume] = useState(false);
    const resumeRef = useRef<HTMLDivElement>(null);
    /** Drops results of superseded fetches (StrictMode double-effects, quick
     *  tab switches) so a stale read can never clobber a newer restore. */
    const fetchSeq = useRef(0);

    /** Everything the resume template renders - any change here makes the
     *  applied copy outdated. */
    const profileSignature = userData ? signatureOf(userData) : '';
    /** "Currently used" only while an applied copy still matches the data. */
    const isActive = !!applied && !!userData && sigMatches(applied.sig, profileSignature);

    /** Local mirror so the applied state survives tab switches even if the
     *  Firestore read comes from a stale cache. */
    const appliedStorageKey = (uid: string) => `cvResumeApplied:${uid}`;
    const readAppliedCache = (uid: string): AppliedState | null => {
        try {
            return JSON.parse(localStorage.getItem(appliedStorageKey(uid)) || 'null');
        } catch {
            return null;
        }
    };
    const writeAppliedCache = (uid: string, state: AppliedState) => {
        appliedStateByUid.set(uid, state);
        try {
            localStorage.setItem(appliedStorageKey(uid), JSON.stringify(state));
        } catch {
            // Storage unavailable; session memory still holds the state.
        }
    };
    const clearAppliedCache = (uid: string) => {
        appliedStateByUid.delete(uid);
        try {
            localStorage.removeItem(appliedStorageKey(uid));
        } catch {
            // Ignore; session memory was already cleared.
        }
    };

    useEffect(() => {
        log('mount: subscribing to auth');
        const unsubscribe = auth.onAuthStateChanged((user) => {
            log('auth: state', { uid: user?.uid || null });
            if (user) {
                fetchUserData();
            } else {
                setLoading(false);
            }
        });
        return () => {
            log('unmount');
            unsubscribe();
        };
    }, []);

    /** Fires after every relevant state change - the single place to see why
     *  the control renders "Currently used" vs "Use In Your Profile". */
    useEffect(() => {
        if (loading) return;
        log('render', {
            hasUserData: !!userData,
            profileIncomplete: !userData?.firstName || !userData?.skillItems?.length,
            applied: applied ? { url: applied.url, prev: applied.prev, sig: sigTag(applied.sig) } : null,
            profileSig: sigTag(profileSignature),
            rawSigMatch: !!applied && profileSignature === applied.sig,
            sigDiff: applied && profileSignature !== applied.sig
                ? sigDiff(applied.sig, profileSignature)
                : undefined,
            isActive,
            applyingResume,
            resumeUrl: userData?.resumeUrl || '',
        });
    }, [loading, userData, applied, profileSignature, isActive, applyingResume]);

    const fetchUserData = async () => {
        const user = auth.currentUser;
        if (!user) {
            log('fetch: aborted, no current user');
            setLoading(false);
            return;
        }
        const seq = ++fetchSeq.current;

        // 1. Session memory / local mirror - instant restore on tab switches.
        const session = appliedStateByUid.get(user.uid) || null;
        const local = readAppliedCache(user.uid);
        const cached = session || local;
        log('fetch:start', { seq, uid: user.uid, sessionCache: session, localCache: local });
        if (cached) setApplied(cached);

        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (seq !== fetchSeq.current) {
                log('fetch:dropped as stale', { seq, current: fetchSeq.current });
                return;
            }
            if (!userDoc.exists()) {
                log('fetch: user doc missing');
                popup.error('Profile not found. Please update your profile first.');
                return;
            }

            const data = userDoc.data();
            const mapped = buildUserData(data, user.email || '');
            const mappedSig = signatureOf(mapped);
            const resumeUrl = data.resumeUrl || '';

            const genUrl = data.generatedResumeUrl || cached?.url || '';
            const genPath = data.generatedResumePath || cached?.path || '';
            const genPrev = data.generatedResumePreviousUrl ?? cached?.prev ?? '';
            const markerSig = data.generatedResumeSignature || cached?.sig || '';
            const generatedCurrent = isGeneratedResumeUrl(resumeUrl, user.uid);
            /** Only a resume uploaded outside this page counts as replaced;
             *  an empty resumeUrl must not wipe the applied state. */
            const replacedOutside = !!resumeUrl && !generatedCurrent && resumeUrl !== genUrl;
            const isApplied = !replacedOutside && (generatedCurrent || !!genUrl);

            log('fetch:doc', {
                seq,
                resumeUrl,
                markers: {
                    url: data.generatedResumeUrl || null,
                    path: data.generatedResumePath || null,
                    sig: sigTag(data.generatedResumeSignature),
                    prev: data.generatedResumePreviousUrl ?? null,
                },
                markerSigSource: data.generatedResumeSignature
                    ? 'firestore'
                    : (cached?.sig ? 'local-cache' : 'none'),
                generatedCurrent,
                replacedOutside,
                isApplied,
                profileSig: sigTag(mappedSig),
                markerSig: sigTag(markerSig),
                sigMatch: sigMatches(markerSig, mappedSig),
                rawSigMatch: !!markerSig && mappedSig === markerSig,
                sigDiff: markerSig && markerSig !== mappedSig ? sigDiff(markerSig, mappedSig) : undefined,
            });

            if (isApplied) {
                // Markers written by an earlier build may lack the signature,
                // or hold bytes from before Firestore reshuffled nested map
                // key order. Refresh them to the current canonical form when
                // they still match; only keep a stale one when the profile
                // really changed (so the switch correctly comes back).
                const keepStale = !!markerSig && !sigMatches(markerSig, mappedSig);
                const state: AppliedState = {
                    url: resumeUrl || genUrl,
                    path: decodeStoragePath(resumeUrl) || genPath,
                    sig: keepStale ? markerSig : mappedSig,
                    prev: genPrev,
                };
                writeAppliedCache(user.uid, state);
                setApplied(state);
                log('fetch:restored applied state', {
                    seq,
                    state: { ...state, sig: sigTag(state.sig) },
                    repairedMissingSig: !markerSig,
                    refreshedStaleSig: !!markerSig && markerSig !== state.sig,
                    keepStale,
                });
                if (data.generatedResumeUrl !== state.url
                    || data.generatedResumePath !== state.path
                    || data.generatedResumeSignature !== state.sig) {
                    log('fetch:backfilling markers');
                    updateDoc(doc(db, 'users', user.uid), {
                        generatedResumeUrl: state.url,
                        generatedResumePath: state.path,
                        generatedResumeSignature: state.sig,
                        generatedResumePreviousUrl: state.prev,
                    }).catch((e) => log('fetch:marker backfill failed', String(e)));
                }
            } else {
                // Profile resume was replaced outside this page (or never
                // generated): the applied copy no longer backs it.
                log('fetch:clearing applied state', { seq, resumeUrl, genUrl: genUrl || null });
                clearAppliedCache(user.uid);
                setApplied(null);
                if (genUrl || markerSig) {
                    updateDoc(doc(db, 'users', user.uid), {
                        generatedResumeUrl: deleteField(),
                        generatedResumePath: deleteField(),
                        generatedResumeSignature: deleteField(),
                        generatedResumePreviousUrl: deleteField(),
                    }).catch((e) => log('fetch:marker clear failed', String(e)));
                }
            }

            setUserData({ ...mapped, resumeUrl });
        } catch (error) {
            console.error('Error fetching user data:', error);
            log('fetch:error', String(error));
            popup.error('Failed to load profile data');
        } finally {
            if (seq === fetchSeq.current) setLoading(false);
        }
    };

    /** Renders the preview DOM to a jsPDF document (shared by download + profile toggle). */
    const buildResumePdf = async (): Promise<jsPDF> => {
        const element = resumeRef.current!;
        const canvas = await html2canvas(element, {
            scale: 2.5, // Retina quality, less memory impact
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            allowTaint: true,
            scrollX: 0,
            scrollY: 0
        });

        const imgData = canvas.toDataURL('image/png', 0.8);
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'pt',
            format: 'letter'
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'MEDIUM');
        return pdf;
    };

    const handleViewPDF = async () => {
        if (!userData || !resumeRef.current) return;
        
        const toastId = popup.loading('Generating high-clarity resume...');
        try {
            const pdf = await buildResumePdf();
            pdf.save(`${userData.firstName}_${userData.lastName}_Resume.pdf`);
            popup.success('Resume generated successfully!', { id: toastId });
        } catch (error) {
            console.error('Error generating PDF snapshot:', error);
            popup.error('Failed to generate high-clarity resume', { id: toastId });
        }
    };

    /** Toggle on: generate the CV and save it as the Profile tab's resume in
     *  the background. Toggle off: restore whatever resume was there before
     *  (and delete the file this page uploaded). */
    const toggleUseInProfile = async () => {
        if (!userData || !resumeRef.current) return;
        const user = auth.currentUser;
        if (!user) {
            popup.error('Please sign in to use this resume in your profile.');
            return;
        }

        setApplyingResume(true);

        if (!isActive) {
            log('toggle:on:start', { appliedBefore: applied ? { ...applied, sig: sigTag(applied.sig) } : null, profileSig: sigTag(profileSignature) });
            const toastId = popup.loading('Setting this resume as your profile resume...');
            try {
                const priorPath = applied?.path || '';
                // First apply remembers whatever resume was there before; a
                // re-apply after a data change keeps the original previous URL.
                const prevResumeUrl = applied ? applied.prev : (userData.resumeUrl || '');
                const pdf = await buildResumePdf();
                const blob = pdf.output('blob');
                const filePath = `resumes/${user.uid}/${Date.now()}_Generated_Resume.pdf`;
                const storageRef = ref(storage, filePath);
                const snapshot = await uploadBytes(storageRef, blob, { contentType: 'application/pdf' });
                const publicUrl = await getDownloadURL(snapshot.ref);

                // Same document the Profile tab's resume upload writes to.
                // Marker fields may be rejected by security rules - fall back
                // to resumeUrl only; session memory + localStorage still hold
                // the applied state for this browser.
                try {
                    await updateDoc(doc(db, 'users', user.uid), {
                        resumeUrl: publicUrl,
                        updatedAt: new Date(),
                        generatedResumeUrl: publicUrl,
                        generatedResumePath: filePath,
                        generatedResumeSignature: profileSignature,
                        generatedResumePreviousUrl: prevResumeUrl,
                    });
                    log('toggle:on: markers written');
                } catch (markerError) {
                    console.warn('Marker write failed; writing resumeUrl only', markerError);
                    log('toggle:on: MARKER WRITE FAILED - only resumeUrl written', String(markerError));
                    await updateDoc(doc(db, 'users', user.uid), {
                        resumeUrl: publicUrl,
                        updatedAt: new Date(),
                    });
                }

                // Re-apply after a data change: drop the previous generated file.
                if (priorPath) {
                    try {
                        await deleteObject(ref(storage, priorPath));
                    } catch {
                        // Already gone; the new file is what matters.
                    }
                }

                const nextState: AppliedState = {
                    url: publicUrl,
                    path: filePath,
                    sig: profileSignature,
                    prev: prevResumeUrl,
                };
                writeAppliedCache(user.uid, nextState);
                setApplied(nextState);
                setUserData((prev: any) => ({ ...prev, resumeUrl: publicUrl }));
                log('toggle:on:done', { publicUrl, prev: prevResumeUrl, sig: sigTag(profileSignature) });
                popup.success('This resume is now used in your profile.', { id: toastId });
            } catch (error) {
                console.error('Error setting resume in profile:', error);
                log('toggle:on:ERROR', String(error));
                popup.error('Failed to set resume in your profile.', { id: toastId });
            } finally {
                setApplyingResume(false);
            }
        } else {
            log('toggle:off:start', { applied: applied ? { ...applied, sig: sigTag(applied.sig) } : null });
            const toastId = popup.loading('Restoring your previous profile resume...');
            try {
                const restored = applied?.prev || '';
                try {
                    await updateDoc(doc(db, 'users', user.uid), {
                        resumeUrl: restored,
                        updatedAt: new Date(),
                        generatedResumeUrl: deleteField(),
                        generatedResumePath: deleteField(),
                        generatedResumeSignature: deleteField(),
                        generatedResumePreviousUrl: deleteField(),
                    });
                } catch (markerError) {
                    console.warn('Marker clear failed; writing resumeUrl only', markerError);
                    log('toggle:off: MARKER CLEAR FAILED', String(markerError));
                    await updateDoc(doc(db, 'users', user.uid), {
                        resumeUrl: restored,
                        updatedAt: new Date(),
                    });
                }

                if (applied?.path) {
                    try {
                        await deleteObject(ref(storage, applied.path));
                    } catch {
                        // File may already be gone; restoring the profile URL is what matters.
                    }
                }

                clearAppliedCache(user.uid);
                setApplied(null);
                setUserData((prev: any) => ({ ...prev, resumeUrl: restored }));
                log('toggle:off:done', { restored });
                popup.success('Previous profile resume restored.', { id: toastId });
            } catch (error) {
                console.error('Error restoring profile resume:', error);
                log('toggle:off:ERROR', String(error));
                popup.error('Failed to restore your previous resume.', { id: toastId });
            } finally {
                setApplyingResume(false);
            }
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-muted flex flex-col">
                <UserHeader />
                <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="space-y-3">
                            <Skeleton className="h-8 w-64" />
                            <Skeleton className="h-4 w-96 max-w-full" />
                        </div>
                        <Skeleton className="h-12 w-48" />
                    </div>
                    <ContentCardSkeleton lines={5} />
                    <ContentCardSkeleton lines={4} />
                </main>
            </div>
        );
    }

    const isProfileIncomplete = !userData?.firstName || !userData?.skillItems?.length;

    return (
        <div className="min-h-screen bg-muted flex flex-col">
            <UserHeader />
            
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                    <div>
                        <h1 className="text-3xl font-extrabold text-ink tracking-tight">Personalized CV</h1>
                        <p className="text-ink/60 mt-2 text-sm md:text-base">Auto-generate a professional resume based on your latest profile details.</p>
                    </div>
                    
                    {userData && !isProfileIncomplete && (
                        <button
                            onClick={() => handleViewPDF()}
                            className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 border border-ink/70 bg-ink/70 text-surface text-sm font-semibold rounded-lg hover:border-ink/60 hover:bg-ink/60 hover:scale-[1.02] active:scale-95 transition-all"
                        >
                            <FileDown className="w-5 h-5" />
                            Download Resume
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Panel - Data Summary */}
                    <div className="lg:col-span-1 flex flex-col gap-6">
                        <div className="bg-surface rounded-2xl border border-border p-6">
                            <h3 className="text-lg font-bold text-ink mb-6">
                                Resume Data
                            </h3>
                            
                            <div className="space-y-6">
                                <div>
                                    <div className="flex items-center gap-3 mt-2">
                                        <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center text-ink/80 font-bold">
                                            {userData?.firstName?.[0]}{userData?.lastName?.[0]}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-ink">{userData?.firstName} {userData?.lastName}</p>
                                            <p className="text-xs text-ink/60">{userData?.email}</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-[10px] font-bold text-ink/60 uppercase tracking-wider mb-2">Section Status</p>
                                    <div className="space-y-3">
                                        <StatusItem label="Education" count={userData?.educationItems?.length} />
                                        <StatusItem label="Experience" count={userData?.experienceItems?.length} />
                                        <StatusItem label="Courses" count={userData?.courseItems?.length} />
                                        <StatusItem label="Projects" count={userData?.projectItems?.length} />
                                        <StatusItem label="Skills" count={userData?.skillItems?.length} />
                                        <StatusItem label="Certificates" count={userData?.certificateItems?.length} />
                                    </div>
                                </div>
                            </div>

                            {isProfileIncomplete && (
                                <div className="mt-8 p-4 bg-brand/10 border border-brand/20 rounded-2xl">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 text-brand shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-bold text-ink">Incomplete Profile</p>
                                            <p className="text-xs text-ink/70 mt-1 leading-relaxed">Add your personal details and skills in the Home tab to generate your CV.</p>
                                            <button 
                                                onClick={() => window.location.href = '/home?tab=profile'}
                                                className="text-xs font-bold text-ink underline mt-3 hover:text-brand"
                                            >
                                                Go to Profile
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Panel - Template Preview */}
                    <div className="lg:col-span-2">
                        <div className="bg-surface rounded-2xl border border-border overflow-hidden flex flex-col h-[700px]">
                            <div className="p-6 flex flex-wrap items-center justify-between gap-3 bg-surface">
                                <div>
                                    <h3 className="text-lg font-bold text-ink">Resume Preview</h3>
                                </div>
                                {userData && !isProfileIncomplete && (
                                    isActive ? (
                                        <span className="text-sm font-bold text-ink">
                                            Currently used in your profile
                                        </span>
                                    ) : (
                                        <div className="flex items-center gap-3 select-none">
                                            <span className="text-sm font-bold text-ink/80">Use In Your Profile</span>
                                            <button
                                                type="button"
                                                role="switch"
                                                aria-checked={false}
                                                aria-label="Use In Your Profile"
                                                onClick={toggleUseInProfile}
                                                disabled={applyingResume}
                                                className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50 cursor-pointer bg-border"
                                            >
                                                <span
                                                    className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all duration-200"
                                                />
                                            </button>
                                        </div>
                                    )
                                )}
                            </div>
                            
                            {/* Fixed padded viewport: the outer gutter stays
                                visible while the sheet scrolls in the inner area. */}
                            <div className="flex-1 px-6 py-5 bg-muted flex justify-center overflow-hidden">
                                <div className="w-full max-w-[960px] h-full overflow-y-auto">
                                    {/* Border lives on the wrapper so it is not
                                        captured into the generated PDF. */}
                                    <div className="w-full" style={{ border: '1px solid #f3f4f6', backgroundColor: '#ffffff' }}>
                                    <div ref={resumeRef} className="w-full min-h-[800px] flex flex-col gap-1 text-black" style={{ fontFamily: 'sans-serif', backgroundColor: '#ffffff', color: '#000000', padding: '40px' }}>
                                        <div className="text-center mb-4">
                                            <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'sans-serif', color: '#000000' }}>{userData?.firstName} {userData?.lastName}</h2>
                                            <p className="text-[11px] mt-1" style={{ color: '#374151' }}>{userData?.address || 'Salem, Tamilnadu , India'}</p>
                                            <div className="flex items-center justify-center gap-4 text-[11px] mt-2" style={{ color: '#374151' }}>
                                                <span>Phone: +91 {userData?.mobile}</span>
                                                <span>Email: {userData?.email}</span>
                                                {userData?.portfolio && <span>Portfolio</span>}
                                                {userData?.linkedin && <span>LinkedIn</span>}
                                                {userData?.github && <span>Github</span>}
                                            </div>
                                        </div>

                                    <div style={{ display: 'block', marginTop: '12px', marginBottom: '0px' }}>
                                        <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#000000', display: 'block' }}>Education</span>
                                        <div style={{ height: '0.5px', backgroundColor: '#000000', width: '100%', marginTop: '6px' }} />
                                    </div>
                                    <div className="space-y-1">
                                        {userData?.educationItems?.map((edu: any, i: number) => (
                                            <div key={i} style={{ fontSize: '12px', color: '#000000' }}>
                                                <div className="flex justify-between font-bold">
                                                    <span>{edu.collegeName}</span>
                                                    <span style={{ fontSize: '11px', fontWeight: 'normal' }}>{edu.graduatedYear || ''}</span>
                                                </div>
                                                <div className="flex justify-between" style={{ fontSize: '11px', color: '#374151' }}>
                                                    <span>{edu.course} {edu.specialization ? `in ${edu.specialization}` : ''} {edu.grade ? `(CGPA of ${edu.grade})` : ''}</span>
                                                    <div />
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'block', marginTop: '14px', marginBottom: '0px' }}>
                                        <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#000000', display: 'block' }}>Experience</span>
                                        <div style={{ height: '0.5px', backgroundColor: '#000000', width: '100%', marginTop: '6px' }} />
                                    </div>
                                    <div className="space-y-1">
                                        {userData?.experienceItems?.map((exp: any, i: number) => (
                                            <div key={i} style={{ fontSize: '12px', color: '#000000' }}>
                                                <div className="flex justify-between font-bold">
                                                    <span>{exp.company}</span>
                                                    <span style={{ fontSize: '11px', fontWeight: 'normal' }}>{exp.duration}</span>
                                                </div>
                                                <div className="flex justify-between" style={{ fontSize: '11px', color: '#374151' }}>
                                                    <span>{exp.role}</span>
                                                    <div />
                                                </div>
                                                {exp.description && (
                                                    <div className="mt-1" style={{ fontSize: '11px', color: '#1f2937' }}>
                                                        {exp.description}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'block', marginTop: '14px', marginBottom: '0px' }}>
                                        <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#000000', display: 'block' }}>Courses</span>
                                        <div style={{ height: '0.5px', backgroundColor: '#000000', width: '100%', marginTop: '6px' }} />
                                    </div>
                                    <div className="grid grid-cols-3 gap-y-1 mt-0.5">
                                        {userData?.courseItems?.map((course: string, i: number) => (
                                            <div key={i} className="flex items-start gap-1" style={{ fontSize: '12px', color: '#374151' }}>
                                                <span>{course}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'block', marginTop: '14px', marginBottom: '0px' }}>
                                        <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#000000', display: 'block' }}>Projects</span>
                                        <div style={{ height: '0.5px', backgroundColor: '#000000', width: '100%', marginTop: '6px' }} />
                                    </div>
                                    <div className="space-y-4">
                                        {userData?.projectItems?.map((proj: any, i: number) => (
                                            <div key={i} style={{ fontSize: '12px', color: '#000000' }}>
                                                <div className="flex justify-between font-bold">
                                                    <p>{proj.title} | <span className="font-normal" style={{ color: '#374151' }}>{proj.technologies || 'React'}</span> | {proj.link && <a href={proj.link} className="font-normal" style={{ color: '#000000', textDecoration: 'none' }}>(Link)</a>}</p>
                                                    <p style={{ fontSize: '11px', fontWeight: 'normal' }}>{proj.duration}</p>
                                                </div>
                                                <div className="mt-1 space-y-0.5">
                                                    {proj.description && proj.description.split('\n').filter(Boolean).map((line: string, idx: number) => (
                                                        <div key={idx} className="flex items-start gap-2" style={{ fontSize: '11px', color: '#374151' }}>
                                                            <span className="shrink-0">•</span>
                                                            <span>{line.trim()}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'block', marginTop: '14px', marginBottom: '0px' }}>
                                        <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#000000', display: 'block' }}>Skills</span>
                                        <div style={{ height: '0.5px', backgroundColor: '#000000', width: '100%', marginTop: '6px' }} />
                                    </div>
                                    <div className="grid grid-cols-3 gap-y-1 mt-0.5">
                                        {userData?.skillItems?.map((skill: string, i: number) => (
                                            <div key={i} className="flex items-start gap-1" style={{ fontSize: '12px', color: '#374151' }}>
                                                <span>{skill}</span>
                                            </div>
                                        ))}
                                    </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

function StatusItem({ label, count }: { label: string, count: number }) {
    const hasData = count > 0;
    return (
        <div className="flex items-center justify-between p-3 bg-muted rounded-xl border border-border">
            <span className="text-xs font-bold text-ink/80">{label}</span>
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-ink/60">{count || 0} items</span>
                {hasData ? (
                    <CheckCircle2 className="w-4 h-4 text-brand" />
                ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-border" />
                )}
            </div>
        </div>
    );
}
