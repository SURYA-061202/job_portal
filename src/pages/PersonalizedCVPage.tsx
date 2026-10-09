import { useState, useEffect, useRef } from 'react';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { FileDown, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import UserHeader from '@/components/layout/UserHeader';
import { Skeleton, ContentCardSkeleton } from '@/components/user/SkeletonLoaders';
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

    const handleViewPDF = async () => {
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

            pdf.save(`${userData.firstName}_${userData.lastName}_Resume.pdf`);
            toast.success('Resume generated successfully!', { id: toastId });
        } catch (error) {
            console.error('Error generating PDF snapshot:', error);
            toast.error('Failed to generate high-clarity resume', { id: toastId });
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
                            className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 border border-ink bg-ink text-surface text-sm font-semibold rounded-lg hover:border-brand hover:bg-brand hover:text-ink hover:scale-[1.02] active:scale-95 transition-all"
                        >
                            <FileDown className="w-5 h-5" />
                            Download Resume
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Panel - Data Summary */}
                    <div className="lg:col-span-1 flex flex-col gap-6">
                        <div className="bg-surface rounded-2xl border border-border shadow-md p-6">
                            <h3 className="text-lg font-bold text-ink mb-6 flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-brand" />
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
                        <div className="bg-surface rounded-2xl border border-border shadow-md overflow-hidden flex flex-col h-[700px]">
                            <div className="p-6 border-b border-border flex items-center justify-between bg-surface">
                                <div>
                                    <h3 className="text-lg font-bold text-ink">Resume Preview</h3>
                                </div>
                            </div>
                            
                            <div className="flex-1 overflow-y-auto p-8 bg-muted flex justify-center">
                                    <div ref={resumeRef} className="w-full max-w-[720px] min-h-[800px] flex flex-col gap-1 text-black" style={{ fontFamily: 'sans-serif', backgroundColor: '#ffffff', color: '#000000', padding: '40px', border: '1px solid #f3f4f6' }}>
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
