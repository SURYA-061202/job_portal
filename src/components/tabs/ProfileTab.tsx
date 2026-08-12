import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { User, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

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

    useEffect(() => {
        const fetchProfile = async () => {
            if (auth.currentUser) {
                try {
                    const docSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
                    if (docSnap.exists()) {
                        const data = docSnap.data() as UserData;
                        setUserData(data);
                        setFormData(data);
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
                firstName: formData.firstName,
                lastName: formData.lastName,
                mobile: formData.mobile,
                department: formData.department,
                role: formData.role
            });

            setUserData(formData);
            setIsEditing(false);
            toast.success("Profile updated successfully");
        } catch (error) {
            console.error("Error updating profile:", error);
            toast.error("Failed to update profile");
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setFormData(userData);
        setIsEditing(false);
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
            <div className="w-full max-w-[60rem] bg-surface rounded-2xl sm:rounded-3xl border border-brand/20 p-4 sm:p-6">

                {/* Header Section */}
                <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 mb-6 border-b border-brand/10 pb-5">
                    <div className="relative">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-brand flex items-center justify-center shadow-lg shadow-brand/20">
                            <User className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
                        </div>
                        <div className="absolute bottom-0 right-0 sm:bottom-1 sm:right-1 w-4 h-4 sm:w-5 sm:h-5 bg-green-500 border-2 sm:border-4 border-white rounded-full"></div>
                    </div>
                    <div className="text-center sm:text-left">
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Personal Information</h1>
                        <p className="text-brand text-sm mt-1">Update your personal details</p>
                    </div>
                </div>

                {/* Form Section */}
                <div>
                    <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4">Profile Details</h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 sm:gap-x-12 gap-y-4">
                        {/* First Name */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">First Name</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    name="firstName"
                                    value={formData.firstName}
                                    onChange={handleInputChange}
                                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-brand/30 rounded-xl text-gray-900 focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all text-sm sm:text-base"
                                />
                            ) : (
                                <div className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-brand/5 border border-brand/20 rounded-xl text-gray-900 font-medium text-sm sm:text-base">
                                    {userData.firstName}
                                </div>
                            )}
                        </div>

                        {/* Last Name */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Last Name</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    name="lastName"
                                    value={formData.lastName}
                                    onChange={handleInputChange}
                                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-brand/30 rounded-xl text-gray-900 focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all text-sm sm:text-base"
                                />
                            ) : (
                                <div className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-brand/5 border border-brand/20 rounded-xl text-gray-900 font-medium text-sm sm:text-base">
                                    {userData.lastName}
                                </div>
                            )}
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">
                                Email <span className="text-brand font-normal text-xs ml-1">(Not editable)</span>
                            </label>
                            <div className={`w-full px-3 sm:px-4 py-2 sm:py-2.5 border border-brand/20 rounded-xl text-gray-500 font-medium text-sm sm:text-base ${isEditing ? 'bg-brand/10 cursor-not-allowed' : 'bg-brand/5'}`}>
                                {userData.email}
                            </div>
                        </div>

                        {/* Phone */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Phone</label>
                            {isEditing ? (
                                <input
                                    type="tel"
                                    name="mobile"
                                    value={formData.mobile || ''}
                                    onChange={handleInputChange}
                                    placeholder="+91..."
                                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-brand/30 rounded-xl text-gray-900 focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all text-sm sm:text-base"
                                />
                            ) : (
                                <div className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-brand/5 border border-brand/20 rounded-xl text-gray-900 font-medium text-sm sm:text-base">
                                    {userData.mobile || '+919087654321'}
                                </div>
                            )}
                        </div>

                        {/* Department */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Department</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    name="department"
                                    value={formData.department || ''}
                                    onChange={handleInputChange}
                                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-brand/30 rounded-xl text-gray-900 focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all text-sm sm:text-base"
                                />
                            ) : (
                                <div className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-brand/5 border border-brand/20 rounded-xl text-gray-900 font-medium text-sm sm:text-base">
                                    {userData.department || 'None'}
                                </div>
                            )}
                        </div>

                        {/* Role */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1.5">Role</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    name="role"
                                    value={formData.role}
                                    onChange={handleInputChange}
                                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-white border border-brand/30 rounded-xl text-gray-900 focus:ring-2 focus:ring-brand focus:border-transparent outline-none transition-all capitalize text-sm sm:text-base"
                                />
                            ) : (
                                <div className="w-full px-3 sm:px-4 py-2 sm:py-2.5 bg-brand/5 border border-brand/20 rounded-xl text-gray-900 font-medium capitalize text-sm sm:text-base">
                                    {userData.role}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer / Buttons */}
                    <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row justify-end gap-3">
                        {isEditing ? (
                            <>
                                <button
                                    onClick={handleCancel}
                                    className="w-full sm:w-auto px-6 py-2.5 sm:py-3 bg-surface border border-brand/30 text-gray-700 font-bold rounded-xl hover:bg-brand/10 transition-all duration-200 text-sm"
                                    disabled={saving}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={saving}
                                    className="w-full sm:w-auto px-8 py-2.5 sm:py-3 bg-brand text-white font-bold rounded-xl hover:shadow-lg hover:shadow-brand/30 hover:scale-[1.02] transition-all duration-200 shadow-md text-sm flex items-center justify-center gap-2"
                                >
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Save Changes
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="w-full sm:w-auto px-8 py-2.5 sm:py-3 bg-brand text-white font-bold rounded-xl hover:shadow-lg hover:shadow-brand/30 hover:scale-[1.02] transition-all duration-200 shadow-md text-sm"
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
