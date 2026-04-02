import { useState, useEffect, useRef } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { FileDown, Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import UserHeader from '@/components/layout/UserHeader';
import { StandardResumeTemplate } from '@/components/user/StandardResumeTemplate';
import toast from 'react-hot-toast';

export default function PersonalizedCVPage() {
    const [userData, setUserData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const resumeRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
            if (user) {
                fetchUserData();
            } else {
                setLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    const fetchUserData = async () => {
        const user = auth.currentUser;
        if (!user) return;

        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                setUserData({
                    firstName: data.firstName || '',
                    lastName: data.lastName || '',
                    email: data.email || user.email || '',
                    mobile: data.mobile || '',
                    address: data.address || '',
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
            } else {
                toast.error('Profile not found. Please update your profile first.');
            }
        } catch (error) {
            console.error('Error fetching user data:', error);
            toast.error('Failed to load profile data');
        } finally {
            setLoading(false);
        }
    };

    const handleViewPDF = async (open: boolean = true) => {
        if (!userData || !resumeRef.current) return;
        
        const toastId = toast.loading('Generating high-clarity resume...');
        try {
            const element = resumeRef.current;
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
            
            if (open) {
                const blob = pdf.output('blob');
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank');
            } else {
                pdf.save(`${userData.firstName}_${userData.lastName}_Resume.pdf`);
            }
            toast.success('Resume generated successfully!', { id: toastId });
        } catch (error) {
            console.error('Error generating PDF snapshot:', error);
            toast.error('Failed to generate high-clarity resume', { id: toastId });
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col">
                <UserHeader />
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                </div>
            </div>
        );
    }

    const isProfileIncomplete = !userData?.firstName || !userData?.skillItems?.length;

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col" style={{ fontFamily: '"Poppins", sans-serif' }}>
            <UserHeader />
            
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                    <div>
                        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Personalized CV</h1>
                        <p className="text-gray-500 mt-2 text-sm md:text-base">Auto-generate a professional resume based on your latest profile details.</p>
                    </div>
                    
                    {userData && !isProfileIncomplete && (
                        <button
                            onClick={() => handleViewPDF(false)}
                            className="w-full md:w-auto flex items-center justify-center gap-2 px-8 py-4 bg-orange-50 border-2 border-orange-200 text-orange-600 font-bold rounded-2xl shadow-lg shadow-orange-500/5 hover:bg-orange-100 hover:border-orange-300 hover:scale-[1.02] active:scale-95 transition-all"
                        >
                            <FileDown className="w-5 h-5" />
                            Download Resume
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Panel - Data Summary */}
                    <div className="lg:col-span-1 flex flex-col gap-6">
                        <div className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-orange-500" />
                                Resume Data
                            </h3>
                            
                            <div className="space-y-6">
                                <div>
                                    <div className="flex items-center gap-3 mt-2">
                                        <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 font-bold">
                                            {userData?.firstName?.[0]}{userData?.lastName?.[0]}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">{userData?.firstName} {userData?.lastName}</p>
                                            <p className="text-xs text-gray-500">{userData?.email}</p>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Section Status</p>
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
                                <div className="mt-8 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-bold text-amber-900">Incomplete Profile</p>
                                            <p className="text-xs text-amber-700 mt-1 leading-relaxed">Add your personal details and skills in the Home tab to generate your CV.</p>
                                            <button 
                                                onClick={() => window.location.href = '/home?tab=profile'}
                                                className="text-xs font-bold text-amber-900 underline mt-3 hover:text-amber-950"
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
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[700px]">
                            <div className="p-6 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Resume Preview</h3>
                                </div>
                                {userData && (
                                    <button 
                                        onClick={() => handleViewPDF(true)}
                                        className="px-4 py-1.5 bg-white border border-gray-200 rounded-full text-[10px] font-bold text-gray-500 uppercase tracking-wider hover:bg-gray-50 hover:text-orange-600 hover:border-orange-200 transition-all"
                                    >
                                        View Resume
                                    </button>
                                )}
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-8 bg-gray-100/50 flex justify-center">
                                    <div ref={resumeRef} className="w-full max-w-[600px] min-h-[800px] flex flex-col gap-1 text-black" style={{ fontFamily: 'sans-serif', backgroundColor: '#ffffff', color: '#000000', padding: '40px', border: '1px solid #f3f4f6' }}>
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

                {/* Additional Content below Resume Preview */}
                <div className="mt-8 bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">Resume Tips & Guidelines</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                            <h4 className="text-sm font-bold text-gray-900 mb-2">Quantify Achievements</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">Use numbers (e.g. "Increased efficiency by 20%") to make your experience stand out to recruiters.</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                            <h4 className="text-sm font-bold text-gray-900 mb-2">Keyword Optimization</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">Include relevant industry keywords from job descriptions to pass Applicant Tracking Systems (ATS).</p>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                            <h4 className="text-sm font-bold text-gray-900 mb-2">Professional Formatting</h4>
                            <p className="text-xs text-gray-500 leading-relaxed">Our templates follow standard academic and professional formats recognized by top infrastructure companies.</p>
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
        <div className="flex items-center justify-between p-3 bg-gray-50/50 rounded-xl border border-gray-100">
            <span className="text-xs font-bold text-gray-700">{label}</span>
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-gray-400">{count || 0} items</span>
                {hasData ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-200" />
                )}
            </div>
        </div>
    );
}
