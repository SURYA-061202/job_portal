import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query as fsQuery, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Candidate, RecruitmentRequest } from '@/types';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from 'recharts';
import { Loader2, Users, Briefcase, MapPin, Award } from 'lucide-react';
import CustomDropdown from '@/components/CustomDropdown';
import { BRAND, CHART_COLORS } from '@/constants/colors';

// Lightness steps of the one brand orange (see constants/colors.ts)
const COLORS = CHART_COLORS;

export default function AnalyticsDashboard({ userRole, userId }: { userRole?: string | null; userId?: string | null }) {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [jobPosts, setJobPosts] = useState<RecruitmentRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
    const [selectedSkill, setSelectedSkill] = useState<string>('all');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const isAdmin = userRole === 'admin';
                const candidatesRef = collection(db, 'candidates');
                const jobsRef = collection(db, 'recruits');

                // Recruiters only see analytics for posts/candidates they created; admin sees all.
                const candQuery = (!isAdmin && userId) ? fsQuery(candidatesRef, where('recruiterId', '==', userId)) : fsQuery(candidatesRef);
                const jobsQuery = (!isAdmin && userId) ? fsQuery(jobsRef, where('recruiterId', '==', userId)) : fsQuery(jobsRef);

                const [candSnapshot, jobsSnapshot, usersSnapshot] = await Promise.all([
                    getDocs(candQuery),
                    getDocs(jobsQuery),
                    !isAdmin ? getDocs(collection(db, 'users')) : Promise.resolve(null)
                ]);

                const uploadedCandidates = candSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Candidate[];

                // For recruiters, also fold in registered users (job seekers) so analytics reflects
                // the same two pools they see in the Candidates tab: their own uploads + registered users.
                const registeredUsers: Candidate[] = [];
                if (usersSnapshot) {
                    usersSnapshot.forEach((doc) => {
                        const data = doc.data();
                        if (data.role !== 'user') return;
                        registeredUsers.push({
                            id: doc.id,
                            name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || data.email || 'Unnamed User',
                            email: data.email || '',
                            phone: data.mobile || '',
                            role: data.department || 'User',
                            experience: data.yearsOfExperience || '',
                            skills: data.skills ? (typeof data.skills === 'string' ? data.skills.split(',').map((s: string) => s.trim()) : data.skills) : [],
                            resumeUrl: data.resumeUrl || '',
                            extractedData: {
                                summary: '',
                                workExperience: [],
                                education: [],
                                skills: [],
                                certifications: data.certifications || [],
                                projects: data.keyProjects || data.projects || []
                            },
                            education: [],
                            createdAt: data.createdAt,
                            updatedAt: data.updatedAt,
                            status: 'pending' as any,
                            rankings: data.rankings
                        } as Candidate);
                    });
                }

                setCandidates(isAdmin ? uploadedCandidates : [...uploadedCandidates, ...registeredUsers]);
                setJobPosts(jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as RecruitmentRequest[]);
            } catch (error) {
                console.error("Error fetching analytics data:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [userRole, userId]);

    // --- Candidate Analytics ---

    const totalCandidates = candidates.length;
    const highMatchCandidates = candidates.filter(c => {
        if (!c.rankings) return false;
        return Object.values(c.rankings).some(r => r.score >= 80);
    }).length;

    const getExpYears = (expStr: string = '') => {
        if (!expStr) return 0;
        const match = expStr.match(/(\d+\.?\d*)/);
        if (!match) return 0;
        const num = parseFloat(match[1]);
        const currentYear = new Date().getFullYear();
        if (num > 1950 && num <= currentYear) return currentYear - num;
        if (num < 50) return num;
        return 0;
    };

    const avgExperience = useMemo(() => {
        if (!totalCandidates) return 0;
        const totalExp = candidates.reduce((acc, c) => acc + getExpYears(c.experience), 0);
        return (totalExp / totalCandidates).toFixed(1);
    }, [candidates]);

    const experienceData = useMemo(() => {
        const buckets = { '0-2 Yrs': 0, '3-5 Yrs': 0, '5-8 Yrs': 0, '8+ Yrs': 0 };
        candidates.forEach(c => {
            const yrs = getExpYears(c.experience);
            if (yrs <= 2) buckets['0-2 Yrs']++;
            else if (yrs <= 5) buckets['3-5 Yrs']++;
            else if (yrs <= 8) buckets['5-8 Yrs']++;
            else buckets['8+ Yrs']++;
        });
        return Object.entries(buckets).map(([name, value]) => ({ name, value }));
    }, [candidates]);

    const locationData = useMemo(() => {
        const counts: Record<string, number> = {};
        candidates.forEach(c => {
            let loc = 'Unknown';
            if (c.extractedData?.workExperience?.length) {
                loc = (c.extractedData.workExperience[0] as any).location || 'Unknown';
            }
            loc = loc.split(',')[0].trim();
            if (loc.length > 15) loc = 'Other';
            counts[loc] = (counts[loc] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, value]) => ({ name: name === 'Unknown' ? 'Un Specified' : name, value }))
            .filter(item => item.name !== 'Other')
            .sort((a, b) => b.value - a.value)
            .slice(0, 7);
    }, [candidates]);

    const matchScoreData = useMemo(() => {
        let high = 0, medium = 0, low = 0, unranked = 0;
        candidates.forEach(c => {
            if (!c.rankings || Object.keys(c.rankings).length === 0) { unranked++; return; }
            const maxScore = Math.max(...Object.values(c.rankings).map(r => r.score));
            if (maxScore >= 80) high++;
            else if (maxScore >= 50) medium++;
            else low++;
        });
        return [
            { name: 'High Match (>80)', value: high, color: '#22c55e' },
            { name: 'Medium (50-80)', value: medium, color: '#f59e0b' },
            { name: 'Low (<50)', value: low, color: '#ef4444' },
            { name: 'Unranked', value: unranked, color: '#94a3b8' }
        ].filter(d => d.value > 0);
    }, [candidates]);

    // --- Job Post Analytics (from StatsTab) ---

    const departmentData = useMemo(() => {
        const deptCount: Record<string, number> = {};
        jobPosts.forEach((post) => {
            const dept = post.department || 'Unknown';
            deptCount[dept] = (deptCount[dept] || 0) + 1;
        });
        return Object.entries(deptCount)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([name, value]) => ({ name, value }));
    }, [jobPosts]);

    const allDepartments = useMemo(() => {
        const depts = new Set<string>();
        jobPosts.forEach((post) => { if (post.department) depts.add(post.department); });
        return Array.from(depts).sort();
    }, [jobPosts]);

    const skillsData = useMemo(() => {
        const skillCount: Record<string, number> = {};
        jobPosts.forEach((post) => {
            if (post.skills) {
                post.skills.split(',').map(s => s.trim()).forEach(skill => {
                    if (skill) skillCount[skill] = (skillCount[skill] || 0) + 1;
                });
            }
        });
        return Object.entries(skillCount)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([name, value]) => ({ name, value }));
    }, [jobPosts]);

    const allSkills = useMemo(() => {
        const skills = new Set<string>();
        jobPosts.forEach((post) => {
            if (post.skills) {
                post.skills.split(',').forEach(s => { const skill = s.trim(); if (skill) skills.add(skill); });
            }
        });
        return Array.from(skills).sort();
    }, [jobPosts]);

    const departmentStats = useMemo(() => {
        if (selectedDepartment === 'all') return null;
        const postsInDept = jobPosts.filter(p => p.department === selectedDepartment);
        return {
            totalPosts: postsInDept.length,
            totalOpenings: postsInDept.reduce((sum, p) => sum + (p.candidatesCount || 0), 0),
            avgSalary: postsInDept.length > 0 ? postsInDept.map(p => p.budgetPay).filter(Boolean).join(', ') : 'N/A'
        };
    }, [selectedDepartment, jobPosts]);

    const skillStats = useMemo(() => {
        if (selectedSkill === 'all') return null;
        const postsWithSkill = jobPosts.filter(p => p.skills?.split(',').map(s => s.trim()).includes(selectedSkill));
        return {
            totalPosts: postsWithSkill.length,
            departments: Array.from(new Set(postsWithSkill.map(p => p.department).filter(Boolean)))
        };
    }, [selectedSkill, jobPosts]);

    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center bg-surface">
                <Loader2 className="w-8 h-8 animate-spin text-brand" />
            </div>
        );
    }

    return (
        <div className="-m-4 md:-m-6 p-4 md:p-6 bg-surface flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 flex flex-col min-h-0">
                {/* Header Section - static, does not scroll */}
                <div className="bg-surface p-4 rounded-lg border border-gray-200 mb-6 flex-shrink-0">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className="text-xl font-bold text-gray-900">Analytics</h2>
                                <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold border border-gray-200">
                                    {totalCandidates} Candidates · {jobPosts.length} Posts
                                </span>
                            </div>
                            <p className="text-sm text-gray-500">Insights about candidates, departments, and skills</p>
                        </div>
                    </div>
                </div>

                {/* Content - the only scrollable region */}
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 -mx-1 pb-2 space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                        <div className="bg-surface p-4 rounded-xl border border-gray-100 flex items-center">
                            <div className="p-2 rounded-lg bg-brand/10 text-brand mr-3">
                                <Users className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Candidates</p>
                                <h3 className="text-xl font-bold text-gray-900">{totalCandidates}</h3>
                            </div>
                        </div>
                        <div className="bg-surface p-4 rounded-xl border border-gray-100 flex items-center">
                            <div className="p-2 rounded-lg bg-brand/10 text-brand mr-3">
                                <Briefcase className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Avg Experience</p>
                                <h3 className="text-xl font-bold text-gray-900">{avgExperience} Yrs</h3>
                            </div>
                        </div>
                        <div className="bg-surface p-4 rounded-xl border border-gray-100 flex items-center">
                            <div className="p-2 rounded-lg bg-brand/10 text-brand mr-3">
                                <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Top Location</p>
                                <h3 className="text-lg font-bold text-gray-900 truncate max-w-[100px]">{locationData[0]?.name || 'N/A'}</h3>
                            </div>
                        </div>
                        <div className="bg-surface p-4 rounded-xl border border-gray-100 flex items-center">
                            <div className="p-2 rounded-lg bg-brand/10 text-brand mr-3">
                                <Briefcase className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Job Posts</p>
                                <h3 className="text-xl font-bold text-gray-900">{jobPosts.length}</h3>
                            </div>
                        </div>
                        <div className="bg-surface p-4 rounded-xl border border-gray-100 flex items-center">
                            <div className="p-2 rounded-lg bg-brand/10 text-brand mr-3">
                                <Briefcase className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-medium">Departments</p>
                                <h3 className="text-xl font-bold text-gray-900">{allDepartments.length}</h3>
                            </div>
                        </div>
                    </div>

                    {/* Experience & Location Side by Side */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                        <div className="bg-surface p-4 sm:p-6 rounded-xl border border-gray-100">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Experience Distribution</h3>
                            <div className="h-56 sm:h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={experienceData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{ fill: '#f3f4f6' }} />
                                        <Bar dataKey="value" fill={BRAND} radius={[4, 4, 0, 0]} barSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="bg-surface p-4 sm:p-6 rounded-xl border border-gray-100">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Candidates by Location (Top 7)</h3>
                            <div className="h-64 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={locationData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                                        <Tooltip cursor={{ fill: '#f3f4f6' }} />
                                        <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={30} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Department & Skills Distribution */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                        {/* Department Distribution */}
                        <div className="bg-surface rounded-xl border border-gray-100 p-6">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900">Department Distribution</h3>
                                <CustomDropdown
                                    value={selectedDepartment}
                                    onChange={setSelectedDepartment}
                                    options={[
                                        { value: 'all', label: 'All Departments' },
                                        ...allDepartments.map(dept => ({ value: dept, label: dept }))
                                    ]}
                                    className="w-56"
                                />
                            </div>
                            {selectedDepartment === 'all' ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie data={departmentData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} fill="#8884d8" paddingAngle={2} dataKey="value" label={({ percent }) => percent ? `${(percent * 100).toFixed(0)}%` : ''} labelLine={false}>
                                            {departmentData.map((_entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                departmentStats && (
                                    <div className="space-y-4 mt-6">
                                        <div className="bg-brand/10 border border-brand/20 rounded-lg p-4">
                                            <div className="text-sm text-gray-600 mb-1">Total Job Posts</div>
                                            <div className="text-2xl font-bold text-brand">{departmentStats.totalPosts}</div>
                                        </div>
                                        <div className="bg-brand/10 border border-brand/20 rounded-lg p-4">
                                            <div className="text-sm text-gray-600 mb-1">Total Openings</div>
                                            <div className="text-2xl font-bold text-brand">{departmentStats.totalOpenings}</div>
                                        </div>
                                        <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
                                            <div className="text-sm text-gray-600 mb-1">Salary Ranges</div>
                                            <div className="text-sm font-medium text-gray-700">{departmentStats.avgSalary}</div>
                                        </div>
                                    </div>
                                )
                            )}
                        </div>

                        {/* Skills Distribution */}
                        <div className="bg-surface rounded-xl border border-gray-100 p-6">
                            <div className="mb-4 flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-gray-900">Skills Distribution</h3>
                                <CustomDropdown
                                    value={selectedSkill}
                                    onChange={setSelectedSkill}
                                    options={[
                                        { value: 'all', label: 'All Skills' },
                                        ...allSkills.map(skill => ({ value: skill, label: skill }))
                                    ]}
                                    className="w-56"
                                />
                            </div>
                            {selectedSkill === 'all' ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <PieChart>
                                        <Pie data={skillsData} cx="50%" cy="50%" outerRadius={100} fill="#8884d8" dataKey="value" label={({ percent }) => percent ? `${(percent * 100).toFixed(0)}%` : ''} labelLine={false}>
                                            {skillsData.map((_entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip />
                                        <Legend wrapperStyle={{ fontSize: '11px' }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                skillStats && (
                                    <div className="space-y-4 mt-6">
                                        <div className="bg-brand/10 border border-brand/20 rounded-lg p-4">
                                            <div className="text-sm text-gray-600 mb-1">Job Posts Requiring This Skill</div>
                                            <div className="text-2xl font-bold text-brand">{skillStats.totalPosts}</div>
                                        </div>
                                        <div className="bg-brand/10 border border-brand/20 rounded-lg p-4">
                                            <div className="text-sm text-gray-600 mb-1">Departments</div>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                {skillStats.departments.map((dept) => (
                                                    <span key={dept} className="px-2 py-1 bg-surface border border-brand/30 text-brand text-xs font-medium rounded">
                                                        {dept}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
