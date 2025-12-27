import { useState, useEffect } from 'react';
import { UserPlus, Search, Mail, Phone } from 'lucide-react';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import toast from 'react-hot-toast';

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
            // Using the same mailto approach as InterviewInviteModal
            const subject = encodeURIComponent('Welcome to Indian Infra Recruitment Portal');
            const body = encodeURIComponent(
                `Dear ${name},\n\n` +
                `Welcome to the Indian Infra Recruitment Portal!\n\n` +
                `You have been added as a Manager to our recruitment team.\n\n` +
                `Your login credentials:\n` +
                `Email: ${email}\n` +
                `Temporary Password: ${password}\n\n` +
                `Please login and change your password immediately.\n\n` +
                `Best regards,\n` +
                `Indian Infra Recruitment Team`
            );

            window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
            return true;
        } catch (error) {
            console.error('Error preparing email:', error);
            throw error;
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddingMember(true);

        try {
            // Generate a temporary password
            const tempPassword = Math.random().toString(36).slice(-8);

            await addDoc(collection(db, 'users'), {
                firstName: formData.firstName,
                lastName: formData.lastName,
                email: formData.email,
                mobile: formData.mobile,
                department: formData.department,
                role: 'manager',
                createdAt: new Date().toISOString()
            });

            // Send welcome email
            await sendWelcomeEmail(formData.email, formData.firstName, tempPassword);

            toast.success('Member added! Email client opened for invitation.');
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
        <div className="p-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Team Members</h2>
                    <p className="text-gray-600">Manage your recruitment team</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-orange-gradient text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-orange-500/20 hover:opacity-90 transition-all flex items-center gap-2"
                >
                    <UserPlus className="w-5 h-5" />
                    Add Member
                </button>
            </div>

            <div className="mb-6 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                    type="text"
                    placeholder="Search members..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredMembers.map(member => (
                    <div key={member.id} className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all group flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center text-primary-600 font-bold text-2xl mb-3 mx-auto">
                            {member.firstName?.[0]}{member.lastName?.[0]}
                        </div>

                        <span className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full mb-4">
                            MANAGER
                        </span>

                        <h3 className="text-xl font-bold text-gray-900 mb-1">{member.firstName} {member.lastName}</h3>
                        <p className="text-sm text-gray-500 mb-6">{member.department || 'No Department'}</p>

                        <div className="w-full space-y-3">
                            <div className="flex items-center justify-center text-sm text-gray-600 bg-gray-50 py-2 rounded-lg">
                                <Mail className="w-4 h-4 mr-2 text-gray-400" />
                                <span className="truncate max-w-[180px]">{member.email}</span>
                            </div>
                            <div className="flex items-center justify-center text-sm text-gray-600 bg-gray-50 py-2 rounded-lg">
                                <Phone className="w-4 h-4 mr-2 text-gray-400" />
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
