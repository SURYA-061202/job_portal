'use client';

import { useState, useEffect } from 'react';
import { X, Upload, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, addDoc, serverTimestamp, doc, updateDoc } from 'firebase/firestore';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import type { RecruitmentRequest } from '@/types';

interface RecruitmentFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialData?: RecruitmentRequest | null;
}

export default function RecruitmentFormModal({ isOpen, onClose, initialData }: RecruitmentFormModalProps) {
    const [loading, setLoading] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [formData, setFormData] = useState({
        jobTitle: '',
        urgencyLevel: 'Moderate' as 'Immediate' | 'Moderate' | 'Flexible',
        department: '',
        candidateType: 'Permanent' as 'Permanent' | 'Contract' | 'Internship' | 'Part Time',
        positionLevel: 'Mid' as 'Entry' | 'Junior' | 'Mid' | 'Senior' | 'Manager',
        yearsExperience: '',
        modeOfWork: 'Office' as 'Office' | 'Hybrid' | 'Remote',
        location: '',
        candidatesCount: 1,
        qualification: '',
        skills: '',
        description: '',
        budgetPay: '',
        salaryBreakup: '',
        requestedBy: 'Dinesh' as 'Dinesh' | 'Naresh'
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                jobTitle: initialData.jobTitle,
                urgencyLevel: initialData.urgencyLevel,
                department: initialData.department,
                candidateType: initialData.candidateType,
                positionLevel: initialData.positionLevel,
                yearsExperience: initialData.yearsExperience,
                modeOfWork: initialData.modeOfWork,
                location: initialData.location,
                candidatesCount: initialData.candidatesCount,
                qualification: initialData.qualification,
                skills: initialData.skills,
                description: initialData.description || '',
                budgetPay: initialData.budgetPay,
                salaryBreakup: initialData.salaryBreakup,
                requestedBy: initialData.requestedBy,
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
                candidatesCount: 1,
                qualification: '',
                skills: '',
                description: '',
                budgetPay: '',
                salaryBreakup: '',
                requestedBy: 'Dinesh'
            });
            setFile(null); // Also reset the file
        }
    }, [initialData, isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            let jdUrl = initialData?.jdUrl || '';
            if (file) {
                console.log('Uploading JD to Supabase storage (jd bucket)...');
                const fileExt = file.name.split('.').pop();
                const fileName = `${Date.now()}-jd.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('jd')
                    .upload(fileName, file, {
                        cacheControl: '3600',
                        upsert: false
                    });

                if (uploadError) {
                    console.error('Supabase upload error:', uploadError);
                    let msg = uploadError.message;
                    if (msg.includes('DatabaseTimeout')) {
                        msg = 'Storage database connection timed out. Please try again or check Supabase status.';
                    } else if (msg.includes('row-level security')) {
                        msg = 'Storage policy (RLS) error. Please ensure "jd" bucket has public upload permissions.';
                    }
                    throw new Error(`Upload failed: ${msg}`);
                }

                const { data } = supabase.storage
                    .from('jd')
                    .getPublicUrl(fileName);

                jdUrl = data.publicUrl;
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
                candidatesCount: formData.candidatesCount,
                qualification: formData.qualification,
                skills: formData.skills,
                description: formData.description,
                budgetPay: formData.budgetPay,
                salaryBreakup: formData.salaryBreakup,
                requestedBy: formData.requestedBy,
                jdUrl: jdUrl,
                updatedAt: serverTimestamp()
            };

            if (initialData?.id) {
                // Update
                console.log('Updating recruitment request...');
                await updateDoc(doc(db, 'recruits', initialData.id), payload);
                toast.success('Recruitment request updated successfully!');
            } else {
                // Create
                console.log('Saving recruitment request to Firestore...');
                await addDoc(collection(db, 'recruits'), {
                    ...payload,
                    createdAt: serverTimestamp()
                });
                toast.success('Recruitment request raised successfully!');
            }

            onClose();
        } catch (error: any) {
            console.error('Error raising recruitment request:', error);
            const errorMessage = error.message || String(error);
            toast.error(`Submission failed: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: name === 'candidatesCount' ? parseInt(value) : value }));
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/30 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-md shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="bg-white px-6 py-4 border-b border-gray-200 flex justify-between items-center flex-shrink-0 rounded-t-md">
                    <h2 className="text-xl font-bold text-gray-900 font-outfit">{initialData?.id ? 'Edit Recruitment Request' : 'Add Recruitment Request'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <form id="recruitment-form" onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Job Title */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title *</label>
                            <input
                                required
                                type="text"
                                name="jobTitle"
                                value={formData.jobTitle}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                placeholder="e.g. Senior Frontend Developer"
                            />
                        </div>

                        {/* Urgency Level */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Urgency Level *</label>
                            <select
                                name="urgencyLevel"
                                value={formData.urgencyLevel}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                            >
                                <option value="Immediate">Immediate</option>
                                <option value="Moderate">Moderate</option>
                                <option value="Flexible">Flexible</option>
                            </select>
                        </div>

                        {/* Department */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Department *</label>
                            <input
                                required
                                type="text"
                                name="department"
                                value={formData.department}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                placeholder="e.g. Engineering"
                            />
                        </div>

                        {/* Type of candidates */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Type of Candidates *</label>
                            <select
                                name="candidateType"
                                value={formData.candidateType}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                            >
                                <option value="Permanent">Permanent</option>
                                <option value="Contract">Contract</option>
                                <option value="Internship">Internship</option>
                                <option value="Part Time">Part Time</option>
                            </select>
                        </div>

                        {/* Position Level */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Position Level *</label>
                            <select
                                name="positionLevel"
                                value={formData.positionLevel}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
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
                            <label className="block text-sm font-medium text-gray-700 mb-1">Years of Experience REQUIRED *</label>
                            <input
                                required
                                type="text"
                                name="yearsExperience"
                                value={formData.yearsExperience}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                placeholder="e.g. 5+ years"
                            />
                        </div>

                        {/* Mode of Work */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Mode of Work *</label>
                            <select
                                name="modeOfWork"
                                value={formData.modeOfWork}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                            >
                                <option value="Office">Office</option>
                                <option value="Hybrid">Hybrid</option>
                                <option value="Remote">Remote</option>
                            </select>
                        </div>

                        {/* Location */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Location *</label>
                            <input
                                required
                                type="text"
                                name="location"
                                value={formData.location}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                placeholder="e.g. Bangalore, Karnataka"
                            />
                        </div>

                        {/* No of candidates */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">No. of Candidates Required *</label>
                            <input
                                required
                                type="number"
                                min="1"
                                name="candidatesCount"
                                value={formData.candidatesCount}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                            />
                        </div>

                        {/* Qualification */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Qualification Required *</label>
                            <input
                                required
                                type="text"
                                name="qualification"
                                value={formData.qualification}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                placeholder="e.g. B.Tech / MCA"
                            />
                        </div>

                        {/* Key Skills */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Key Skills Required *</label>
                            <input
                                required
                                type="text"
                                name="skills"
                                value={formData.skills}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                placeholder="e.g. React, Node.js, AWS"
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Detailed Job Description</label>
                        <textarea
                            name="description"
                            value={formData.description}
                            onChange={handleChange}
                            rows={6}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500 font-mono text-sm"
                            placeholder="Paste the full job description here (Roles, Responsibilities, Requirements)..."
                        />
                    </div>

                    {/* Attachment of JD */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Attachment of JD</label>
                        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                            <div className="space-y-1 text-center">
                                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                <div className="flex text-sm text-gray-600">
                                    <label className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500">
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
                                <p className="text-xs text-gray-500">PDF, DOC, DOCX up to 10MB</p>
                                {file && <p className="text-sm text-primary-600 font-medium">{file.name}</p>}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Budget Pay out */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Budget Pay out (Min – Max) *</label>
                            <input
                                required
                                type="text"
                                name="budgetPay"
                                value={formData.budgetPay}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                placeholder="e.g. 10L - 15L"
                            />
                        </div>

                        {/* Salary Breakup */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Salary Breakup Guidelines *</label>
                            <input
                                required
                                type="text"
                                name="salaryBreakup"
                                value={formData.salaryBreakup}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                                placeholder="e.g. Fixed + Performance Bonus"
                            />
                        </div>

                        {/* Request Raised by */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Request Raised by *</label>
                            <select
                                name="requestedBy"
                                value={formData.requestedBy}
                                onChange={handleChange}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-primary-500 focus:border-primary-500"
                            >
                                <option value="Dinesh">Dinesh</option>
                                <option value="Naresh">Naresh</option>
                            </select>
                        </div>
                    </div>
                </form>

                {/* Button Container - Static at Bottom */}
                <div className="bg-white px-6 py-4 border-t border-gray-200 flex justify-end space-x-3 flex-shrink-0 rounded-b-md">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="recruitment-form"
                        disabled={loading}
                        className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50"
                    >
                        {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        {initialData?.id ? 'Update Request' : 'Submit Request'}
                    </button>
                </div>
            </div>
        </div>
    );
}
