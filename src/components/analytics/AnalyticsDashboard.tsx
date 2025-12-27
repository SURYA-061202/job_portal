import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Candidate } from '@/types';
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

export default function AnalyticsDashboard() {
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCandidates = async () => {
            try {
                const snapshot = await getDocs(collection(db, 'candidates'));
                const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Candidate[];
                setCandidates(data);
            } catch (error) {
                console.error("Error fetching candidates for analytics:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchCandidates();
    }, []);

    // --- Analytics Logic ---

    // 1. KPI: Totals & High Match
    const totalCandidates = candidates.length;
    const highMatchCandidates = candidates.filter(c => {
        if (!c.rankings) return false;
        return Object.values(c.rankings).some(r => r.score >= 80);
    }).length;

    // 2. Experience Processing
    const getExpYears = (expStr: string = '') => {
        const match = expStr.match(/(\d+)/);
        return match ? parseInt(match[1]) : 0;
    };
    const avgExperience = useMemo(() => {
        if (!totalCandidates) return 0;
        const totalExp = candidates.reduce((acc, c) => acc + getExpYears(c.experience), 0);
        return (totalExp / totalCandidates).toFixed(1);
    }, [candidates]);

    // 3. Experience Distribution (Histogram)
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

    // 4. Location Distribution
    const locationData = useMemo(() => {
        const counts: Record<string, number> = {};
        candidates.forEach(c => {
            // Try to find location from last work experience or use generic if missing
            let loc = 'Unknown';
            if (c.extractedData?.workExperience?.length) {
                loc = (c.extractedData.workExperience[0] as any).location || 'Unknown';
            }
            // Simple validation to avoid messy charts with too many unique strings
            // Split by comma if "City, Country" and take City
            loc = loc.split(',')[0].trim();
            if (loc.length > 15) loc = 'Other';

            counts[loc] = (counts[loc] || 0) + 1;
        });

        // Sort and take top 5
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 7)
            .map(([name, value]) => ({ name, value }));
    }, [candidates]);

    // 5. AI Match Score Distribution
    const matchScoreData = useMemo(() => {
        let high = 0, medium = 0, low = 0, unranked = 0;
        candidates.forEach(c => {
            if (!c.rankings || Object.keys(c.rankings).length === 0) {
                unranked++;
                return;
            }
            // Take the HIGHEST score this candidate has received for ANY job
            const maxScore = Math.max(...Object.values(c.rankings).map(r => r.score));
            if (maxScore >= 80) high++;
            else if (maxScore >= 50) medium++;
            else low++;
        });
        return [
            { name: 'High Match (>80)', value: high, color: '#22c55e' }, // Green-500
            { name: 'Medium (50-80)', value: medium, color: '#f59e0b' }, // Amber-500
            { name: 'Low (<50)', value: low, color: '#ef4444' }, // Red-500
            { name: 'Unranked', value: unranked, color: '#94a3b8' } // Slate-400
        ].filter(d => d.value > 0);
    }, [candidates]);


    if (loading) {
        return (
            <div className="flex h-96 items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
            <h2 className="text-2xl font-bold text-gray-800">Candidate Analytics</h2>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
                    <div className="p-3 rounded-lg bg-blue-50 text-blue-600 mr-4">
                        <Users className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Total Candidates</p>
                        <h3 className="text-2xl font-bold text-gray-900">{totalCandidates}</h3>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
                    <div className="p-3 rounded-lg bg-green-50 text-green-600 mr-4">
                        <Award className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">High AI Match</p>
                        <h3 className="text-2xl font-bold text-gray-900">{highMatchCandidates}</h3>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
                    <div className="p-3 rounded-lg bg-purple-50 text-purple-600 mr-4">
                        <Briefcase className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Avg Experience</p>
                        <h3 className="text-2xl font-bold text-gray-900">{avgExperience} Yrs</h3>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
                    <div className="p-3 rounded-lg bg-orange-50 text-orange-600 mr-4">
                        <MapPin className="w-8 h-8" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Top Location</p>
                        <h3 className="text-xl font-bold text-gray-900 truncate max-w-[140px]">
                            {locationData[0]?.name || 'N/A'}
                        </h3>
                    </div>
                </div>
            </div>

            {/* Charts Row 1 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* 1. Experience Distribution */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-6">Experience Distribution</h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={experienceData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    cursor={{ fill: '#f3f4f6' }}
                                />
                                <Bar dataKey="value" fill="#f97316" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. Match Quality */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-800 mb-6">AI Match Quality</h3>
                    <div className="h-64 w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={matchScoreData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {matchScoreData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Charts Row 2 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 3. Location Distribution */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 col-span-2">
                    <h3 className="text-lg font-semibold text-gray-800 mb-6">Candidates by Location (Top 7)</h3>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={locationData} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: '#f3f4f6' }} />
                                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
}
