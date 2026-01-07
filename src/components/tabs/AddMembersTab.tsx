import { useState, useEffect } from 'react';
import { UserPlus, Search, Mail, Phone } from 'lucide-react';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '@/lib/firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { supabase } from '@/lib/supabase';
import toast from 'react-hot-toast';
import { createManagerInviteNotification } from '@/lib/notificationHelper';

interface UserData {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    department: string;
    role: 'manager' | 'user';
}

export default function AddMembersTab() {
    const [members, setMembers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        mobile: '',
        department: '',
        password: ''
    });
    const [addingMember, setAddingMember] = useState(false);

    useEffect(() => {
        fetchMembers();
    }, []);

    const fetchMembers = async () => {
        try {
            setLoading(true);
            const q = query(collection(db, 'users'), where('role', '==', 'manager'));
            const snapshot = await getDocs(q);
            const membersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
            setMembers(membersData);
        } catch (error) {
            console.error('Error fetching members:', error);
            toast.error('Failed to load members');
        } finally {
            setLoading(false);
        }
    };

    const sendWelcomeEmail = async (email: string, name: string, password: string) => {
        try {
            const { data, error } = await supabase.functions.invoke('manager_invite', {
                body: {
                    email,
                    name,
                    password,
                    baseUrl: window.location.origin,
                },
            });

            if (error || !data?.success) {
                console.error('Email send error:', error || data?.error);
                return false;
            }
            return true;
        } catch (error) {
            console.error('Error sending email:', error);
            return false;
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddingMember(true);

        try {
            // Generate a temporary password
            const tempPassword = Math.random().toString(36).slice(-8);

            // Create user in Firebase Auth using a secondary app instance
            // This prevents logging out the current admin user
            const secondaryApp = initializeApp(firebaseConfig, `Secondary-${Date.now()}`);
            const secondaryAuth = getAuth(secondaryApp);
            const userCredential = await createUserWithEmailAndPassword(secondaryAuth, formData.email, tempPassword);
            const user = userCredential.user;

            // Store user data in Firestore with matching UID
            await setDoc(doc(db, 'users', user.uid), {
                firstName: formData.firstName,
                lastName: formData.lastName,
                email: formData.email,
                mobile: formData.mobile,
                department: formData.department,
                role: 'manager',
                createdAt: new Date().toISOString()
            });

            // Sign out the temp user from secondary app to clean up
            await signOut(secondaryAuth);

            // Send welcome email
            const emailSent = await sendWelcomeEmail(formData.email, formData.firstName, tempPassword);

            if (emailSent) {
                // Create notification for the new manager
                try {
                    await createManagerInviteNotification(formData.email, formData.firstName);
                } catch (err) {
                    console.error('Failed to create notification', err);
                }

                toast.success('Member added and welcome email sent!');
            } else {
                toast.success('Member added, but failed to send welcome email automatically.');
            }
            setIsModalOpen(false);
            setFormData({ firstName: '', lastName: '', email: '', mobile: '', department: '', password: '' });
            fetchMembers();

        } catch (error) {
            console.error('Error adding member:', error);
            toast.error('Failed to add member');
        } finally {
            setAddingMember(false);
        }
    };

    const filteredMembers = members.filter(m =>
        m.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="min-h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6 flex-1 flex flex-col">
            {/* Header Section - Similar to Job Posts */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    {/* Title and Description */}
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-xl font-bold text-gray-900">Team Members</h2>
                            <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold border border-gray-200">
                                {members.length}
                            </span>
                        </div>
                        <p className="text-sm text-gray-500">Manage your recruitment team and assign manager roles</p>
                    </div>

                    {/* Search and Add Button Controls */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:flex-1 md:flex-initial md:w-auto">
                        <div className="relative flex-1 sm:w-64 md:w-72">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="h-4 w-4 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                placeholder="Search members..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 sm:text-sm transition-all duration-200"
                            />
                        </div>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-orange-gradient text-white rounded-lg text-sm font-bold hover:shadow-lg hover:shadow-orange-500/20 active:scale-95 transition-all whitespace-nowrap"
                        >
                            <UserPlus className="w-4 h-4" />
                            <span className="hidden sm:inline">Add Members</span>
                            <span className="sm:hidden">Add Member</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Member Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {filteredMembers.map(member => (
                    <div key={member.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-lg hover:border-primary-200 transition-all duration-200 group">
                        {/* Avatar and Badge */}
                        <div className="flex flex-col items-center mb-4">
                            <div className="w-20 h-20 bg-gradient-to-br from-primary-100 to-orange-100 rounded-full flex items-center justify-center text-primary-600 font-bold text-2xl mb-3 group-hover:scale-105 transition-transform duration-200">
                                {member.firstName?.[0]}{member.lastName?.[0]}
                            </div>
                            <span className="bg-green-50 text-green-700 text-xs font-bold px-3 py-1 rounded-full border border-green-200">
                                MANAGER
                            </span>
                        </div>

                        {/* Name and Department */}
                        <div className="text-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900 mb-1">{member.firstName} {member.lastName}</h3>
                            <p className="text-sm text-gray-500">{member.department || 'No Department'}</p>
                        </div>

                        {/* Contact Info */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-center text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg group-hover:bg-primary-50 transition-colors">
                                <Mail className="w-4 h-4 text-gray-400 flex-shrink-0 mr-2" />
                                <span className="truncate" title={member.email}>{member.email}</span>
                            </div>
                            <div className="flex items-center justify-center text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg group-hover:bg-primary-50 transition-colors">
                                <Phone className="w-4 h-4 text-gray-400 flex-shrink-0 mr-2" />
                                <span>{member.mobile || 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
                        <h3 className="text-xl font-bold text-gray-900 mb-6">Add New Member</h3>

                        <form onSubmit={handleAddMember} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">First Name</label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.firstName}
                                        onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Last Name</label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.lastName}
                                        onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Email Address</label>
                                <input
                                    required
                                    type="email"
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Mobile Number</label>
                                <input
                                    required
                                    type="tel"
                                    value={formData.mobile}
                                    onChange={e => setFormData({ ...formData, mobile: e.target.value })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Department</label>
                                <select
                                    required
                                    value={formData.department}
                                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none transition-all"
                                >
                                    <option value="">Select Department</option>
                                    <option value="IT">IT</option>
                                    <option value="HR">HR</option>
                                    <option value="Engineering">Engineering</option>
                                    <option value="Sales">Sales</option>
                                    <option value="Marketing">Marketing</option>
                                </select>
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-2.5 text-gray-700 font-bold bg-gray-100 hover:bg-gray-200 rounded-lg transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={addingMember}
                                    className="flex-1 py-2.5 text-white font-bold bg-orange-gradient hover:opacity-90 rounded-lg transition-all shadow-lg shadow-orange-500/20 disabled:opacity-50"
                                >
                                    {addingMember ? 'Adding...' : 'Add Member'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
