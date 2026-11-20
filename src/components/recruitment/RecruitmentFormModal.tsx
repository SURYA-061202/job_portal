'use client';

import { useState, useEffect } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { auth, db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc, deleteField } from 'firebase/firestore';
import type { RecruitmentRequest } from '@/types';
import { getPostRounds, MAX_TOTAL_ROUNDS } from '@/lib/interviewRounds';
import { checkPostQuota } from '@/lib/subscriptions';
import { draftLifecycleFields, newPostLifecycleFields, resumePost } from '@/lib/postActions';
import { DEFAULT_VALIDITY_DAYS, VALIDITY_OPTIONS, addDays, describeExpiry, endOfDay, formatDate, formatDateTime, getPostLifecycle, toDate } from '@/lib/postLifecycle';
import { usePopup } from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

/** Hints only — a round's name is free text and may be left blank. */
const ROUND_NAME_PLACEHOLDERS = ['Screening Call', 'Technical Round', 'Managerial Round', 'HR Round'];

interface RecruitmentFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: RecruitmentRequest | null;
    /** The form was opened from another post: it is a new post (no id), pre-filled. */
    duplicate?: boolean;
    /** False when the plan has no free post slot: the post can only be saved as a draft or scheduled. */
    canPublish?: boolean;
    onViewPlans?: () => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
