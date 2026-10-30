import { useState, useEffect, useRef } from 'react';
import { sendEmailVerification, RecaptchaVerifier, linkWithPhoneNumber, unlink } from 'firebase/auth';
import type { ConfirmationResult } from 'firebase/auth';
import { doc, getDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { User, Mail, Phone, Loader2, Briefcase, MapPin, Edit2, X, ShieldCheck, ShieldAlert, CheckCircle2, Camera } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import popup from '@/components/ui/Popup';
import UserHeader from '@/components/layout/UserHeader';

import ProfileDetailsView from './ProfileDetailsView';
import JobsAndApplicationsView from './JobsAndApplicationsView';
import RecommendationsView from './RecommendationsView';
import UserSubscriptionView from '@/components/subscription/UserSubscriptionView';
import { ProfileCardSkeleton, ContentCardSkeleton } from './SkeletonLoaders';
import { sendPasswordResetMail, confirmMobileVerified, checkMobileAvailable, normalizeMobile } from '@/lib/emailFunctions';

export default function UserProfile() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchParams] = useSearchParams();
    const activeTab = (searchParams.get('tab') || 'profile') as 'profile' | 'jobs' | 'applications' | 'recommendations' | 'subscription';
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    const [verifyingEmail, setVerifyingEmail] = useState(false);
    const [sendingResetLink, setSendingResetLink] = useState(false);
    const [isEmailVerified, setIsEmailVerified] = useState(auth.currentUser?.emailVerified || false);
    const [isMobileVerified, setIsMobileVerified] = useState(false);
    const [mobileOtpStage, setMobileOtpStage] = useState<'idle' | 'code'>('idle');
    const [mobileOtp, setMobileOtp] = useState('');
    const [verifyingMobile, setVerifyingMobile] = useState(false);
    const [mobileResendIn, setMobileResendIn] = useState(0);
    /** Mobile number as loaded from Firestore — used to detect edits that
     *  must invalidate a previous verification. */
    const [mobileAtLoad, setMobileAtLoad] = useState('');
    const [profileImage, setProfileImage] = useState('');
    const [imageUploading, setImageUploading] = useState(false);
    const profileImageInputRef = useRef<HTMLInputElement>(null);
    /** Firebase Phone Auth: pending SMS round-trip + its invisible reCAPTCHA. */
    const mobileConfirmationRef = useRef<ConfirmationResult | null>(null);
    const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
    /** True once the code was accepted and the credential linked, so a retry
     *  after a transient backend error doesn't re-submit the same code. */
    const phoneLinkedRef = useRef(false);

    const resetMobileAuthState = () => {
        mobileConfirmationRef.current = null;
        phoneLinkedRef.current = false;
    };

    const clearRecaptcha = () => {
        recaptchaVerifierRef.current?.clear();
        recaptchaVerifierRef.current = null;
    };

    useEffect(() => () => clearRecaptcha(), []);

    useEffect(() => {
        let interval: any;
        if (!isEmailVerified) {
            interval = setInterval(async () => {
                const user = auth.currentUser;
                if (user) {
                    await user.reload();
                    if (user.emailVerified) {
                        setIsEmailVerified(true);
                        popup.success('Email verified successfully!');
                        clearInterval(interval);
                    }
                }
            }, 3000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isEmailVerified]);

    useEffect(() => {
        if (mobileResendIn <= 0) return;
        const timer = window.setTimeout(() => setMobileResendIn((s) => s - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [mobileResendIn]);
    
    // Core Profile Fields
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        mobile: '',
        mobileVerified: false,
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

                setProfileImage(data.profileImage || '');
                setIsMobileVerified(!!data.mobileVerified);
                setMobileAtLoad(data.mobile || '');
                setFormData({
                    firstName: data.firstName || '',
                    lastName: data.lastName || '',
                    email: data.email || '',
                    mobile: data.mobile || '',
                    mobileVerified: !!data.mobileVerified,
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
            popup.error('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveProfileCard = async () => {
        const user = auth.currentUser;
        if (!user) return;

        // Changing the number invalidates any previous verification.
        const normalizedMobile = normalizeMobile(formData.mobile);
        const mobileChanged = normalizedMobile !== normalizeMobile(mobileAtLoad);
        const storedMobile = normalizedMobile || formData.mobile;
        const trimmedMobile = formData.mobile.trim();

        // Unauthorised (malformed) number — warn specifically before writing.
        // An emptied field is allowed (it just clears the number).
        if (mobileChanged && trimmedMobile && !normalizedMobile) {
            popup.warning('That is not a valid Indian mobile number. Enter a 10-digit number starting with 6-9 (e.g., 9876543210).');
            return;
        }

        setSaving(true);
        try {
            // Reject numbers already held by another account before writing.
            if (mobileChanged && normalizedMobile) {
                await checkMobileAvailable(normalizedMobile);
            }
            await updateDoc(doc(db, 'users', user.uid), {
                firstName: formData.firstName,
                lastName: formData.lastName,
                mobile: storedMobile,
                ...(mobileChanged ? { mobileVerified: false } : {}),
                department: formData.department,
                yearsOfExperience: formData.yearsOfExperience,
                address: formData.address,
                updatedAt: new Date()
            });
            if (mobileChanged) {
                setIsMobileVerified(false);
                setMobileAtLoad(storedMobile);
                setFormData((prev) => ({ ...prev, mobile: storedMobile }));
                setMobileOtpStage('idle');
                setMobileOtp('');
                setMobileResendIn(0);
                resetMobileAuthState();
            }
            popup.success('Profile details updated!');
            setIsEditingProfile(false);
        } catch (error) {
            console.error('Error updating profile card:', error);
            const code = (error as { code?: string })?.code;
            const message = (error as { message?: string })?.message;
            if (code === 'functions/failed-precondition') {
                popup.warning(message || 'This mobile number is already registered to another account. Please use a different number or sign in to that account.');
            } else if (code === 'functions/invalid-argument') {
                popup.warning(message || 'That is not a valid Indian mobile number. Enter a 10-digit number starting with 6-9.');
            } else if (code === 'functions/unauthenticated' || code === 'functions/resource-exhausted') {
                popup.error(message || 'Please try again in a moment.');
            } else {
                popup.error('Failed to update profile details');
            }
        } finally {
            setSaving(false);
        }
    };

    const resizeProfileImage = (dataUrl: string): Promise<string> =>
        new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const size = 256;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Canvas unavailable'));
                    return;
                }
                const min = Math.min(img.width, img.height);
                ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => reject(new Error('Could not read image'));
            img.src = dataUrl;
        });

    const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            popup.error('Please select an image file');
            return;
        }

        setImageUploading(true);
        try {
            const dataUrl: string = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Could not read file'));
                reader.readAsDataURL(file);
            });
            const resized = await resizeProfileImage(dataUrl);
            const user = auth.currentUser;
            if (!user) return;

            await updateDoc(doc(db, 'users', user.uid), {
                profileImage: resized,
                updatedAt: new Date()
            });
            setProfileImage(resized);
            popup.success('Profile photo updated!');
        } catch (error) {
            console.error('Error updating profile photo:', error);
            popup.error('Failed to update profile photo');
        } finally {
            setImageUploading(false);
        }
    };

    const handleRemoveProfileImage = async () => {
        const user = auth.currentUser;
        if (!user || imageUploading) return;

        setImageUploading(true);
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                profileImage: '',
                updatedAt: new Date()
            });
            setProfileImage('');
            popup.success('Profile photo removed!');
        } catch (error) {
            console.error('Error removing profile photo:', error);
            popup.error('Failed to remove profile photo');
        } finally {
            setImageUploading(false);
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
            popup.success('Verification email sent! Please check your inbox.');
        } catch (error: any) {
            console.error('Error sending verification email:', error);
            if (error.code === 'auth/too-many-requests') {
                popup.error('Too many requests. Please try again later.');
            } else {
                popup.error('Failed to send verification email');
            }
        } finally {
            setVerifyingEmail(false);
        }
    };

    const handleSendMobileOtp = async () => {
        const user = auth.currentUser;
        if (!user) return;

        const mobile = normalizeMobile(formData.mobile);
        if (!mobile) {
            popup.warning('That is not a valid Indian mobile number. Enter a 10-digit number starting with 6-9 (e.g., 9876543210).');
            return;
        }

        setVerifyingMobile(true);
        try {
            resetMobileAuthState();
            const linkedPhone = normalizeMobile(
                user.providerData.find((p) => p.providerId === 'phone')?.phoneNumber || ''
            );

            // This exact number is already linked to the account (verified
            // earlier) — no SMS needed, just sync the verified flag.
            if (linkedPhone === mobile) {
                await confirmMobileVerified(mobile);
                setIsMobileVerified(true);
                setFormData((prev) => ({ ...prev, mobileVerified: true }));
                popup.success('Mobile number verified successfully!');
                return;
            }

            // A different number is still linked — drop it first so the new
            // one can take its place (email/password sign-in is unaffected).
            if (linkedPhone) {
                await unlink(user, 'phone');
            }

            if (!recaptchaVerifierRef.current) {
                recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'mobile-otp-recaptcha', {
                    size: 'invisible',
                });
            }
            mobileConfirmationRef.current = await linkWithPhoneNumber(
                user,
                `+91${mobile}`,
                recaptchaVerifierRef.current
            );
            setMobileOtpStage('code');
            setMobileOtp('');
            setMobileResendIn(60);
            popup.success(`Verification code sent to +91 ${mobile}.`);
        } catch (error) {
            console.error('Error sending mobile verification code:', error);
            resetMobileAuthState();
            clearRecaptcha();
            const code = (error as { code?: string })?.code;
            const message = (error as { message?: string })?.message;
            if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') {
                popup.error('Too many verification requests. Please try again in a while.');
            } else if (code === 'auth/captcha-check-failed') {
                popup.error('Security check failed. Please try again.');
            } else if (code === 'auth/network-request-failed') {
                popup.error('Network error. Please check your connection and try again.');
            } else if (code === 'functions/failed-precondition' || code === 'functions/invalid-argument') {
                popup.error(message || 'Unable to verify this number. Please try again.');
            } else if (code === 'functions/resource-exhausted' || code === 'functions/unauthenticated') {
                popup.error(message || 'Please wait a moment and try again.');
            } else {
                popup.error(message || 'Failed to send the verification code. Please try again.');
            }
        } finally {
            setVerifyingMobile(false);
        }
    };

    const handleVerifyMobileOtp = async (e: React.FormEvent) => {
        e.preventDefault();
        const code = mobileOtp.trim();
        if (!/^\d{6}$/.test(code)) {
            popup.error('Enter the 6-digit code from your verification message.');
            return;
        }
        const mobile = normalizeMobile(formData.mobile);
        if (!mobile) {
            popup.warning('That is not a valid Indian mobile number. Enter a 10-digit number starting with 6-9 (e.g., 9876543210).');
            return;
        }

        setVerifyingMobile(true);
        try {
            // Accepts the code and links the phone credential to the
            // signed-in account — the uid (and session) never change.
            if (!phoneLinkedRef.current) {
                const confirmation = mobileConfirmationRef.current;
                if (!confirmation) {
                    popup.error('Please request a new code.');
                    return;
                }
                await confirmation.confirm(code);
                phoneLinkedRef.current = true;
            }

            // Backend re-reads the linked number from Firebase Auth and is
            // the only code allowed to set mobileVerified.
            await confirmMobileVerified(mobile);

            setIsMobileVerified(true);
            setFormData((prev) => ({ ...prev, mobileVerified: true }));
            setMobileOtpStage('idle');
            setMobileOtp('');
            setMobileResendIn(0);
            resetMobileAuthState();
            popup.success('Mobile number verified successfully!');
        } catch (error) {
            console.error('Error verifying mobile code:', error);
            const code_ = (error as { code?: string })?.code;
            const message = (error as { message?: string })?.message;
            if (code_ === 'auth/code-invalid-verification-code' || code_ === 'auth/invalid-verification-code') {
                popup.error('Incorrect code. Please try again.');
            } else if (code_ === 'auth/code-expired' || code_ === 'auth/session-expired') {
                popup.error('This code has expired. Please request a new one.');
                resetMobileAuthState();
                setMobileOtpStage('idle');
                setMobileOtp('');
                setMobileResendIn(0);
            } else if (code_ === 'auth/too-many-requests' || code_ === 'auth/quota-exceeded') {
                popup.error('Too many attempts. Please wait a while before requesting a new code.');
            } else if (code_ && code_.startsWith('functions/')) {
                popup.warning(message || 'Verification failed. Please try again.');
            } else {
                popup.error(message || 'Something went wrong. Please try again.');
            }
        } finally {
            setVerifyingMobile(false);
        }
    };

    const handleCancelMobileOtp = () => {
        setMobileOtpStage('idle');
        setMobileOtp('');
        setMobileResendIn(0);
        resetMobileAuthState();
    };

    const handleInputChange = (field: keyof typeof formData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleChangePassword = async () => {
        const user = auth.currentUser;
        if (!user?.email) {
            popup.error('No email address found for your account');
            return;
        }

        setSendingResetLink(true);
        try {
            await sendPasswordResetMail({ email: user.email, baseUrl: window.location.origin });
            popup.success('Password reset link sent! Check your inbox.');
        } catch (error) {
            console.error('Error sending password reset link:', error);
            const code = (error as { code?: string })?.code;
            const message = (error as { message?: string })?.message;
            if (code === 'functions/not-found') {
                popup.error('No account found with this email');
            } else {
                popup.error(message || 'Failed to send password reset email');
            }
        } finally {
            setSendingResetLink(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-muted flex flex-col">
                <UserHeader />
                <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
                    <div className={`w-full flex flex-col ${activeTab === 'profile' ? 'lg:flex-row' : ''} gap-8`}>
                        {activeTab === 'profile' && (
                            <div className="w-full lg:w-[350px] flex-shrink-0">
                                <ProfileCardSkeleton />
                            </div>
                        )}
                        <div className="flex-1 space-y-6">
                            <ContentCardSkeleton lines={4} />
                            <ContentCardSkeleton lines={3} />
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-muted flex flex-col">
            <UserHeader />

            {/* Invisible reCAPTCHA widget for Firebase Phone Auth — kept at
                root so it never unmounts mid-flow (e.g. toggling edit mode). */}
            <div id="mobile-otp-recaptcha" />

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
                <div className={`w-full flex flex-col ${activeTab === 'profile' ? 'lg:flex-row' : ''} gap-8 relative`}>
                    
                    {/* Left Column - Profile Card (Only shown in Profile tab) */}
                    {activeTab === 'profile' && (
                        <div className="w-full lg:w-[350px] flex-shrink-0">
                            <div className="sticky top-24">
                                <div className="bg-surface rounded-2xl border border-border shadow-md overflow-hidden group">
                                    <div className="h-24 bg-ink/70 relative">
                                        <button
                                            onClick={() => setIsEditingProfile(!isEditingProfile)}
                                            className="absolute top-3 right-3 p-1.5 bg-black/30 hover:bg-black/50 backdrop-blur-sm rounded-lg text-surface transition-colors border border-surface/20"
                                            title="Edit Profile Info"
                                        >
                                            {isEditingProfile ? <X className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>

                                    <div className="px-5 pb-5 relative">
                                        <div
                                            className={`w-24 h-24 rounded-full bg-surface flex items-center justify-center border-4 border-surface mx-auto -mt-12 mb-3 relative z-10 ${isEditingProfile ? 'cursor-pointer' : ''}`}
                                            onClick={() => {
                                                if (isEditingProfile && !imageUploading) profileImageInputRef.current?.click();
                                            }}
                                            onKeyDown={(e) => {
                                                if (e.target !== e.currentTarget) return;
                                                if (isEditingProfile && (e.key === 'Enter' || e.key === ' ')) {
                                                    e.preventDefault();
                                                    profileImageInputRef.current?.click();
                                                }
                                            }}
                                            role={isEditingProfile ? 'button' : undefined}
                                            tabIndex={isEditingProfile ? 0 : undefined}
                                            aria-label={isEditingProfile ? 'Add a profile photo' : undefined}
                                            title={isEditingProfile ? 'Add profile photo' : undefined}
                                        >
                                            <div
                                                className={`w-full h-full rounded-full flex items-center justify-center p-1 transition-all duration-500`}
                                                style={{
                                                    background: `conic-gradient(${formData.profileScore >= 75 ? '#0a0a0a' : formData.profileScore >= 40 ? '#737373' : '#ff6600'} ${formData.profileScore * 3.6}deg, #e5e5e5 0deg)`
                                                }}
                                            >
                                                <div className="relative w-full h-full bg-surface rounded-full flex items-center justify-center overflow-hidden shadow-inner text-ink/40">
                                                    {profileImage ? (
                                                        <img
                                                            src={profileImage}
                                                            alt="Profile"
                                                            className="h-full w-full rounded-full object-cover"
                                                        />
                                                    ) : (
                                                        <User className={`w-9 h-9 ${formData.profileScore >= 75 ? 'text-ink' : formData.profileScore >= 40 ? 'text-muted-foreground' : 'text-brand'}`} />
                                                    )}
                                                </div>
                                            </div>
                                            {isEditingProfile && (
                                                <span
                                                    aria-hidden="true"
                                                    className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-brand text-surface shadow-sm"
                                                >
                                                    {imageUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                                                </span>
                                            )}
                                            {isEditingProfile && profileImage && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveProfileImage();
                                                    }}
                                                    title="Remove profile photo"
                                                    aria-label="Remove profile photo"
                                                    className="absolute -bottom-1 -left-1 flex h-6 w-6 items-center justify-center rounded-lg border-2 border-surface bg-ink/70 text-surface shadow-sm transition-colors hover:bg-destructive"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            )}
                                        </div>
                                        <input
                                            ref={profileImageInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleProfileImageChange}
                                        />
                                        
                                        {isEditingProfile ? (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="block text-[9px] uppercase font-bold text-ink/60 mb-0.5">First Name</label>
                                                        <input type="text" value={formData.firstName} onChange={(e) => handleInputChange('firstName', e.target.value)} className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-ink focus:ring-2 focus:ring-brand/20 focus:border-ink outline-none" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[9px] uppercase font-bold text-ink/60 mb-0.5">Last Name</label>
                                                        <input type="text" value={formData.lastName} onChange={(e) => handleInputChange('lastName', e.target.value)} className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-ink focus:ring-2 focus:ring-brand/20 focus:border-ink outline-none" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] uppercase font-bold text-ink/60 mb-0.5">Role</label>
                                                    <input type="text" value={formData.department} onChange={(e) => handleInputChange('department', e.target.value)} placeholder="e.g. Frontend Developer" className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-ink focus:ring-2 focus:ring-brand/20 focus:border-ink outline-none" />
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] uppercase font-bold text-ink/60 mb-0.5">Mobile</label>
                                                    <input type="tel" value={formData.mobile} onChange={(e) => handleInputChange('mobile', e.target.value)} className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-ink focus:ring-2 focus:ring-brand/20 focus:border-ink outline-none" />
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] uppercase font-bold text-ink/60 mb-0.5">Years of Experience</label>
                                                    <input type="number" value={formData.yearsOfExperience} onChange={(e) => handleInputChange('yearsOfExperience', e.target.value)} placeholder="e.g. 3" className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-ink focus:ring-2 focus:ring-brand/20 focus:border-ink outline-none" />
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] uppercase font-bold text-ink/60 mb-0.5">Address</label>
                                                    <textarea value={formData.address} onChange={(e) => handleInputChange('address', e.target.value)} placeholder="City, State" className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-ink focus:ring-2 focus:ring-brand/20 focus:border-ink outline-none resize-none h-12" />
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] uppercase font-bold text-ink/60 mb-0.5">Password</label>
                                                    <div className="flex items-center justify-between gap-2 px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-ink/60">
                                                        <span>••••••••</span>
                                                        <button
                                                            type="button"
                                                            disabled={sendingResetLink}
                                                            onClick={handleChangePassword}
                                                            className="flex items-center gap-1.5 text-brand font-bold hover:underline disabled:opacity-50 disabled:no-underline"
                                                        >
                                                            {sendingResetLink ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                                                            {sendingResetLink ? 'Sending…' : 'Change Password'}
                                                        </button>
                                                    </div>
                                                </div>
                                                <button disabled={saving} onClick={handleSaveProfileCard} className="w-full mt-2 py-1.5 border border-ink/70 bg-ink/70 text-surface text-xs font-semibold rounded-lg hover:border-brand hover:bg-brand hover:text-ink transition-colors disabled:opacity-50">
                                                    {saving ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Save Details'}
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="text-center">
                                                <h1 className="text-lg font-black text-ink tracking-tight">{formData.firstName} {formData.lastName}</h1>
                                                {formData.department ? (
                                                    <p className="text-xs text-ink/70 font-bold mt-1 mb-3 bg-border inline-block px-3 py-1 rounded-lg">{formData.department}</p>
                                                ) : (
                                                    <button onClick={() => setIsEditingProfile(true)} className="text-[10px] text-brand font-bold mt-1 mb-3 bg-brand/10 hover:bg-brand/20 transition-colors inline-block px-3 py-1 rounded-lg border border-brand/20">+ Add your role</button>
                                                )}

                                                <div className="space-y-3 text-left border-t border-border pt-5 pb-2">
                                                    <div className="flex items-center gap-3 text-sm text-ink/60">
                                                        <Mail className="w-4 h-4 text-ink/40 flex-shrink-0" />
                                                        <span className="truncate leading-none">{formData.email}</span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-sm text-ink/60">
                                                        <Phone className="w-4 h-4 text-ink/40 flex-shrink-0" />
                                                        <span className="leading-none">{formData.mobile || <span className="text-ink/40">No mobile added</span>}</span>
                                                    </div>
                                                    {formData.yearsOfExperience && (
                                                        <div className="flex items-center gap-3 text-sm text-ink/60">
                                                            <Briefcase className="w-4 h-4 text-ink/40 flex-shrink-0" />
                                                            <span className="leading-none">{formData.yearsOfExperience} Years Experience</span>
                                                        </div>
                                                    )}
                                                    {formData.address && (
                                                        <div className="flex items-start gap-3 text-sm text-ink/60">
                                                            <MapPin className="w-4 h-4 text-ink/40 flex-shrink-0 mt-0.5" />
                                                            <span className="whitespace-pre-wrap leading-tight">{formData.address}</span>
                                                        </div>
                                                    )}

                                                    {/* Email Verification Status */}
                                                    <div className="pt-3 border-t border-border mt-2">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                {isEmailVerified ? (
                                                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                                                ) : (
                                                                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                                                                )}
                                                                <span className={`text-[11px] font-bold uppercase ${isEmailVerified ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                                    {isEmailVerified ? 'Email Verified' : 'Verify Email'}
                                                                </span>
                                                            </div>
                                                            {!isEmailVerified && (
                                                                <button 
                                                                    onClick={handleVerifyEmail}
                                                                    disabled={verifyingEmail}
                                                                    className="text-[10px] font-bold text-brand hover:text-brand disabled:opacity-50 transition-all active:scale-95"
                                                                >
                                                                    {verifyingEmail ? 'Sending...' : 'Verify Now'}
                                                                </button>
                                                            )}
                                                            {isEmailVerified && (
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Mobile Verification Status */}
                                                    <div className="pt-3 border-t border-border mt-2">
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                {isMobileVerified ? (
                                                                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                                                                ) : (
                                                                    <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                                                                )}
                                                                <span className={`text-[11px] font-bold uppercase ${isMobileVerified ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                                    {isMobileVerified ? 'Mobile Verified' : 'Verify Mobile'}
                                                                </span>
                                                            </div>
                                                            {!isMobileVerified && mobileOtpStage === 'idle' && (
                                                                normalizeMobile(formData.mobile) ? (
                                                                    <button
                                                                        onClick={handleSendMobileOtp}
                                                                        disabled={verifyingMobile}
                                                                        className="text-[10px] font-bold text-brand hover:text-brand disabled:opacity-50 transition-all active:scale-95"
                                                                    >
                                                                        {verifyingMobile ? 'Sending...' : 'Verify Now'}
                                                                    </button>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => setIsEditingProfile(true)}
                                                                        className="text-[10px] font-bold text-brand hover:text-brand transition-all active:scale-95"
                                                                    >
                                                                        Add Number
                                                                    </button>
                                                                )
                                                            )}
                                                            {isMobileVerified && (
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                                            )}
                                                        </div>

                                                        {/* OTP entry after the code has been sent */}
                                                        {!isMobileVerified && mobileOtpStage === 'code' && (
                                                            <form onSubmit={handleVerifyMobileOtp} className="mt-3 space-y-2">
                                                                <p className="text-[10px] text-ink/60 font-semibold">
                                                                    Enter the 6-digit code sent to +91 {normalizeMobile(formData.mobile) || formData.mobile}
                                                                </p>
                                                                <input
                                                                    type="text"
                                                                    inputMode="numeric"
                                                                    autoComplete="one-time-code"
                                                                    maxLength={6}
                                                                    value={mobileOtp}
                                                                    onChange={(e) => setMobileOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                                    placeholder="______"
                                                                    className="w-full px-3 py-1.5 bg-surface border border-border rounded-lg text-center text-sm font-mono tracking-[0.4em] text-ink outline-none focus:border-ink focus:ring-2 focus:ring-brand/20"
                                                                />
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={handleCancelMobileOtp}
                                                                        className="text-[10px] font-bold text-ink/60 hover:text-ink transition-colors"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                    <div className="flex items-center gap-3">
                                                                        <button
                                                                            type="button"
                                                                            onClick={handleSendMobileOtp}
                                                                            disabled={verifyingMobile || mobileResendIn > 0}
                                                                            className="text-[10px] font-bold text-brand hover:text-brand disabled:text-ink/40 disabled:cursor-not-allowed transition-colors"
                                                                        >
                                                                            {mobileResendIn > 0 ? `Resend in ${mobileResendIn}s` : 'Resend'}
                                                                        </button>
                                                                        <button
                                                                            type="submit"
                                                                            disabled={verifyingMobile || mobileOtp.length !== 6}
                                                                            className="text-[10px] font-bold px-3 py-1 border border-ink/70 bg-ink/70 text-surface rounded-lg hover:border-ink/60 hover:bg-ink/60 transition-colors disabled:opacity-50"
                                                                        >
                                                                            {verifyingMobile ? 'Verifying...' : 'Verify Code'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </form>
                                                        )}
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
                            {activeTab === 'recommendations' && <RecommendationsView />}
                            {activeTab === 'subscription' && <UserSubscriptionView />}
                            {(activeTab === 'jobs' || activeTab === 'applications') && (
                                /* key forces a fresh mount on tab switch so filters,
                                   search, and the sidebar reset instead of leaking
                                   from Find Jobs into My Applications (and back). */
                                <JobsAndApplicationsView
                                    key={activeTab}
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
