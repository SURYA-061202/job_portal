import { useEffect, useRef, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { User, Loader2, KeyRound, Camera, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useSkin, FOCUS } from '@/styles/skin';
import { sendPasswordResetMail } from '@/lib/emailFunctions';

interface UserData {
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    department: string;
    role: string;
}

export default function ProfileTab() {
    const [userData, setUserData] = useState<UserData | null>(null);
    const [formData, setFormData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [sendingReset, setSendingReset] = useState(false);
    const [profileImage, setProfileImage] = useState('');
    const [imageUploading, setImageUploading] = useState(false);
    const profileImageInputRef = useRef<HTMLInputElement>(null);
    const skin = useSkin();

    useEffect(() => {
        const fetchProfile = async () => {
            if (auth.currentUser) {
                try {
                    const docSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
                    if (docSnap.exists()) {
                        const raw = docSnap.data() as Partial<UserData> & { profileImage?: string };
                        // Normalize: docs created at signup/invite may be missing
                        // fields, and updateDoc rejects undefined values.
                        const data: UserData = {
                            firstName: raw.firstName || '',
                            lastName: raw.lastName || '',
                            email: raw.email || '',
                            mobile: raw.mobile || '',
                            department: raw.department || '',
                            role: raw.role || ''
                        };
                        setUserData(data);
                        setFormData(data);
                        setProfileImage(raw.profileImage || '');
                    }
                } catch (error) {
                    console.error("Error fetching profile:", error);
                    toast.error("Failed to load profile");
                } finally {
                    setLoading(false);
                }
            }
        };

        fetchProfile();
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => prev ? { ...prev, [name]: value } : null);
    };

    const handleSave = async () => {
        if (!auth.currentUser || !formData) return;

        setSaving(true);
        try {
            const userRef = doc(db, 'users', auth.currentUser.uid);
            await updateDoc(userRef, {
                firstName: formData.firstName || '',
                lastName: formData.lastName || '',
                mobile: formData.mobile || '',
                department: formData.department || '',
                role: formData.role || '',
                updatedAt: new Date()
            });

            setUserData(formData);
            setIsEditing(false);
            toast.success("Profile updated successfully");
        } catch (error) {
            console.error("Error updating profile:", error);
            const message = error instanceof Error ? error.message : '';
            toast.error(message ? `Failed to update profile: ${message}` : "Failed to update profile");
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setFormData(userData);
        setIsEditing(false);
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
            toast.error('Please select an image file');
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
            if (!auth.currentUser) return;

            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                profileImage: resized,
                updatedAt: new Date()
            });
            setProfileImage(resized);
            toast.success('Profile photo updated!');
        } catch (error) {
            console.error('Error updating profile photo:', error);
            toast.error('Failed to update profile photo');
        } finally {
            setImageUploading(false);
        }
    };

    const handleRemoveProfileImage = async () => {
        if (!auth.currentUser || imageUploading) return;

        setImageUploading(true);
        try {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
                profileImage: '',
                updatedAt: new Date()
            });
            setProfileImage('');
            toast.success('Profile photo removed!');
        } catch (error) {
            console.error('Error removing profile photo:', error);
            toast.error('Failed to remove profile photo');
        } finally {
            setImageUploading(false);
        }
    };

    const handleChangePassword = async () => {
        const email = auth.currentUser?.email || userData?.email;
        if (!email) {
            toast.error('No email address found for your account');
            return;
        }

        setSendingReset(true);
        try {
            await sendPasswordResetMail({ email, baseUrl: window.location.origin });
            toast.success('Password reset link sent! Check your inbox.');
        } catch (error) {
            console.error('Error sending password reset link:', error);
            const code = (error as { code?: string })?.code;
            const message = (error as { message?: string })?.message;
            if (code === 'functions/not-found') {
                toast.error('No account found with this email');
            } else {
                toast.error(message || 'Failed to send password reset email');
            }
        } finally {
            setSendingReset(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
            </div>
        );
    }

    if (!userData || !formData) {
        return <div className="text-center p-8">Profile not found.</div>;
    }

    return (
        <div className="w-full h-full flex items-center justify-center p-4 sm:p-6">
            <div className={`w-full max-w-[60rem] p-4 sm:p-6 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>

                {/* Header Section */}
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 mb-6 border-b border-brand/10 pb-5">
                    <div className="relative">
                        <div
                            className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-brand flex items-center justify-center shadow-lg shadow-brand/20 overflow-hidden ${isEditing ? 'cursor-pointer' : ''}`}
                            onClick={() => {
                                if (isEditing && !imageUploading) profileImageInputRef.current?.click();
                            }}
                            onKeyDown={(e) => {
                                if (e.target !== e.currentTarget) return;
                                if (isEditing && (e.key === 'Enter' || e.key === ' ')) {
                                    e.preventDefault();
                                    profileImageInputRef.current?.click();
                                }
                            }}
                            role={isEditing ? 'button' : undefined}
                            tabIndex={isEditing ? 0 : undefined}
                            aria-label={isEditing ? 'Add a profile photo' : undefined}
                            title={isEditing ? 'Add profile photo' : undefined}
                        >
                            {profileImage ? (
                                <img
                                    src={profileImage}
                                    alt="Profile"
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                <User className="w-7 h-7 sm:w-8 sm:h-8 text-ink" />
                            )}
                        </div>
                        {isEditing ? (
                            <>
                                <span
                                    aria-hidden="true"
                                    className="absolute bottom-0 right-0 sm:bottom-0.5 sm:right-0 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full border-2 border-white bg-brand text-ink shadow-sm"
                                >
                                    {imageUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                                </span>
                                {profileImage && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveProfileImage();
                                        }}
                                        title="Remove profile photo"
                                        aria-label="Remove profile photo"
                                        className="absolute bottom-0 left-0 sm:bottom-0.5 sm:left-0 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full border-2 border-white bg-ink text-surface shadow-sm transition-colors hover:bg-destructive"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                )}
                            </>
                        ) : null}
                        <input
                            ref={profileImageInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleProfileImageChange}
                        />
                    </div>
                    <div className="text-center sm:text-left">
                        <h1 className={skin.heading}>Personal Information</h1>
                        <p className="text-brand text-sm mt-1">Update your personal details</p>
                    </div>
                </div>

                {/* Form Section */}
                <div>
                    <h2 className={`${skin.cardTitle} mb-4`}>Profile Details</h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 sm:gap-x-12 gap-y-4">
                        {/* First Name */}
                        <div>
                            <label className="block text-sm font-bold text-ink/80 mb-1.5">First Name</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    name="firstName"
                                    value={formData.firstName}
                                    onChange={handleInputChange}
                                    className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base rounded-lg ${skin.field} ${FOCUS}`}
                                />
                            ) : (
                                <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-ink font-medium text-sm sm:text-base border ${skin.edge} ${skin.surface} rounded-lg`}>
                                    {userData.firstName}
                                </div>
                            )}
                        </div>

                        {/* Last Name */}
                        <div>
                            <label className="block text-sm font-bold text-ink/80 mb-1.5">Last Name</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    name="lastName"
                                    value={formData.lastName}
                                    onChange={handleInputChange}
                                    className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base rounded-lg ${skin.field} ${FOCUS}`}
                                />
                            ) : (
                                <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-ink font-medium text-sm sm:text-base border ${skin.edge} ${skin.surface} rounded-lg`}>
                                    {userData.lastName}
                                </div>
                            )}
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-sm font-bold text-ink/80 mb-1.5">
                                Email <span className="text-brand font-normal text-xs ml-1">(Not editable)</span>
                            </label>
                            <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-ink/60 font-medium text-sm sm:text-base border ${skin.edge} rounded-lg ${isEditing ? `${skin.canvas} cursor-not-allowed` : skin.surface}`}>
                                {userData.email}
                            </div>
                        </div>

                        {/* Phone */}
                        <div>
                            <label className="block text-sm font-bold text-ink/80 mb-1.5">Phone</label>
                            {isEditing ? (
                                <input
                                    type="tel"
                                    name="mobile"
                                    value={formData.mobile || ''}
                                    onChange={handleInputChange}
                                    placeholder="+91..."
                                    className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base rounded-lg ${skin.field} ${FOCUS}`}
                                />
                            ) : (
                                <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-ink font-medium text-sm sm:text-base border ${skin.edge} ${skin.surface} rounded-lg`}>
                                    {userData.mobile || '+919087654321'}
                                </div>
                            )}
                        </div>

                        {/* Department */}
                        <div>
                            <label className="block text-sm font-bold text-ink/80 mb-1.5">Department</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    name="department"
                                    value={formData.department || ''}
                                    onChange={handleInputChange}
                                    className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base rounded-lg ${skin.field} ${FOCUS}`}
                                />
                            ) : (
                                <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-ink font-medium text-sm sm:text-base border ${skin.edge} ${skin.surface} rounded-lg`}>
                                    {userData.department || 'None'}
                                </div>
                            )}
                        </div>

                        {/* Role */}
                        <div>
                            <label className="block text-sm font-bold text-ink/80 mb-1.5">Role</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    name="role"
                                    value={formData.role}
                                    onChange={handleInputChange}
                                    className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 capitalize text-sm sm:text-base rounded-lg ${skin.field} ${FOCUS}`}
                                />
                            ) : (
                                <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-ink font-medium capitalize text-sm sm:text-base border ${skin.edge} ${skin.surface} rounded-lg`}>
                                    {userData.role}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer / Buttons */}
                    <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row justify-end gap-3">
                        {!isEditing && (
                            <button
                                onClick={handleChangePassword}
                                disabled={sendingReset}
                                className={`w-full sm:w-auto flex items-center justify-center gap-2 cursor-pointer rounded-lg ${skin.secondary} ${FOCUS}`}
                            >
                                {sendingReset ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                                Change Password
                            </button>
                        )}
                        {isEditing ? (
                            <>
                                <button
                                    onClick={handleCancel}
                                    className={`w-full sm:w-auto cursor-pointer rounded-lg ${skin.secondary} ${FOCUS}`}
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className={`w-full sm:w-auto flex items-center justify-center gap-2 cursor-pointer rounded-lg ${skin.cta} ${FOCUS} hover:scale-[1.02]`}
                                >
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Save Changes
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsEditing(true)}
                                className={`w-full sm:w-auto cursor-pointer rounded-lg ${skin.cta} ${FOCUS} hover:scale-[1.02]`}
                            >
                                Edit Profile
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
