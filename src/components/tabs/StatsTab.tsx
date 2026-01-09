import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { Candidate, RecruitmentRequest } from '@/types';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import CustomDropdown from '@/components/CustomDropdown';

// Helpers ------------------------------------------------------------

// Chart colors - different orange shades
const COLORS = ['#f97316', '#fb923c', '#fdba74', '#ea580c', '#c2410c', '#fed7aa', '#ffedd5', '#9a3412'];

// Main component -------------------------------------------------------

export default function StatsTab() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [jobPosts, setJobPosts] = useState<RecruitmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [selectedSkill, setSelectedSkill] = useState<string>('all');

  // Load candidates and job posts
  useEffect(() => {
    const load = async () => {
      try {
        const [candidatesSnapshot, jobsSnapshot] = await Promise.all([
          getDocs(collection(db, 'candidates')),
          getDocs(collection(db, 'recruits'))
        ]);

        const candidatesList: Candidate[] = [];
        candidatesSnapshot.forEach((d) => candidatesList.push({ id: d.id, ...d.data() } as Candidate));

        const jobsList: RecruitmentRequest[] = [];
        jobsSnapshot.forEach((d) => jobsList.push({ id: d.id, ...d.data() } as RecruitmentRequest));

        setCandidates(candidatesList);
        setJobPosts(jobsList);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Calculate department distribution from job posts
  const departmentData = useMemo(() => {
    const deptCount: Record<string, number> = {};
    jobPosts.forEach((post) => {
      const dept = post.department || 'Unknown';
      deptCount[dept] = (deptCount[dept] || 0) + 1;
    });

    // Sort by count and get top 5
    const sorted = Object.entries(deptCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return sorted.map(([name, value]) => ({ name, value }));
  }, [jobPosts]);

  // Get all unique departments for dropdown
  const allDepartments = useMemo(() => {
    const depts = new Set<string>();
    jobPosts.forEach((post) => {
      if (post.department) depts.add(post.department);
    });
    return Array.from(depts).sort();
  }, [jobPosts]);

  // Calculate skills distribution from job posts
  const skillsData = useMemo(() => {
    const skillCount: Record<string, number> = {};
    jobPosts.forEach((post) => {
      if (post.skills) {
        const skills = post.skills.split(',').map(s => s.trim());
        skills.forEach(skill => {
          if (skill) {
            skillCount[skill] = (skillCount[skill] || 0) + 1;
          }
        });
      }
    });

    // Sort by count and get top 5
    const sorted = Object.entries(skillCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return sorted.map(([name, value]) => ({ name, value }));
  }, [jobPosts]);

  // Get all unique skills for dropdown
  const allSkills = useMemo(() => {
    const skills = new Set<string>();
    jobPosts.forEach((post) => {
      if (post.skills) {
        post.skills.split(',').forEach(s => {
          const skill = s.trim();
          if (skill) skills.add(skill);
        });
      }
    });
    return Array.from(skills).sort();
  }, [jobPosts]);

  // Get stats for selected department
  const departmentStats = useMemo(() => {
    if (selectedDepartment === 'all') return null;
    const postsInDept = jobPosts.filter(p => p.department === selectedDepartment);
    return {
      totalPosts: postsInDept.length,
      totalOpenings: postsInDept.reduce((sum, p) => sum + (p.candidatesCount || 0), 0),
      avgSalary: postsInDept.length > 0
        ? postsInDept.map(p => p.budgetPay).filter(Boolean).join(', ')
        : 'N/A'
    };
  }, [selectedDepartment, jobPosts]);

  // Get stats for selected skill
  const skillStats = useMemo(() => {
    if (selectedSkill === 'all') return null;
    const postsWithSkill = jobPosts.filter(p =>
      p.skills?.split(',').map(s => s.trim()).includes(selectedSkill)
    );
    return {
      totalPosts: postsWithSkill.length,
      departments: Array.from(new Set(postsWithSkill.map(p => p.department).filter(Boolean)))
    };
  }, [selectedSkill, jobPosts]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 flex-1 flex flex-col">
      {/* Header Section */}
      <div className="bg-gradient-to-br from-primary-50 to-orange-50 p-4 rounded-xl border border-orange-100 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-bold text-gray-900">Stats & Analytics</h2>
              <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold border border-gray-200">
                {jobPosts.length} Posts
              </span>
            </div>
            <p className="text-sm text-gray-500">Department and skills distribution across job postings</p>
          </div>
        </div>
      </div>

      {/* Summary Cards - Moved to Top */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-sm border border-blue-200 p-6">
          <div className="text-sm text-blue-700 font-medium mb-1">Total Candidates</div>
          <div className="text-3xl font-bold text-blue-900">{candidates.length}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl shadow-sm border border-orange-200 p-6">
          <div className="text-sm text-orange-700 font-medium mb-1">Total Job Posts</div>
          <div className="text-3xl font-bold text-orange-900">{jobPosts.length}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-sm border border-purple-200 p-6">
          <div className="text-sm text-purple-700 font-medium mb-1">Unique Departments</div>
          <div className="text-3xl font-bold text-purple-900">{allDepartments.length}</div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Department Distribution - Donut Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Department Distribution</h3>
              <p className="text-sm text-gray-500">Top 5 departments by job postings</p>
            </div>

            {/* Department Dropdown - Moved to Title Row */}
            <CustomDropdown
              value={selectedDepartment}
              onChange={setSelectedDepartment}
              options={[
                { value: 'all', label: 'All Departments (Overview)' },
                ...allDepartments.map(dept => ({ value: dept, label: dept }))
              ]}
              className="w-64"
            />
          </div>

          {selectedDepartment === 'all' ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={departmentData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  fill="#8884d8"
                  paddingAngle={2}
                  dataKey="value"
                  label={({ percent }) => percent ? `${(percent * 100).toFixed(0)}%` : ''}
                  labelLine={false}
                >
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
                <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Total Job Posts</div>
                  <div className="text-2xl font-bold text-orange-600">{departmentStats.totalPosts}</div>
                </div>
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Total Openings</div>
                  <div className="text-2xl font-bold text-blue-600">{departmentStats.totalOpenings}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Salary Ranges</div>
                  <div className="text-sm font-medium text-gray-700">{departmentStats.avgSalary}</div>
                </div>
              </div>
            )
          )}
        </div>

        {/* Skills Distribution - Pie Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">Skills Distribution</h3>
              <p className="text-sm text-gray-500">Top 5 most demanded skills</p>
            </div>

            {/* Skills Dropdown - Moved to Title Row */}
            <CustomDropdown
              value={selectedSkill}
              onChange={setSelectedSkill}
              options={[
                { value: 'all', label: 'All Skills (Overview)' },
                ...allSkills.map(skill => ({ value: skill, label: skill }))
              ]}
              className="w-64"
            />
          </div>

          {selectedSkill === 'all' ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={skillsData}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ percent }) => percent ? `${(percent * 100).toFixed(0)}%` : ''}
                  labelLine={false}
                >
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
                <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Job Posts Requiring This Skill</div>
                  <div className="text-2xl font-bold text-orange-600">{skillStats.totalPosts}</div>
                </div>
                <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
                  <div className="text-sm text-gray-600 mb-1">Departments</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {skillStats.departments.map((dept) => (
                      <span key={dept} className="px-2 py-1 bg-white border border-purple-200 text-purple-700 text-xs font-medium rounded">
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
  );
}