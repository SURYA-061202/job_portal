import { useState, useEffect } from 'react';
import { sendEmailVerification } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { User, Mail, Phone, Loader2, Briefcase, MapPin, Edit2, X, Sparkles, Star, ShieldCheck, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import UserHeader from '@/components/layout/UserHeader';

import ProfileDetailsView from './ProfileDetailsView';
import JobsAndApplicationsView from './JobsAndApplicationsView';

export default function UserProfile() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchParams] = useSearchParams();
    const activeTab = (searchParams.get('tab') || 'profile') as 'profile' | 'jobs' | 'applications';
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [calculatingScore, setCalculatingScore] = useState(false);
    const [verifyingEmail, setVerifyingEmail] = useState(false);
    const [isEmailVerified, setIsEmailVerified] = useState(auth.currentUser?.emailVerified || false);

    useEffect(() => {
        let interval: any;
        if (!isEmailVerified) {
            interval = setInterval(async () => {
                const user = auth.currentUser;
                if (user) {
                    await user.reload();
                    if (user.emailVerified) {
                        setIsEmailVerified(true);
                        toast.success('Email verified successfully!');
                        clearInterval(interval);
                    }
                }
            }, 3000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isEmailVerified]);
    
    // Core Profile Fields
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        mobile: '',
        yearsOfExperience: '',
        department: '',
        address: '',
        resumeUrl: '',
        profileScore: 0,
        
        // Structured Array Data
        educationItems: [] as any[],
        projectItems: [] as any[],
        certificateItems: [] as any[],
        experienceItems: [] as any[],
        courseItems: [] as string[],
        skillItems: [] as string[],
        matchingScores: {} as Record<string, number>
    });

    const navigate = useNavigate();

    useEffect(() => {
        if (!document.getElementById('poppins-font')) {
            const link = document.createElement('link');
            link.id = 'poppins-font';
            link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap';
            link.rel = 'stylesheet';
            document.head.appendChild(link);
        }
        fetchUserProfile();
    }, []);

    useEffect(() => {
        if (activeTab === 'profile' && formData.email) {
            calculateMatchingScores();
        }
    }, [activeTab, formData.email]);

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
                
                // Migrate any old string data to the new structured arrays seamlessly
                const migratedEducation = data.educationItems || (data.college ? [{ collegeName: data.college, course: '', specialization: '', graduatedYear: '', grade: '' }] : []);
                const migratedProjects = data.projectItems || (data.projects ? [{ title: 'Legacy Portfolio', description: data.projects, link: '' }] : []);
                const migratedCertificates = data.certificateItems || (data.certifications ? [{ name: data.certifications, organization: '', issueDate: '', url: '' }] : []);
                const migratedSkills = data.skillItems || (data.skills ? data.skills.split(',').map((s: string) => s.trim()).filter(Boolean) : []);

                setFormData({
                    firstName: data.firstName || '',
                    lastName: data.lastName || '',
                    email: data.email || '',
                    mobile: data.mobile || '',
                    yearsOfExperience: data.yearsOfExperience || '',
                    department: data.department || '',
                    address: data.address || '',
                    resumeUrl: data.resumeUrl || '',
                    
                    educationItems: migratedEducation,
                    projectItems: migratedProjects,
                    certificateItems: migratedCertificates,
                    experienceItems: data.experienceItems || [],
                    courseItems: data.courseItems || [],
                    skillItems: migratedSkills,
                    profileScore: data.profileScore || 0,
                    matchingScores: data.matchingScores || {}
                });
            }
        } catch (error) {
            console.error('Error fetching profile:', error);
            toast.error('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const calculateProfileScore = async () => {
        const user = auth.currentUser;
        if (!user) return;

        setCalculatingScore(true);
        try {
            const prompt = `
                Evaluate this user profile completeness and strength on a scale of 0-100.
                Return ONLY a JSON object: { "score": number, "feedback": "very short string" }
                
                Profile Data:
                - Name: ${formData.firstName} ${formData.lastName}
                - Role: ${formData.department}
                - Experience: ${formData.yearsOfExperience} years
                - Education: ${JSON.stringify(formData.educationItems)}
                - Projects: ${JSON.stringify(formData.projectItems)}
                - Skills: ${JSON.stringify(formData.skillItems)}
                - Certificates: ${JSON.stringify(formData.certificateItems)}
                - Resume: ${formData.resumeUrl ? 'Uploaded' : 'Missing'}
            `;

            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3
                })
            });

            const data = await response.json();
            const result = JSON.parse(data.choices[0].message.content);
            const newScore = Math.min(100, Math.max(0, result.score || 0));

            await updateDoc(doc(db, 'users', user.uid), {
                profileScore: newScore,
                updatedAt: new Date()
            });

            setFormData(prev => ({ ...prev, profileScore: newScore }));
            toast.success(`Profile Score Updated: ${newScore}%`);
        } catch (error) {
            console.error('Score calculation error:', error);
            toast.error('Failed to calculate profile score');
        } finally {
            setCalculatingScore(false);
        }
    };

    const handleSaveProfileCard = async () => {
        const user = auth.currentUser;
        if (!user) return;

        setSaving(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                firstName: formData.firstName,
                lastName: formData.lastName,
                mobile: formData.mobile,
                department: formData.department,
                yearsOfExperience: formData.yearsOfExperience,
                address: formData.address,
                updatedAt: new Date()
            });
            toast.success('Profile details updated!');
            setIsEditingProfile(false);
        } catch (error) {
            console.error('Error updating profile card:', error);
            toast.error('Failed to update profile details');
        } finally {
            setSaving(false);
        }
    };

    const calculateMatchingScores = async () => {
        const user = auth.currentUser;
        if (!user || !formData.skillItems.length) return;

        try {
            const jobsSnap = await getDocs(collection(db, 'recruits'));
            const currentScores = formData.matchingScores || {};
            let hasNewScores = false;
            const updatedScores = { ...currentScores };

            jobsSnap.docs.forEach(jobDoc => {
                const job = jobDoc.data();
                const jobId = jobDoc.id;

                // Skip if score already exists
                if (currentScores[jobId] !== undefined) return;

                // Simple Matching Logic
                // 1. Skills Match (70% weight)
                const jobSkills = job.skills?.toLowerCase().split(',').map((s: string) => s.trim()).filter(Boolean) || [];
                const userSkills = formData.skillItems.map(s => s.toLowerCase());
                
                let skillScore = 0;
                if (jobSkills.length > 0) {
                    const matches = jobSkills.filter((s: string) => userSkills.includes(s)).length;
                    skillScore = (matches / jobSkills.length) * 70;
                }

                // 2. Experience Match (30% weight)
                const jobExp = parseInt(job.yearsExperience) || 0;
                const userExp = parseInt(formData.yearsOfExperience) || 0;
                
                let expScore = 0;
                if (jobExp === 0) {
                    expScore = 30; // 0 required exp means perfect match for exp
                } else {
                    expScore = userExp >= jobExp ? 30 : (userExp / jobExp) * 30;
                }

                const totalScore = Math.round(skillScore + expScore);
                updatedScores[jobId] = totalScore;
                hasNewScores = true;
            });

            if (hasNewScores) {
                await updateDoc(doc(db, 'users', user.uid), {
                    matchingScores: updatedScores
                });
                setFormData(prev => ({ ...prev, matchingScores: updatedScores }));
            }
        } catch (error) {
            console.error('Error calculating matching scores:', error);
        }
    };

    const handleVerifyEmail = async () => {
        const user = auth.currentUser;
        if (!user) return;

        setVerifyingEmail(true);
        try {
            await sendEmailVerification(user);
            toast.success('Verification email sent! Please check your inbox.');
        } catch (error: any) {
            console.error('Error sending verification email:', error);
            if (error.code === 'auth/too-many-requests') {
                toast.error('Too many requests. Please try again later.');
            } else {
                toast.error('Failed to send verification email');
            }
        } finally {
            setVerifyingEmail(false);
        }
    };

    const handleInputChange = (field: keyof typeof formData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-12 h-12 text-primary-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: '"Poppins", sans-serif' }}>
            <UserHeader />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
                <div className={`w-full flex flex-col ${activeTab === 'profile' ? 'lg:flex-row' : ''} gap-8 relative`}>
                    
                    {/* Left Column - Profile Card (Only shown in Profile tab) */}
                    {activeTab === 'profile' && (
                        <div className="w-full lg:w-[350px] flex-shrink-0">
                            <div className="sticky top-24">
                                <div className="bg-white rounded-[2rem] border border-gray-200 overflow-hidden group">
                                    <div className="h-24 bg-orange-gradient relative">
                                        <button
                                            onClick={() => setIsEditingProfile(!isEditingProfile)}
                                            className="absolute top-3 right-3 p-1.5 bg-white/50 hover:bg-white/70 backdrop-blur-sm rounded-full text-black transition-colors border border-white/20"
                                            title="Edit Profile Info"
                                        >
                                            {isEditingProfile ? <X className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                    
                                    <div className="px-5 pb-5 relative">
                                        <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center border-4 border-white mx-auto -mt-10 mb-3 relative z-10">
                                            <div 
                                                className={`w-full h-full rounded-full flex items-center justify-center p-1 transition-all duration-500`}
                                                style={{
                                                    background: `conic-gradient(${formData.profileScore >= 75 ? '#10b981' : formData.profileScore >= 40 ? '#f59e0b' : '#ef4444'} ${formData.profileScore * 3.6}deg, #f3f4f6 0deg)`
                                                }}
                                            >
                                                <div className="w-full h-full bg-white rounded-full flex items-center justify-center shadow-inner text-gray-400">
                                                    <User className={`w-8 h-8 ${formData.profileScore >= 75 ? 'text-emerald-500' : formData.profileScore >= 40 ? 'text-amber-500' : 'text-rose-500'}`} />
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {isEditingProfile ? (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="block text-[9px] uppercase font-bold text-gray-500 mb-0.5">First Name</label>
                                                        <input type="text" value={formData.firstName} onChange={(e) => handleInputChange('firstName', e.target.value)} className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[9px] uppercase font-bold text-gray-500 mb-0.5">Last Name</label>
                                                        <input type="text" value={formData.lastName} onChange={(e) => handleInputChange('lastName', e.target.value)} className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] uppercase font-bold text-gray-500 mb-0.5">Role / Department</label>
                                                    <input type="text" value={formData.department} onChange={(e) => handleInputChange('department', e.target.value)} placeholder="e.g. Frontend Developer" className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none" />
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] uppercase font-bold text-gray-500 mb-0.5">Mobile</label>
                                                    <input type="tel" value={formData.mobile} onChange={(e) => handleInputChange('mobile', e.target.value)} className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none" />
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] uppercase font-bold text-gray-500 mb-0.5">Years of Experience</label>
                                                    <input type="number" value={formData.yearsOfExperience} onChange={(e) => handleInputChange('yearsOfExperience', e.target.value)} placeholder="e.g. 3" className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none" />
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] uppercase font-bold text-gray-500 mb-0.5">Address</label>
                                                    <textarea value={formData.address} onChange={(e) => handleInputChange('address', e.target.value)} placeholder="City, State" className="w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 outline-none resize-none h-12" />
                                                </div>
                                                <button disabled={saving} onClick={handleSaveProfileCard} className="w-full mt-2 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50">
                                                    {saving ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Save Details'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="text-center">
                                                <h1 className="text-lg font-black text-gray-900 tracking-tight">{formData.firstName} {formData.lastName}</h1>
                                                {formData.department ? (
                                                    <p className="text-xs text-primary-600 font-bold mt-1 mb-3 bg-primary-50 inline-block px-3 py-1 rounded-full border border-primary-100">{formData.department}</p>
                                                ) : (
                                                    <button onClick={() => setIsEditingProfile(true)} className="text-[10px] text-orange-500 font-bold mt-1 mb-3 bg-orange-50 hover:bg-orange-100 transition-colors inline-block px-3 py-1 rounded-full border border-orange-100">+ Add your role</button>
                                                )}
                                                
                                                <div className="space-y-3 text-left border-t border-gray-100 pt-5 pb-2">
                                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                                        <Mail className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                        <span className="truncate leading-none">{formData.email}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-sm text-gray-600">
                                                        <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                        <span className="leading-none">{formData.mobile || <span className="text-gray-400 italic">No mobile added</span>}</span>
                                                    </div>
                                                    {formData.yearsOfExperience && (
                                                        <div className="flex items-center gap-3 text-sm text-gray-600">
                                                            <Briefcase className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                            <span className="leading-none">{formData.yearsOfExperience} Years Experience</span>
                                                        </div>
                                                    )}
                                                    {formData.address && (
                                                        <div className="flex items-start gap-3 text-sm text-gray-600">
                                                            <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                                            <span className="whitespace-pre-wrap leading-tight">{formData.address}</span>
                                                        </div>
                                                    )}

                                                    <div className="pt-3 border-t border-gray-100 mt-2">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                                                                <span className="text-[11px] font-bold text-gray-900 uppercase">Profile Score: {formData.profileScore || 0}%</span>
                                                            </div>
                                                            <button 
                                                                onClick={calculateProfileScore} 
                                                                disabled={calculatingScore}
                                                                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-orange-500 transition-all disabled:opacity-50"
                                                                title="Refresh Score"
                                                            >
                                                                <Sparkles className={`w-3.5 h-3.5 ${calculatingScore ? 'animate-pulse text-orange-500' : ''}`} />
                                                            </button>
                                                        </div>
                                                        <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                                            <div 
                                                                className={`h-full transition-all duration-1000 ${formData.profileScore >= 75 ? 'bg-emerald-500' : formData.profileScore >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                                style={{ width: `${formData.profileScore || 0}%` }}
                                                            />
                                                        </div>
                                                        <p className="text-[10px] text-gray-400 mt-1.5 font-medium italic">
                                                            Based on your profile completeness and content.
                                                        </p>
                                                    </div>

                                                    {/* Email Verification Status */}
                                                    <div className="pt-3 border-t border-gray-100 mt-2">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                {isEmailVerified ? (
                                                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                                                ) : (
                                                                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                                                                )}
                                                                <span className={`text-[11px] font-bold uppercase ${isEmailVerified ? 'text-emerald-600' : 'text-amber-600'}`}>
                                                                    {isEmailVerified ? 'Email Verified' : 'Verify Email'}
                                                                </span>
                                                            </div>
                                                            {!isEmailVerified && (
                                                                <button 
                                                                    onClick={handleVerifyEmail}
                                                                    disabled={verifyingEmail}
                                                                    className="text-[10px] font-bold text-orange-600 hover:text-orange-700 disabled:opacity-50 transition-all active:scale-95"
                                                                >
                                                                    {verifyingEmail ? 'Sending...' : 'Verify Now'}
                                                                </button>
                                                            )}
                                                            {isEmailVerified && (
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Right Column - Content */}
                    <div className="flex-1 min-w-0 flex flex-col">
                        <div className="flex-1">
                            {activeTab === 'profile' && (
                                <ProfileDetailsView 
                                    formData={formData} 
                                    setFormData={setFormData}
                                />
                            )}
                            {(activeTab === 'jobs' || activeTab === 'applications') && (
                                <JobsAndApplicationsView 
                                    activeTab={activeTab} 
                                    onCompleteProfile={() => navigate('/home?tab=profile')}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