/** <input type="date"> value, local time. */
const toDateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** <input type="datetime-local"> value, local time. */
const toDateTimeInput = (d: Date) => `${toDateInput(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default function RecruitmentFormModal({ isOpen, onClose, initialData, duplicate = false, canPublish = true, onViewPlans }: RecruitmentFormModalProps) {
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [userProfile, setUserProfile] = useState<{ firstName?: string; lastName?: string; companyName?: string } | null>(null);
    const { showSuccess, showError } = usePopup();
    const skin = useSkin();
    // How long the listing runs. 0 only for an older post with no expiry that the recruiter leaves as it is.
    const [validity, setValidity] = useState<number>(DEFAULT_VALIDITY_DAYS);
    // Posts made before lifecycles existed carry no status or expiry; they may opt in here.
    const isLegacy = !!initialData?.id && !initialData.status && !initialData.expiresAt;
    // A draft is edited like a new post: it still has its validity, schedule and publish choice to make.
    const isDraftEdit = initialData?.status === 'draft';
    const creating = !initialData?.id || isDraftEdit;
    const showValidity = creating || isLegacy;
    // Listing runs for `validity` days, or until an exact closing date.
    const [validityMode, setValidityMode] = useState<'days' | 'date'>('days');
    const [closingDate, setClosingDate] = useState('');
    // Publish now, or hold as a draft that goes live at a chosen time.
    const [publishLater, setPublishLater] = useState(false);
    const [publishAtText, setPublishAtText] = useState('');
    const [applicationCap, setApplicationCap] = useState('');
    const [formData, setFormData] = useState({
        jobTitle: '',
        urgencyLevel: 'Moderate' as 'Immediate' | 'Moderate' | 'Flexible',
        department: '',
        candidateType: 'Permanent' as 'Permanent' | 'Contract' | 'Internship' | 'Part Time',
        positionLevel: 'Mid' as 'Entry' | 'Junior' | 'Mid' | 'Senior' | 'Manager',
        yearsExperience: '',
        modeOfWork: 'Office' as 'Office' | 'Hybrid' | 'Remote',
        location: '',
        candidatesCount: '',
        qualification: '',
        skills: '',
        description: '',
        budgetPay: '',
        salaryBreakup: '',
        totalRounds: 1,
        roundNames: [''] as string[]
    });

    useEffect(() => {
        const fetchUserProfile = async () => {
            const user = auth.currentUser;
            if (user) {
                try {
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        setUserProfile({
                            firstName: data.firstName,
                            lastName: data.lastName,
                            companyName: data.companyName
                        });
                    }
                } catch (error) {
                    console.error('Error fetching user profile for job post:', error);
                }
            }
        };

        if (isOpen && !userProfile) {
            fetchUserProfile();
        }

        if (initialData) {
            const rounds = getPostRounds(initialData);
            setFormData({
                jobTitle: initialData.jobTitle,
                urgencyLevel: initialData.urgencyLevel,
                department: initialData.department,
                candidateType: initialData.candidateType,
                positionLevel: initialData.positionLevel,
                yearsExperience: initialData.yearsExperience,
                modeOfWork: initialData.modeOfWork,
                location: initialData.location,
                candidatesCount: initialData.candidatesCount ? String(initialData.candidatesCount) : '',
                qualification: initialData.qualification,
                skills: initialData.skills,
                description: initialData.description || '',
                budgetPay: initialData.budgetPay,
                salaryBreakup: initialData.salaryBreakup,
                totalRounds: rounds.length,
                roundNames: rounds.map(r => r.name),
            });
            const legacy = !!initialData.id && !initialData.status && !initialData.expiresAt;
            setValidity(legacy ? 0 : (initialData.validityDays ?? DEFAULT_VALIDITY_DAYS));
            // A draft keeps a chosen closing date in expiresAt; a copy never carries one over.
            const planned = initialData.id && initialData.status === 'draft' ? toDate(initialData.expiresAt) : null;
            setValidityMode(planned ? 'date' : 'days');
            setClosingDate(planned ? toDateInput(planned) : '');
            const goLive = initialData.id && initialData.status === 'draft' ? toDate(initialData.publishAt) : null;
            setPublishLater(!!goLive);
            setPublishAtText(goLive ? toDateTimeInput(goLive) : '');
            setApplicationCap(initialData.applicationCap ? String(initialData.applicationCap) : '');
        } else if (isOpen) {
            setValidity(DEFAULT_VALIDITY_DAYS);
            setValidityMode('days');
            setClosingDate('');
            setPublishLater(false);
            setPublishAtText('');
            setApplicationCap('');
            // Reset to default values when opening modal without initialData
            setFormData({
                jobTitle: '',
                urgencyLevel: 'Moderate',
                department: '',
                candidateType: 'Permanent',
                positionLevel: 'Mid',
                yearsExperience: '',
                modeOfWork: 'Office',
                location: '',
                candidatesCount: '',
                qualification: '',
                skills: '',
                description: '',
                budgetPay: '',
                salaryBreakup: '',
                totalRounds: 1,
                roundNames: [''],
            });
            setFile(null); // Also reset the file
        }
    }, [initialData, isOpen, userProfile]);

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); void submit('publish'); };

    /** `publish` makes the post live (or scheduled, when a go-live time is set); `draft` saves it unpublished. */
    const submit = async (mode: 'publish' | 'draft') => {
        const asDraft = mode === 'draft';
        if (asDraft && !formData.jobTitle.trim()) { showError('Give the draft a job title first.'); return; }

        // Application cap: blank = no limit.
        const cap = applicationCap.trim() === '' ? null : Number(applicationCap);
        if (cap !== null && (!Number.isInteger(cap) || cap < 1)) { showError('The application limit must be a whole number of at least 1.'); return; }

        // Go-live time and closing date.
        const goLive = creating && !asDraft && publishLater ? new Date(publishAtText) : null;
        if (creating && !asDraft && publishLater && (!publishAtText || Number.isNaN(goLive!.getTime()) || goLive!.getTime() <= Date.now())) {
            showError('Pick a go-live time in the future.');
            return;
        }
        const scheduled = goLive !== null;
        // A draft may also keep a go-live time; it then goes live by itself like a scheduled post.
        const draftGoLive = asDraft && publishLater && publishAtText ? new Date(publishAtText) : null;
        const closesOn = showValidity && validityMode === 'date' ? endOfDay(closingDate) : null;
        if (showValidity && validityMode === 'date') {
            const startsAt = goLive ?? draftGoLive ?? new Date();
            if (!closesOn || closesOn.getTime() <= startsAt.getTime()) { showError('Pick a closing date after the post goes live.'); return; }
        }
        const goesLiveNow = creating && !asDraft && !scheduled;
        setLoading(true);

        try {
            // A post going live now must fit the plan. Drafts and scheduled posts hold no slot until they go live.
            if (goesLiveNow) {
                const uid = auth.currentUser?.uid;
                if (uid) {
                    const quota = await checkPostQuota(uid);
                    if (!quota.allowed) {
                        showError(`Post limit reached (${quota.used}/${quota.limit} on the ${quota.subscription.planName} plan). Save it as a draft, or subscribe to a higher plan.`);
                        return;
                    }
                }
            }

            let jdUrl = initialData?.jdUrl || '';
            if (file) {
                console.log('Uploading JD to Firebase Storage...');
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}-jd.${fileExt}`;
                const storageRef = ref(storage, `jd/${fileName}`);

                const snapshot = await uploadBytes(storageRef, file, { contentType: file.type });
                jdUrl = await getDownloadURL(snapshot.ref);
                console.log('JD uploaded successfully, public URL:', jdUrl);
            }

            const payload = {
                jobTitle: formData.jobTitle,
                urgencyLevel: formData.urgencyLevel,
                department: formData.department,
                candidateType: formData.candidateType,
                positionLevel: formData.positionLevel,
                yearsExperience: formData.yearsExperience,
                modeOfWork: formData.modeOfWork,
                location: formData.location,
                candidatesCount: Number(formData.candidatesCount) || 0,
                qualification: formData.qualification,
                skills: formData.skills,
                description: formData.description,
                budgetPay: formData.budgetPay,
                salaryBreakup: formData.salaryBreakup,
                totalRounds: formData.totalRounds,
                rounds: formData.roundNames
                    .slice(0, formData.totalRounds)
                    .map((name, i) => ({ roundNumber: i + 1, name: name.trim() })),
                jdUrl: jdUrl,
                ...(cap !== null ? { applicationCap: cap } : initialData?.id ? { applicationCap: deleteField() } : {}),
                updatedAt: serverTimestamp()
            };

            const days = validity || DEFAULT_VALIDITY_DAYS;
            const liveFields = newPostLifecycleFields(closesOn ?? days);
            const lifecycle = creating
                ? (asDraft || scheduled
                    ? draftLifecycleFields({ validityDays: days, closesOn, publishAt: goLive ?? draftGoLive }, !!initialData?.id)
                    : { ...liveFields, ...(isDraftEdit ? { publishAt: deleteField() } : {}) })
                // Only an older post with no lifecycle can start one here; everyone else
                // changes status and expiry through the post's status actions.
                : (isLegacy && (validity > 0 || closesOn) ? liveFields : {});

            if (initialData?.id) {
                // Update
                console.log('Updating recruitment request...');
                const updatePayload = {
                    ...payload,
                    ...lifecycle,
                    // Optionally update recruiter/company if desired, but usually we stick to the original creator
                    // recruiterName: `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || initialData.recruiterName,
                    // companyName: userProfile?.companyName || initialData.companyName,
                };
                await updateDoc(doc(db, 'recruits', initialData.id), updatePayload);
                // A post that paused itself at its application cap wakes up once the cap is raised or removed.
                if (initialData.status === 'paused' && initialData.pausedReason === 'cap' && (cap === null || cap > (initialData.applicantCount ?? 0))) {
                    await resumePost({ ...initialData, applicationCap: cap ?? undefined });
                }
                showSuccess(
                    isDraftEdit && !asDraft ? (scheduled ? `Post scheduled for ${formatDateTime(goLive)}.` : 'Post is live!')
                        : asDraft ? 'Draft saved.'
                            : 'Recruitment request updated successfully!',
                );
            } else {
                // Create
                console.log('Saving recruitment request to Firestore...');
                const user = auth.currentUser;
                await addDoc(collection(db, 'recruits'), {
                    ...payload,
                    ...lifecycle,
                    recruiterId: user?.uid || '',
                    // Kept on the post so applicant notifications can reach the owner without reading user profiles.
                    recruiterEmail: (user?.email || '').trim().toLowerCase(),
                    recruiterName: `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim(),
                    companyName: userProfile?.companyName || '',
                    createdAt: serverTimestamp()
                });
                showSuccess(asDraft ? 'Draft saved.' : scheduled ? `Post scheduled for ${formatDateTime(goLive)}.` : 'Recruitment request raised successfully!');
            }

            onClose();
        } catch (error: any) {
            console.error('Error raising recruitment request:', error);
            const errorMessage = error.message || String(error);
            showError(`Submission failed: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Growing/shrinking the round count keeps the names already typed for the
    // rounds that survive, so editing the count isn't destructive.
    const handleTotalRoundsChange = (value: string) => {
        const parsed = value === '' ? 0 : Math.max(0, Math.min(MAX_TOTAL_ROUNDS, parseInt(value, 10) || 0));
        setFormData(prev => ({
            ...prev,
            totalRounds: parsed,
            roundNames: Array.from({ length: parsed }, (_, i) => prev.roundNames[i] || ''),
        }));
    };

    const handleRoundNameChange = (index: number, value: string) => {
        setFormData(prev => ({
            ...prev,
            roundNames: prev.roundNames.map((n, i) => (i === index ? value : n)),
        }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 pb-4 pt-24 bg-black/30 backdrop-blur-sm overflow-y-auto">
            <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} w-full max-w-4xl max-h-[calc(100vh-7rem)] flex flex-col`}>
                <div className={`px-6 py-4 border-b ${skin.edge} ${skin.surface} flex justify-between items-center flex-shrink-0 rounded-t-2xl`}>
                    <h2 className={`${skin.heading} font-outfit`}>{duplicate ? 'Duplicate Post' : isDraftEdit ? 'Edit Draft' : initialData?.id ? 'Update Post' : 'Add Post'}</h2>
                    <button onClick={onClose} className={`p-2 text-ink/60 hover:bg-ink/5 hover:text-ink ${skin.radius} cursor-pointer transition-colors ${FOCUS}`}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form id="recruitment-form" onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Job Title */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">Job Title *</label>
                            <input
                                required
                                type="text"
                                name="jobTitle"
                                value={formData.jobTitle}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                placeholder="e.g. Senior Frontend Developer"
                            />
                        </div>

                        {/* Urgency Level */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">Urgency Level</label>
                            <select
                                name="urgencyLevel"
                                value={formData.urgencyLevel}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                            >
                                <option value="Immediate">Immediate</option>
                                <option value="Moderate">Moderate</option>
                                <option value="Flexible">Flexible</option>
                            </select>
                        </div>

                        {/* Department */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">Department</label>
                            <input
                                type="text"
                                name="department"
                                value={formData.department}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                placeholder="e.g. Engineering"
                            />
                        </div>

                        {/* Type of candidates */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">Type of Candidates *</label>
                            <select
                                required
                                name="candidateType"
                                value={formData.candidateType}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                            >
                                <option value="Permanent">Permanent</option>
                                <option value="Contract">Contract</option>
                                <option value="Internship">Internship</option>
                                <option value="Part Time">Part Time</option>
                            </select>
                        </div>

                        {/* Position Level */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">Position Level</label>
                            <select
                                name="positionLevel"
                                value={formData.positionLevel}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                            >
                                <option value="Entry">Entry</option>
                                <option value="Junior">Junior</option>
                                <option value="Mid">Mid</option>
                                <option value="Senior">Senior</option>
                                <option value="Manager">Manager</option>
                            </select>
                        </div>

                        {/* Years of Experience */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">Years of Experience REQUIRED</label>
                            <input
                                type="text"
                                name="yearsExperience"
                                value={formData.yearsExperience}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                placeholder="e.g. 5+ years"
                            />
                        </div>

                        {/* Mode of Work */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">Mode of Work</label>
                            <select
                                name="modeOfWork"
                                value={formData.modeOfWork}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                            >
                                <option value="Office">Office</option>
                                <option value="Hybrid">Hybrid</option>
                                <option value="Remote">Remote</option>
                            </select>
                        </div>

                        {/* Location */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">Location</label>
                            <input
                                type="text"
                                name="location"
                                value={formData.location}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                placeholder="e.g. Bangalore, Karnataka"
                            />
                        </div>

                        {/* No of candidates */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">No. of Candidates Required</label>
                            <input
                                type="number"
                                min="1"
                                name="candidatesCount"
                                value={formData.candidatesCount}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                            />
                        </div>

                        {/* Qualification */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">Qualification Required</label>
                            <input
                                type="text"
                                name="qualification"
                                value={formData.qualification}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                placeholder="e.g. B.Tech / MCA"
                            />
                        </div>

                        {/* Key Skills */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">Key Skills Required</label>
                            <input
                                type="text"
                                name="skills"
                                value={formData.skills}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                placeholder="e.g. React, Node.js, AWS"
                            />
                        </div>
                    </div>

                    {/* Listing: how long it runs, when it goes live, and how many applications it takes */}
                    {creating && !canPublish && (
                        <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            Your plan's post limit is reached, so this post can't go live now. Save it as a draft, or schedule it for later - it goes live then only if a slot is free.
                            {onViewPlans && <> <button type="button" onClick={onViewPlans} className="font-bold underline underline-offset-2">See plans</button></>}
                        </div>
                    )}
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                        <div>
                            <label htmlFor="post-validity" className="block text-sm font-medium text-ink/80 mb-1">
                                {showValidity ? 'Listing Validity' : 'Listing status'}
                            </label>
                            {!showValidity ? (
                                <p className="text-sm text-ink/70">
                                    {getPostLifecycle(initialData ?? {}).label} · {describeExpiry(initialData ?? {})}
                                    {initialData && getPostLifecycle(initialData).expiresAt && <> ({formatDate(initialData.expiresAt)})</>}
                                    <span className="block text-xs text-ink/50">Extend, pause, close or repost it from the post's status actions in the Posts list.</span>
                                </p>
                            ) : (
                                <>
                                    <select
                                        id="post-validity"
                                        value={validityMode === 'date' ? 'date' : validity}
                                        onChange={(e) => {
                                            if (e.target.value === 'date') {
                                                setValidityMode('date');
                                                if (!closingDate) setClosingDate(toDateInput(addDays(Date.now(), DEFAULT_VALIDITY_DAYS)));
                                            } else {
                                                setValidityMode('days');
                                                setValidity(Number(e.target.value));
                                            }
                                        }}
                                        className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                    >
                                        {isLegacy && <option value={0}>No expiry (keep as is)</option>}
                                        {VALIDITY_OPTIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
                                        <option value="date">Pick a closing date…</option>
                                    </select>
                                    {validityMode === 'date' && (
                                        <input
                                            type="date"
                                            aria-label="Closing date"
                                            min={toDateInput(addDays(Date.now(), 1))}
                                            value={closingDate}
                                            onChange={(e) => setClosingDate(e.target.value)}
                                            className={`mt-2 w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                        />
                                    )}
                                    <p className="mt-1 text-xs text-ink/50">
                                        {validityMode === 'date'
                                            ? 'Accepts applications until the end of that day.'
                                            : validity > 0
                                                ? `Accepts applications for ${validity} days after it goes live. You can pause, extend, close or repost it later.`
                                                : 'This post never expires until you give it a validity.'}
                                    </p>
                                </>
                            )}
                        </div>

                        {creating && (
                            <div>
                                <label htmlFor="post-publish" className="block text-sm font-medium text-ink/80 mb-1">Publish</label>
                                <select
                                    id="post-publish"
                                    value={publishLater ? 'later' : 'now'}
                                    onChange={(e) => {
                                        const later = e.target.value === 'later';
                                        setPublishLater(later);
                                        if (later && !publishAtText) {
                                            const d = addDays(Date.now(), 1);
                                            d.setHours(9, 0, 0, 0);
                                            setPublishAtText(toDateTimeInput(d));
                                        }
                                    }}
                                    className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                >
                                    <option value="now">Right away</option>
                                    <option value="later">Schedule for later</option>
                                </select>
                                {publishLater && (
                                    <input
                                        type="datetime-local"
                                        aria-label="Go-live time"
                                        min={toDateTimeInput(new Date())}
                                        value={publishAtText}
                                        onChange={(e) => setPublishAtText(e.target.value)}
                                        className={`mt-2 w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                    />
                                )}
                                <p className="mt-1 text-xs text-ink/50">
                                    {publishLater ? 'Held as a draft and published automatically within 15 minutes of this time.' : 'Or use Save as Draft to keep it hidden for now.'}
                                </p>
                            </div>
                        )}

                        <div>
                            <label htmlFor="post-cap" className="block text-sm font-medium text-ink/80 mb-1">Application Limit</label>
                            <input
                                id="post-cap"
                                type="number"
                                min="1"
                                step="1"
                                value={applicationCap}
                                onChange={(e) => setApplicationCap(e.target.value)}
                                placeholder="No limit"
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                            />
                            <p className="mt-1 text-xs text-ink/50">
                                The post pauses itself after this many applications.
                                {initialData?.id && <> Currently {initialData.applicantCount ?? 0}.</>}
                            </p>
                        </div>
                    </div>

                    {/* Interview Rounds — these become the pipeline stages for this post */}
                    <div className="space-y-4">
                        <div>
                            <h3 className="text-sm font-bold text-ink mb-1">Interview Rounds</h3>
                            <input
                                type="number"
                                min="0"
                                max={MAX_TOTAL_ROUNDS}
                                name="totalRounds"
                                value={formData.totalRounds}
                                onChange={(e) => handleTotalRoundsChange(e.target.value)}
                                className={`w-full sm:w-40 px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                            />
                        </div>

                        {formData.totalRounds > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Array.from({ length: formData.totalRounds }, (_, i) => (
                                    <div key={i}>
                                        <label className="block text-sm font-medium text-ink/80 mb-1">Round {i + 1} Name</label>
                                        <input
                                            type="text"
                                            value={formData.roundNames[i] || ''}
                                            onChange={(e) => handleRoundNameChange(i, e.target.value)}
                                            className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                            placeholder={ROUND_NAME_PLACEHOLDERS[i] || `e.g. Round ${i + 1}`}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-ink/60 italic">No interview rounds — the pipeline goes straight from Shortlisted to Selected.</p>
                        )}
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-ink/80 mb-1">Detailed Job Description *</label>
                        <textarea
                            required
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={6}
                            className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal font-mono ${FOCUS}`}
                            placeholder="Paste the full job description here (Roles, Responsibilities, Requirements)..."
                        />
                    </div>

                    {/* Attachment of JD */}
                    <div>
                        <label className="block text-sm font-medium text-ink/80 mb-1">Attachment of JD</label>
                        <div className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed ${skin.edge} ${skin.radius}`}>
                            <div className="space-y-1 text-center">
                                <Upload className="mx-auto h-12 w-12 text-ink/40" />
                                <div className="flex text-sm text-ink/70">
                                    <label className={`relative cursor-pointer ${skin.surface} ${skin.radius} font-medium text-brand hover:text-brand focus-within:outline-none focus-within:ring-2 focus-within:ring-brand`}>
                                        <span>Upload a file</span>
                                        <input
                                            type="file"
                                            className="sr-only"
                                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                                            accept=".pdf,.doc,.docx"
                                        />
                                    </label>
                                    <p className="pl-1">or drag and drop</p>
                                </div>
                                <p className="text-xs text-ink/60">PDF, DOC, DOCX up to 10MB</p>
                                {file && <p className="text-sm text-brand font-medium">{file.name}</p>}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Budget Pay out */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">Budget Pay out (Min – Max)</label>
                            <input
                                type="text"
                                name="budgetPay"
                                value={formData.budgetPay}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                placeholder="e.g. 10L - 15L"
                            />
                        </div>

                        {/* Salary Breakup */}
                        <div>
                            <label className="block text-sm font-medium text-ink/80 mb-1">Salary Breakup Guidelines</label>
                            <input
                                type="text"
                                name="salaryBreakup"
                                value={formData.salaryBreakup}
                                onChange={handleChange}
                                className={`w-full px-3 py-2 rounded-lg ${skin.field} !font-normal ${FOCUS}`}
                                placeholder="e.g. Fixed + Performance Bonus"
                            />
                        </div>

                    </div>
                </form>

                {/* Button Container - Static at Bottom */}
                <div className={`${skin.surface} px-6 py-4 border-t ${skin.edge} flex justify-end space-x-3 flex-shrink-0 rounded-b-2xl`}>
                    <button
                        type="button"
                        onClick={onClose}
                        className={`cursor-pointer rounded-lg ${skin.secondary} ${FOCUS}`}
                    >
                        Cancel
                    </button>
                    {creating && (
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => void submit('draft')}
                            className={`cursor-pointer rounded-lg ${skin.secondary} ${FOCUS} disabled:opacity-50`}
                        >
                            Save as Draft
                        </button>
                    )}
                    <button
                        type="submit"
                        form="recruitment-form"
                        disabled={loading || (creating && !publishLater && !canPublish)}
                        title={creating && !publishLater && !canPublish ? 'Post limit reached: save as a draft or schedule it' : undefined}
                        className={`inline-flex items-center gap-2 cursor-pointer rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}
                    >
                        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {!creating ? 'Update Post' : publishLater ? 'Schedule Post' : isDraftEdit ? 'Publish Post' : 'Add Post'}
                    </button>
                </div>
            </div>
        </div>
    );
}
