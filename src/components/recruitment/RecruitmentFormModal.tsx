'use client';

import { useState, useEffect } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { auth, db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import type { RecruitmentRequest } from '@/types';
import { getPostRounds, MAX_TOTAL_ROUNDS } from '@/lib/interviewRounds';
import { usePopup } from '@/components/ui/Popup';
import { useSkin, FOCUS } from '@/styles/skin';

/** Hints only — a round's name is free text and may be left blank. */
const ROUND_NAME_PLACEHOLDERS = ['Screening Call', 'Technical Round', 'Managerial Round', 'HR Round'];

interface RecruitmentFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: RecruitmentRequest | null;
}

export default function RecruitmentFormModal({ isOpen, onClose, initialData }: RecruitmentFormModalProps) {
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [userProfile, setUserProfile] = useState<{ firstName?: string; lastName?: string; companyName?: string } | null>(null);
    const { showSuccess, showError } = usePopup();
    const skin = useSkin();
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
        } else if (isOpen) {
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
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
                updatedAt: serverTimestamp()
            };

            if (initialData?.id) {
                // Update
                console.log('Updating recruitment request...');
                const updatePayload = {
                    ...payload,
                    // Optionally update recruiter/company if desired, but usually we stick to the original creator
                    // recruiterName: `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim() || initialData.recruiterName,
                    // companyName: userProfile?.companyName || initialData.companyName,
                };
                await updateDoc(doc(db, 'recruits', initialData.id), updatePayload);
                showSuccess('Recruitment request updated successfully!');
            } else {
                // Create
                console.log('Saving recruitment request to Firestore...');
                const user = auth.currentUser;
                await addDoc(collection(db, 'recruits'), {
                    ...payload,
                    recruiterId: user?.uid || '',
                    recruiterName: `${userProfile?.firstName || ''} ${userProfile?.lastName || ''}`.trim(),
                    companyName: userProfile?.companyName || '',
                    createdAt: serverTimestamp()
                });
                showSuccess('Recruitment request raised successfully!');
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm overflow-y-auto">
            <div className={`border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow} w-full max-w-4xl max-h-[90vh] flex flex-col`}>
                <div className={`px-6 py-4 border-b ${skin.edge} ${skin.surface} flex justify-between items-center flex-shrink-0 rounded-t-2xl`}>
                    <h2 className={`${skin.heading} font-outfit`}>{initialData?.id ? 'Edit Recruitment Request' : 'Add Recruitment Request'}</h2>
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
                                placeholder="e.g. React, Node.js, AWS"
                            />
                        </div>
                    </div>

                    {/* Interview Rounds — these become the pipeline stages for this post */}
                    <div className={`border ${skin.edge} ${skin.canvas} ${skin.radius} p-4 space-y-4`}>
                        <div>
                            <h3 className="text-sm font-bold text-ink mb-1">Interview Rounds</h3>
                            <input
                                type="number"
                                min="0"
                                max={MAX_TOTAL_ROUNDS}
                                name="totalRounds"
                                value={formData.totalRounds}
                                onChange={(e) => handleTotalRoundsChange(e.target.value)}
                                className={`w-full sm:w-40 px-3 py-2 ${skin.field} ${FOCUS}`}
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
                                            className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                        <label className="block text-sm font-medium text-ink/80 mb-1">Detailed Job Description</label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={6}
                            className={`w-full px-3 py-2 ${skin.field} font-mono ${FOCUS}`}
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                                className={`w-full px-3 py-2 ${skin.field} ${FOCUS}`}
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
                        className={`cursor-pointer ${skin.secondary} ${FOCUS}`}
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="recruitment-form"
                        disabled={loading}
                        className={`inline-flex items-center gap-2 cursor-pointer ${skin.cta} ${FOCUS} disabled:opacity-50`}
                    >
                        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {initialData?.id ? 'Update Request' : 'Add Post'}
                    </button>
                </div>
            </div>
        </div>
    );
}
