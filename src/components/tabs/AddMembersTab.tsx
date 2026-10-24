import { useState, useEffect } from 'react';
import { UserPlus, Search, Mail, Phone, Building2, Briefcase, Pencil } from 'lucide-react';
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '@/lib/firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { sendManagerInvite } from '@/lib/emailFunctions';
import popup from '@/components/ui/Popup';
import { createManagerInviteNotification } from '@/lib/notificationHelper';
import { useSkin, FOCUS } from '@/styles/skin';

interface UserData {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    mobile: string;
    department: string;
    role: 'manager' | 'user' | 'admin' | 'recruiter';
    companyName?: string;
    /** The role this recruiter is hiring for. */
    hiringRole?: string;
    profileImage?: string;
}

export default function AddMembersTab({ onViewMember }: { onViewMember?: (memberId: string) => void }) {
    const [members, setMembers] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        firstName: '',
        lastName: '',
        email: '',
        mobile: '',
        companyName: '',
        hiringRole: '',
        password: ''
    });
    const [addingMember, setAddingMember] = useState(false);
    /** Set while the modal edits an existing recruiter instead of adding one. */
    const [editingId, setEditingId] = useState<string | null>(null);
    const skin = useSkin();

    useEffect(() => {
        fetchMembers();
    }, []);

    const fetchMembers = async () => {
        try {
            setLoading(true);
            const q = query(collection(db, 'users'), where('role', 'in', ['manager', 'recruiter']));
            const snapshot = await getDocs(q);
            const membersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserData));
            setMembers(membersData);
        } catch (error) {
            console.error('Error fetching members:', error);
            popup.error('Failed to load members');
        } finally {
            setLoading(false);
        }
    };

    const sendWelcomeEmail = async (email: string, name: string, password: string) => {
        try {
            await sendManagerInvite({ email, name, password, baseUrl: window.location.origin });
            return true;
        } catch (error) {
            console.error('Error sending email:', error);
            return false;
        }
    };

    const openAdd = () => {
        setEditingId(null);
        setFormData({ firstName: '', lastName: '', email: '', mobile: '', companyName: '', hiringRole: '', password: '' });
        setIsModalOpen(true);
    };

    const openEdit = (member: UserData) => {
        setEditingId(member.id);
        setFormData({
            firstName: member.firstName || '',
            lastName: member.lastName || '',
            email: member.email || '',
            mobile: member.mobile || '',
            companyName: member.companyName || '',
            hiringRole: member.hiringRole || '',
            password: ''
        });
        setIsModalOpen(true);
    };

    const handleEditMember = async () => {
        if (!editingId) return;
        setAddingMember(true);
        try {
            await updateDoc(doc(db, 'users', editingId), {
                firstName: formData.firstName.trim(),
                lastName: formData.lastName.trim(),
                mobile: formData.mobile.trim(),
                companyName: formData.companyName.trim(),
                hiringRole: formData.hiringRole.trim()
            });
            popup.success('Recruiter updated');
            setIsModalOpen(false);
            setEditingId(null);
            fetchMembers();
        } catch (error) {
            console.error('Error updating member:', error);
            popup.error('Failed to update recruiter');
        } finally {
            setAddingMember(false);
        }
    };

    const handleAddMember = async (e: React.FormEvent) => {
        e.preventDefault();
        if (editingId) {
            await handleEditMember();
            return;
        }
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
                companyName: formData.companyName.trim(),
                hiringRole: formData.hiringRole.trim(),
                role: 'recruiter',
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

                popup.success('Member added and welcome email sent!');
            } else {
                popup.success('Member added, but failed to send welcome email automatically.');
            }
            setIsModalOpen(false);
            setFormData({ firstName: '', lastName: '', email: '', mobile: '', companyName: '', hiringRole: '', password: '' });
            fetchMembers();

        } catch (error) {
            console.error('Error adding member:', error);
            popup.error('Failed to add member');
        } finally {
            setAddingMember(false);
        }
    };

    const filteredMembers = members.filter(m =>
        m.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.hiringRole?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) {
        return (
            <div className="min-h-[400px] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
            </div>
        );
    }

    return (
        <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} space-y-4 flex-1 flex flex-col`}>
            {/* Controls row below the header: search at the left end; the
                member count followed by Add Recruiters at the right. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full sm:w-72">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-ink/40" />
                    </div>
                    <input
                        type="text"
                        placeholder="Search members..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={`block w-full pl-10 pr-3 py-2 leading-5 sm:text-sm rounded-lg ${skin.field} ${FOCUS}`}
                    />
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                    <span
                        role="status"
                        aria-atomic="true"
                        className="inline-flex shrink-0 items-center justify-center whitespace-nowrap px-4 py-2 rounded-lg border border-ink text-ink text-xs font-semibold uppercase tracking-wider"
                    >
                        {members.length} Recruiter{members.length === 1 ? '' : 's'}
                    </span>
                    <button
                        onClick={openAdd}
                        className={`flex items-center justify-center gap-2 whitespace-nowrap active:scale-95 cursor-pointer rounded-lg ${skin.cta} ${FOCUS}`}
                    >
                        <UserPlus className="w-4 h-4" />
                        <span className="hidden sm:inline">Add Recruiters</span>
                        <span className="sm:hidden">Add Member</span>
                    </button>
                </div>
            </div>

            {/* Body - white results panel with the grey member cards inside. */}
            <div className={`border ${skin.edge} ${skin.resultsPanel} ${skin.radius} p-3 md:p-4`}>
            {/* Member Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMembers.map(member => (
                    <div
                        key={member.id}
                        onClick={() => onViewMember?.(member.id)}
                        className={`p-6 border ${skin.edge} ${skin.cardSurface} ${skin.radius} transition-colors duration-200 ${skin.cardHover} group cursor-pointer relative ${FOCUS}`}
                    >
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openEdit(member); }}
                            aria-label={`Edit ${member.firstName} ${member.lastName}`}
                            title="Edit"
                            className={`absolute right-3 top-3 flex h-9 w-9 items-center justify-center border ${skin.edge} bg-surface text-ink/70 rounded-lg hover:text-ink hover:border-ink/40 cursor-pointer transition-colors duration-200 ${FOCUS}`}
                        >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                        </button>

                        {/* Avatar */}
                        <div className="flex flex-col items-center mb-4">
                            <div className="w-20 h-20 overflow-hidden bg-surface rounded-full flex items-center justify-center text-ink/70 font-bold text-2xl group-hover:scale-105 transition-transform duration-200">
                                {member.profileImage ? (
                                    <img
                                        src={member.profileImage}
                                        alt={`${member.firstName} ${member.lastName}`}
                                        className="h-full w-full object-cover"
                                    />
                                ) : (
                                    <>{member.firstName?.[0]}{member.lastName?.[0]}</>
                                )}
                            </div>
                        </div>

                        {/* Name */}
                        <div className="mb-5 text-center">
                            <h3 className={skin.cardTitle}>{member.firstName} {member.lastName}</h3>
                        </div>

                        {(member.companyName || member.hiringRole) && (
                            <div className="-mt-3 mb-4 space-y-1 text-center">
                                {member.companyName && (
                                    <p className={`flex items-center justify-center gap-1.5 ${skin.body}`}>
                                        <Building2 className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                        <span className="truncate">{member.companyName}</span>
                                    </p>
                                )}
                                {member.hiringRole && (
                                    <p className={`flex items-center justify-center gap-1.5 ${skin.meta}`}>
                                        <Briefcase className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                        <span className="truncate">Hiring: {member.hiringRole}</span>
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Contact Info - grey pills, the same fill as the skill
                            tags on the job post cards (no outlines). */}
                        <div className="flex flex-wrap items-center justify-center gap-2">
                            <span
                                title={member.email}
                                className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-border px-2.5 py-1.5 text-sm font-medium text-ink/70"
                            >
                                <Mail className="h-3.5 w-3.5 flex-shrink-0 text-ink/40" />
                                <span className="truncate">{member.email}</span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-border px-2.5 py-1.5 text-sm font-medium text-ink/70">
                                <Phone className="h-3.5 w-3.5 flex-shrink-0 text-ink/40" />
                                <span>{member.mobile || 'N/A'}</span>
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className={`w-full max-w-md p-6 animate-in fade-in zoom-in duration-200 border ${skin.edge} ${skin.surface} ${skin.radius} ${skin.shadow}`}>
                        <h3 className={`${skin.heading} mb-6`}>{editingId ? 'Edit Recruiter' : 'Add New Member'}</h3>

                        <form onSubmit={handleAddMember} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-ink/80 mb-1">First Name</label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.firstName}
                                        onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                                        className={`w-full p-2.5 rounded-lg ${skin.field} ${FOCUS}`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-ink/80 mb-1">Last Name</label>
                                    <input
                                        required
                                        type="text"
                                        value={formData.lastName}
                                        onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                                        className={`w-full p-2.5 rounded-lg ${skin.field} ${FOCUS}`}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-ink/80 mb-1">Email Address</label>
                                <input
                                    required
                                    type="email"
                                    disabled={!!editingId}
                                    title={editingId ? 'The login email cannot be changed here' : undefined}
                                    value={formData.email}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    className={`w-full p-2.5 rounded-lg ${skin.field} ${FOCUS} disabled:opacity-60 disabled:cursor-not-allowed`}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-ink/80 mb-1">Mobile Number</label>
                                <input
                                    required
                                    type="tel"
                                    value={formData.mobile}
                                    onChange={e => setFormData({ ...formData, mobile: e.target.value })}
                                    className={`w-full p-2.5 rounded-lg ${skin.field} ${FOCUS}`}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-ink/80 mb-1">Company Name</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.companyName}
                                    onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                                    className={`w-full p-2.5 rounded-lg ${skin.field} ${FOCUS}`}
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-ink/80 mb-1">Hiring For (Role)</label>
                                <input
                                    required
                                    type="text"
                                    value={formData.hiringRole}
                                    onChange={e => setFormData({ ...formData, hiringRole: e.target.value })}
                                    className={`w-full p-2.5 rounded-lg ${skin.field} ${FOCUS}`}
                                    placeholder="e.g. Site Engineer"
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setIsModalOpen(false); setEditingId(null); }}
                                    className={`flex-1 cursor-pointer rounded-lg ${skin.secondary} ${FOCUS}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={addingMember}
                                    className={`flex-1 cursor-pointer rounded-lg ${skin.cta} ${FOCUS} disabled:opacity-50`}
                                >
                                    {addingMember ? (editingId ? 'Saving...' : 'Adding...') : (editingId ? 'Save changes' : 'Add Member')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
