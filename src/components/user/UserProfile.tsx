import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { User, Mail, Phone, Save, Loader2, Plus, X, Globe, Book, Award, FileUp, Clock, Briefcase, DollarSign, CheckCircle2, UploadCloud, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import UserHeader from '@/components/layout/UserHeader';

export default function UserProfile() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        mobile: '',
        skills: '',
        projects: '',
        certifications: '',
        resumeUrl: '',
        yearsOfExperience: '',
        department: '',
        expectedSalary: ''
    });
    const [showMoreModal, setShowMoreModal] = useState(false);
    const [uploading, setUploading] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        fetchUserProfile();
    }, []);

    const fetchUserProfile = async () => {
        const user = auth.currentUser;
        if (!user) {
            navigate('/');
            return;
        }

        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                setFormData({
                    firstName: data.firstName || '',
                    lastName: data.lastName || '',
                    email: data.email || '',
                    mobile: data.mobile || '',
                    skills: data.skills || '',
                    projects: data.projects || '',
                    certifications: data.certifications || '',
                    resumeUrl: data.resumeUrl || '',
                    yearsOfExperience: data.yearsOfExperience || '',
                    department: data.department || '',
                    expectedSalary: data.expectedSalary || ''
                });
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            toast.error('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        const user = auth.currentUser;
        if (!user) return;

        setSaving(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                firstName: formData.firstName,
                lastName: formData.lastName,
                mobile: formData.mobile,
                skills: formData.skills,
                projects: formData.projects,
                certifications: formData.certifications,
                resumeUrl: formData.resumeUrl,
                yearsOfExperience: formData.yearsOfExperience,
                department: formData.department,
                expectedSalary: formData.expectedSalary,
                updatedAt: new Date()
            });
            toast.success('Profile updated successfully!');
        } catch (error) {
            console.error('Error updating profile:', error);
            toast.error('Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const onDrop = async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        const user = auth.currentUser;
        if (!file || !user) return;

        // Check file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            toast.error('File size exceeds 5MB limit');
            return;
        }

        setUploading(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `resumes/${user.uid}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('resumes')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('resumes')
                .getPublicUrl(filePath);

            setFormData(prev => ({ ...prev, resumeUrl: publicUrl }));
            toast.success('Resume uploaded successfully!');
        } catch (error: any) {
            console.error('Upload error:', error);
            toast.error(`Upload failed: ${error.message}`);
        } finally {
            setUploading(false);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'application/pdf': ['.pdf'],
            'application/msword': ['.doc'],
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
        },
        maxFiles: 1,
        multiple: false
    });

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-primary-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <UserHeader />

            <main className="flex-1 max-w-4xl mx-auto w-full px-3 sm:px-4 py-6 sm:py-8">


                <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden relative">
                    {/* Top Orange Gradient Line */}
                    <div className="absolute top-0 left-0 right-0 h-1.5 bg-orange-gradient z-20"></div>

                    <div className="bg-white px-6 sm:px-8 py-8 sm:py-12 relative overflow-hidden border-b border-gray-200">
                        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6 relative z-10">
                            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-orange-50 flex items-center justify-center border-4 border-white shadow-xl">
                                <User className="w-10 h-10 sm:w-12 sm:h-12 text-orange-500" />
                            </div>
                            <div className="text-center sm:text-left">
                                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">{formData.firstName} {formData.lastName}</h1>
                                <p className="text-sm sm:text-base text-gray-500 font-medium">{formData.email}</p>
                            </div>
                        </div>
                    </div>

                    <form onSubmit={handleUpdate} className="p-6 sm:p-8 space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">First Name</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        required
                                        value={formData.firstName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
                                    />
                                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Last Name</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        required
                                        value={formData.lastName}
                                        onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
                                    />
                                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                                <div className="relative">
                                    <input
                                        type="email"
                                        disabled
                                        value={formData.email}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-500 cursor-not-allowed outline-none"
                                    />
                                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Mobile Number</label>
                                <div className="relative">
                                    <input
                                        type="tel"
                                        required
                                        value={formData.mobile}
                                        onChange={(e) => setFormData(prev => ({ ...prev, mobile: e.target.value }))}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all outline-none"
                                    />
                                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-gray-100 flex justify-between items-center">
                            <button
                                type="button"
                                onClick={() => setShowMoreModal(true)}
                                className="inline-flex items-center text-primary-600 font-bold hover:text-primary-700 transition-colors group"
                            >
                                <div className="p-1.5 rounded-lg bg-primary-50 group-hover:bg-primary-100 mr-2 transition-colors">
                                    <Plus className="w-4 h-4" />
                                </div>
                                Add more profile details
                            </button>

                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center px-8 py-3 bg-orange-gradient text-white font-bold rounded-xl hover:opacity-90 transition-all shadow-lg shadow-orange-500/30 disabled:opacity-50 active:scale-95"
                            >
                                {saving ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        <Save className="w-5 h-5 mr-2" />
                                        Update Profile
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>

                {/* More Details Modal - Refined & Sleek */}
                {showMoreModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                        <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                            {/* Modal Header */}
                            <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-gray-100 flex justify-between items-center bg-white shrink-0">
                                <div>
                                    <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">Professional Details</h2>
                                    <p className="text-xs sm:text-sm text-gray-500">Enhance your profile for better job matching</p>
                                </div>
                                <button
                                    onClick={() => setShowMoreModal(false)}
                                    className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="p-4 sm:p-8 overflow-y-auto custom-scrollbar space-y-6 sm:space-y-8 bg-gray-50/30">
                                {/* Career Info Section */}
                                <section className="space-y-4">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-1 h-4 bg-primary-500 rounded-full"></div>
                                        Career Overview
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-700 ml-1">Experience (Years)</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    placeholder="e.g. 5"
                                                    value={formData.yearsOfExperience}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, yearsOfExperience: e.target.value }))}
                                                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all outline-none text-sm shadow-sm"
                                                />
                                                <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-700 ml-1">Current Department</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Engineering"
                                                    value={formData.department}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                                                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all outline-none text-sm shadow-sm"
                                                />
                                                <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-700 ml-1">Expected Salary</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    placeholder="e.g. $80,000"
                                                    value={formData.expectedSalary}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, expectedSalary: e.target.value }))}
                                                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all outline-none text-sm shadow-sm"
                                                />
                                                <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Expertise Section */}
                                <section className="space-y-4">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
                                        Expertise & Background
                                    </h3>
                                    <div className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-700 ml-1">Skills (Comma separated)</label>
                                            <div className="relative group">
                                                <textarea
                                                    placeholder="e.g. React, Node.js, Python, UI Design..."
                                                    value={formData.skills}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, skills: e.target.value }))}
                                                    className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all outline-none min-h-[100px] text-sm shadow-sm resize-none"
                                                />
                                                <Award className="absolute right-4 bottom-4 w-5 h-5 text-gray-200 group-focus-within:text-primary-200 transition-colors" />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-700 ml-1">Key Projects</label>
                                            <div className="relative group">
                                                <textarea
                                                    placeholder="Highlight your best work..."
                                                    value={formData.projects}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, projects: e.target.value }))}
                                                    className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all outline-none min-h-[100px] text-sm shadow-sm resize-none"
                                                />
                                                <Globe className="absolute right-4 bottom-4 w-5 h-5 text-gray-200 group-focus-within:text-primary-200 transition-colors" />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-700 ml-1">Certifications</label>
                                            <div className="relative group">
                                                <textarea
                                                    placeholder="Degrees, licenses, online courses..."
                                                    value={formData.certifications}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, certifications: e.target.value }))}
                                                    className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all outline-none min-h-[100px] text-sm shadow-sm resize-none"
                                                />
                                                <Book className="absolute right-4 bottom-4 w-5 h-5 text-gray-200 group-focus-within:text-primary-200 transition-colors" />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* Resume Section */}
                                <section className="space-y-4">
                                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <div className="w-1 h-4 bg-orange-500 rounded-full"></div>
                                        Documents
                                    </h3>
                                    <div className="p-1 space-y-3">
                                        <div
                                            {...getRootProps()}
                                            className={`relative group cursor-pointer transition-all duration-300 ${isDragActive
                                                ? 'bg-orange-50 border-2 border-dashed border-orange-400'
                                                : 'bg-white border-2 border-dashed border-gray-100 hover:border-orange-200 hover:bg-orange-50/30'
                                                } rounded-3xl p-10 flex flex-col items-center justify-center gap-4`}
                                        >
                                            <input {...getInputProps()} />

                                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 ${isDragActive ? 'bg-orange-gradient text-white scale-110' : 'bg-orange-50 text-orange-500 group-hover:bg-orange-gradient group-hover:text-white group-hover:rotate-12'
                                                }`}>
                                                {uploading ? (
                                                    <Loader2 className="w-8 h-8 animate-spin" />
                                                ) : isDragActive ? (
                                                    <UploadCloud className="w-8 h-8 animate-bounce" />
                                                ) : (
                                                    <FileUp className="w-8 h-8" />
                                                )}
                                            </div>

                                            <div className="text-center">
                                                <p className="text-sm font-bold text-gray-900 mb-1">
                                                    {isDragActive ? 'Drop your resume here' : 'Drop your resume or click to browse'}
                                                </p>
                                                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">
                                                    Supports PDF, DOCX up to 5MB
                                                </p>
                                            </div>

                                            {formData.resumeUrl && !uploading && (
                                                <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100 animate-in fade-in zoom-in">
                                                    <CheckCircle2 className="w-3 h-3" />
                                                    <span className="text-[10px] font-bold uppercase tracking-wider">File Ready</span>
                                                </div>
                                            )}
                                        </div>

                                        {formData.resumeUrl && (
                                            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 group transition-all hover:bg-white hover:shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm border border-gray-100">
                                                        <FileText className="w-5 h-5 text-orange-500" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-gray-900">Current Resume</p>
                                                        <p className="text-[10px] text-gray-500 font-medium max-w-[200px] truncate">{formData.resumeUrl}</p>
                                                    </div>
                                                </div>
                                                <a
                                                    href={formData.resumeUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="px-4 py-2 bg-white text-gray-900 text-[10px] font-bold rounded-xl border border-gray-200 hover:border-orange-500 hover:text-orange-600 transition-all shadow-sm"
                                                >
                                                    View Document
                                                </a>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50/50 rounded-xl border border-orange-100/50 text-[10px] text-orange-600 font-medium">
                                            <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                                            Uploaded resumes are stored securely and visible only to relevant recruiters.
                                        </div>
                                    </div>
                                </section>
                            </div>

                            <div className="px-4 sm:px-8 py-4 sm:py-6 bg-white border-t border-gray-100 flex justify-end shrink-0">
                                <button
                                    onClick={async () => {
                                        await handleUpdate({ preventDefault: () => { } } as any);
                                        setShowMoreModal(false);
                                    }}
                                    disabled={saving}
                                    className="px-8 py-3 bg-orange-gradient text-white font-black rounded-2xl hover:opacity-95 transition-all shadow-xl shadow-orange-500/20 active:scale-95 disabled:opacity-50"
                                >
                                    {saving ? 'Saving...' : 'Save & Close'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
