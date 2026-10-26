import { useState, useEffect } from 'react';
import { Plus, Search, Mail, Phone, Users, X } from 'lucide-react';
import { collection, query, where, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, firebaseConfig } from '@/lib/firebase';
import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { sendManagerInvite } from '@/lib/emailFunctions';
import popup from '@/components/ui/Popup';
import ExpandingModal from '@/components/subscription/ExpandingModal';
import { timeAgo } from '@/lib/format';
import type { RecruitmentRequest } from '@/types';
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

export default function AddMembersTab(_props: { onViewMember?: (memberId: string) => void }) {
    const [members, setMembers] = useState<UserData[]>([]);
    /** Posts each recruiter has published, keyed by recruiter uid. */
    const [postCounts, setPostCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    /** Recruiter whose posts are open in the side panel, with where the click happened. */
    const [postsFor, setPostsFor] = useState<{ member: UserData; origin: { x: number; y: number } } | null>(null);
    const [memberPosts, setMemberPosts] = useState<RecruitmentRequest[]>([]);
    const [postsLoading, setPostsLoading] = useState(false);
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
            try {
                const postsSnap = await getDocs(collection(db, 'recruits'));
                const counts: Record<string, number> = {};
                postsSnap.forEach((d) => {
                    const rid = d.data().recruiterId;
                    if (rid) counts[rid] = (counts[rid] || 0) + 1;
                });
                setPostCounts(counts);
            } catch (err) {
                console.error('Error counting posts:', err);
            }
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

    const openPosts = async (member: UserData, e: React.MouseEvent) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setPostsFor({ member, origin: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
        setMemberPosts([]);
        setPostsLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'recruits'), where('recruiterId', '==', member.id)));
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as RecruitmentRequest));
            const t = (p: RecruitmentRequest) => {
                const c = p.createdAt as unknown as { toDate?: () => Date; seconds?: number } | Date | undefined;
                if (!c) return 0;
                if (c instanceof Date) return c.getTime();
                return c.toDate ? c.toDate().getTime() : (c.seconds ?? 0) * 1000;
            };
            setMemberPosts(list.sort((a, b) => t(b) - t(a)));
        } catch (error) {
            console.error('Error loading posts:', error);
            popup.error('Failed to load posts');
        } finally {
            setPostsLoading(false);
        }
    };

    const openAdd = () => {
        setEditingId(null);
        setFormData({ firstName: '', lastName: '', email: '', mobile: '', companyName: '', hiringRole: '', password: '' });
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

    const cols = 'lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)_4rem_6rem]';

    return (
        <div className={`-m-4 md:-m-6 p-4 md:p-6 ${skin.canvas} flex-1 min-h-0 flex flex-col`}>
            {/* Toolbar: title on the left, search and add on the right. */}
            <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-ink">Recruiters</h2>
                </div>
                <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
                    <div className="relative w-full sm:w-52">
                        <label htmlFor="recruiter-search" className="sr-only">Search recruiters</label>
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                            <Search className="h-4 w-4 text-ink/40" aria-hidden="true" />
                        </div>
                        <input
                            id="recruiter-search"
                            type="text"
                            placeholder="Search"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className={`block h-9 w-full rounded-lg border border-ink/20 bg-surface pl-10 pr-9 text-sm text-ink shadow-sm transition-colors placeholder:text-ink/40 hover:border-ink/40 ${FOCUS}`}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                aria-label="Clear search"
                                className={`absolute inset-y-0 right-0 my-auto mr-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-full ${skin.subtle} ${skin.subtleHover} ${FOCUS}`}
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={openAdd}
                        className={`group inline-flex h-9 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-ink/20 bg-surface px-4 text-sm font-semibold text-ink shadow-sm transition-colors duration-200 hover:border-ink/40 hover:bg-ink/5 active:scale-95 ${FOCUS}`}
                    >
                        <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" aria-hidden="true" />
                        Add Recruiter
                    </button>
                </div>
            </div>

            {/* Directory: one row per recruiter in a single white panel. */}
            <div className={`min-h-0 flex-1 overflow-y-auto scrollbar-hide border ${skin.edge} bg-surface ${skin.radius}`}>
                {filteredMembers.length > 0 && (
                    <div className={`hidden items-center gap-4 border-b ${skin.edge} px-5 py-3 lg:grid ${cols}`}>
                        <span className={skin.micro}>Recruiter</span>
                        <span className={skin.micro}>Company</span>
                        <span className={skin.micro}>Contact</span>
                        <span className={skin.micro}>Posts</span>
                        <span className={skin.micro}>View Posts</span>
                    </div>
                )}

                {filteredMembers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-ink/5 text-ink/50" aria-hidden="true">
                            <Users className="h-6 w-6" />
                        </span>
                        <h3 className={skin.emptyTitle}>{members.length === 0 ? 'No recruiters yet' : 'No matching recruiters'}</h3>
                        <p className={`mt-1 max-w-sm ${skin.body}`}>
                            {members.length === 0
                                ? 'Use Add Recruiter to invite the first one.'
                                : `Nothing matches “${searchTerm}”. Try a name, email, company or role.`}
                        </p>
                    </div>
                ) : (
                    <ul className={`divide-y ${skin.divide}`}>
                        {filteredMembers.map((member) => (
                            <li key={member.id}>
                                <div
                                    className={`grid grid-cols-1 items-center gap-x-4 gap-y-3 px-5 py-4 ${cols}`}
                                >
                                    {/* Recruiter */}
                                    <div className="flex min-w-0 items-center">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-semibold text-ink">{member.firstName} {member.lastName}</p>
                                            <p className={`truncate ${skin.meta}`}>{member.hiringRole ? `Hiring: ${member.hiringRole}` : 'No role set'}</p>
                                        </div>
                                    </div>

                                    {/* Company */}
                                    <div className="min-w-0 space-y-0.5">
                                        <p className={`truncate ${skin.body}`}>{member.companyName || '-'}</p>
                                        {/* Invisible second line: keeps the name level with the email beside it. */}
                                        <p aria-hidden="true" className={`invisible hidden lg:block ${skin.meta}`}>&nbsp;</p>
                                    </div>

                                    {/* Contact */}
                                    <div className="min-w-0 space-y-0.5">
                                        <p className={`flex items-center gap-1.5 ${skin.body}`} title={member.email}>
                                            <Mail className="h-3.5 w-3.5 shrink-0 text-ink/40" aria-hidden="true" />
                                            <span className="truncate">{member.email}</span>
                                        </p>
                                        <p className={`flex items-center gap-1.5 ${skin.meta}`}>
                                            <Phone className="h-3 w-3 shrink-0 text-ink/40" aria-hidden="true" />
                                            <span>{member.mobile || 'N/A'}</span>
                                        </p>
                                    </div>

                                    {/* Posts published by this recruiter */}
                                    <p className={`text-sm font-semibold text-ink`}>
                                        <span className={`mr-1 font-normal lg:hidden ${skin.meta}`}>Posts:</span>
                                        {postCounts[member.id] ?? 0}
                                    </p>

                                    <div>
                                        <button
                                            type="button"
                                            onClick={(e) => openPosts(member, e)}
                                            disabled={(postCounts[member.id] ?? 0) === 0}
                                            className={`inline-flex h-6 cursor-pointer items-center rounded-md border border-ink/70 bg-ink/70 px-2.5 text-[11px] font-bold text-surface transition-colors duration-200 hover:bg-ink/60 disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`}
                                        >
                                            View
                                        </button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {postsFor && (
                <ExpandingModal
                    title={`${postsFor.member.firstName} ${postsFor.member.lastName}`.trim() || 'Recruiter'}
                    subtitle={`${memberPosts.length || postCounts[postsFor.member.id] || 0} posts`}
                    origin={postsFor.origin}
                    onClose={() => setPostsFor(null)}
                    widthClass="max-w-[34rem]"
                >
                    {postsLoading ? (
                        <div className="flex flex-1 items-center justify-center p-10">
                            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-brand" />
                        </div>
                    ) : memberPosts.length === 0 ? (
                        <div className="flex flex-1 items-center justify-center p-6">
                            <p className={skin.body}>No posts yet.</p>
                        </div>
                    ) : (
                        <ul className={`divide-y ${skin.divide}`}>
                            {memberPosts.map((post) => (
                                <li key={post.id} className="px-5 py-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <p className="min-w-0 break-words text-sm font-semibold text-ink">{post.jobTitle}</p>
                                        <span className={`shrink-0 ${skin.meta}`}>{timeAgo(post.createdAt as never)}</span>
                                    </div>
                                    <p className={`mt-1 ${skin.meta}`}>
                                        {[post.department, post.location, post.positionLevel].filter(Boolean).join(' · ') || 'No details'}
                                    </p>
                                    {post.skills && (
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {post.skills.split(',').slice(0, 5).map((sk, i) => (
                                                <span key={i} className="rounded-lg bg-border px-2 py-0.5 text-xs font-medium text-ink/70">{sk.trim()}</span>
                                            ))}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </ExpandingModal>
            )}

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
