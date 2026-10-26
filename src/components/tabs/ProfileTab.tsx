import { useEffect, useRef, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { User, Loader2, KeyRound, Camera, X } from 'lucide-react';
import popup from '@/components/ui/Popup';
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

interface ProfileTabProps {
    embedded?: boolean;
    onLogout?: () => void;
    /** Edit mode driven from outside (the edit icon beside the panel title). */
    editing?: boolean;
    onEditingChange?: (editing: boolean) => void;
}

export default function ProfileTab({ embedded = false, onLogout, editing, onEditingChange }: ProfileTabProps) {
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

    // Keep edit mode in step with the parent's edit icon, and tell it when it changes here.
    useEffect(() => {
        if (editing !== undefined && editing !== isEditing) {
            if (!editing) setFormData(userData);
            setIsEditing(editing);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editing]);
    useEffect(() => {
        onEditingChange?.(isEditing);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEditing]);

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
                    popup.error("Failed to load profile");
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
            popup.success("Profile updated successfully");
        } catch (error) {
            console.error("Error updating profile:", error);
            const message = error instanceof Error ? error.message : '';
            popup.error(message ? `Failed to update profile: ${message}` : "Failed to update profile");
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
            if (!auth.currentUser) return;

            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
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
        if (!auth.currentUser || imageUploading) return;

        setImageUploading(true);
        try {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
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

    const handleChangePassword = async () => {
        const email = auth.currentUser?.email || userData?.email;
        if (!email) {
            popup.error('No email address found for your account');
            return;
        }

        setSendingReset(true);
        try {
            await sendPasswordResetMail({ email, baseUrl: window.location.origin });
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

    if (embedded) {
        const fullName = `${userData.firstName} ${userData.lastName}`.trim() || 'Your name';
        const fieldLabel = 'text-xs font-bold text-ink';
        const inputCls = `mt-1 w-full rounded-lg px-3 py-2 text-sm ${skin.field} ${FOCUS}`;
        const readOnly = (value: string) => (
            <p className="mt-0.5 break-words text-sm text-ink/80">{value}</p>
        );
        const addLink = (
            <button type="button" onClick={() => setIsEditing(true)} className={`mt-0.5 cursor-pointer text-sm font-medium text-ink underline underline-offset-2 ${FOCUS}`}>
                + Add
            </button>
        );
        return (
            <div className="flex min-h-full flex-col">
                <div className="flex flex-col items-center px-6 pb-5 pt-6">
                    <div className="relative">
                        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-ink/10">
                            {profileImage ? (
                                <img src={profileImage} alt="Profile" className="h-full w-full object-cover" />
                            ) : (
                                <User className="h-10 w-10 text-ink/50" aria-hidden="true" />
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => !imageUploading && profileImageInputRef.current?.click()}
                            aria-label="Change profile photo"
                            title="Change profile photo"
                            className={`absolute bottom-0 right-0 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-surface bg-ink text-surface shadow-sm ${FOCUS}`}
                        >
                            {imageUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" aria-hidden="true" />}
                        </button>
                        <input ref={profileImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfileImageChange} />
                    </div>
                    <h2 className="mt-3 text-center text-xl font-bold text-ink">{fullName}</h2>
                    {isEditing && profileImage && (
                        <button type="button" onClick={handleRemoveProfileImage} disabled={imageUploading} className={`mt-2 cursor-pointer text-xs font-medium text-destructive ${FOCUS}`}>
                            Remove photo
                        </button>
                    )}
                </div>

                <div className={`space-y-4 border-t ${skin.edge} px-6 py-5`}>
                    <div>
                        <p className={fieldLabel}>First name</p>
                        {isEditing ? <input type="text" name="firstName" value={formData.firstName} onChange={handleInputChange} className={inputCls} /> : (userData.firstName ? readOnly(userData.firstName) : addLink)}
                    </div>
                    <div>
                        <p className={fieldLabel}>Last name</p>
                        {isEditing ? <input type="text" name="lastName" value={formData.lastName} onChange={handleInputChange} className={inputCls} /> : (userData.lastName ? readOnly(userData.lastName) : addLink)}
                    </div>
                    <div>
                        <p className={fieldLabel}>Mobile number</p>
                        {isEditing ? <input type="tel" name="mobile" value={formData.mobile || ''} onChange={handleInputChange} placeholder="+91..." className={inputCls} /> : (userData.mobile ? readOnly(userData.mobile) : addLink)}
                    </div>
                    <div>
                        <p className={fieldLabel}>Email address</p>
                        {readOnly(userData.email || '-')}
                        {isEditing && <p className="mt-0.5 text-xs text-ink/50">Email can't be changed.</p>}
                    </div>
                    <div>
                        <p className={fieldLabel}>Department</p>
                        {isEditing ? <input type="text" name="department" value={formData.department || ''} onChange={handleInputChange} className={inputCls} /> : (userData.department ? readOnly(userData.department) : addLink)}
                    </div>

                    {isEditing ? (
                        <div className="flex gap-3 pt-1">
                            <button type="button" onClick={handleCancel} disabled={saving} className={`flex-1 cursor-pointer rounded-lg ${skin.secondary} ${FOCUS}`}>
                                Cancel
                            </button>
                            <button type="button" onClick={handleSave} disabled={saving} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg ${skin.cta} ${FOCUS}`}>
                                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                                Save
                            </button>
                        </div>
                    ) : (
                        <button type="button" onClick={handleChangePassword} disabled={sendingReset} className={`inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink underline underline-offset-2 ${FOCUS}`}>
                            {sendingReset ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
                            Change password
                        </button>
                    )}
                </div>

                {onLogout && !isEditing && (
                    <div className={`mt-auto border-t ${skin.edge}`}>
                        <button type="button" onClick={onLogout} className={`w-full cursor-pointer px-6 py-4 text-center text-sm font-semibold text-destructive transition-colors hover:bg-destructive/10 ${FOCUS}`}>
                            Log out
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className={embedded ? 'w-full p-4' : 'w-full h-full flex items-center justify-center p-4 sm:p-6'}>
            <div className={embedded ? 'w-full' : `w-full max-w-[60rem] p-4 sm:p-6 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>

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
                                        className="absolute bottom-0 left-0 sm:bottom-0.5 sm:left-0 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full border-2 border-white bg-ink/70 text-surface shadow-sm transition-colors hover:bg-destructive"
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
                        <p className="text-ink text-sm mt-1">Update your personal details</p>
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
                                <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-ink font-medium text-sm sm:text-base border ${skin.edge} ${skin.canvas} rounded-lg`}>
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
                                <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-ink font-medium text-sm sm:text-base border ${skin.edge} ${skin.canvas} rounded-lg`}>
                                    {userData.lastName}
                                </div>
                            )}
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-sm font-bold text-ink/80 mb-1.5">
                                Email <span className="text-brand font-normal text-xs ml-1">(Not editable)</span>
                            </label>
                            <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-ink/60 font-medium text-sm sm:text-base border ${skin.edge} ${skin.canvas} rounded-lg cursor-not-allowed`}>
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
                                <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-ink font-medium text-sm sm:text-base border ${skin.edge} ${skin.canvas} rounded-lg`}>
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
                                <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-ink font-medium text-sm sm:text-base border ${skin.edge} ${skin.canvas} rounded-lg`}>
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
                                <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 text-ink font-medium capitalize text-sm sm:text-base border ${skin.edge} ${skin.canvas} rounded-lg`}>
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
