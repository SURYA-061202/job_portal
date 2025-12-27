'use client';

import { Users, CheckCircle, BarChart, LogOut, UserPlus, Briefcase, Upload, Trello, BarChart3 } from 'lucide-react';
import NotificationBell from './NotificationBell';

interface SidebarProps {
  activeTab: 'job-posts' | 'upload-resumes' | 'candidates' | 'shortlisted' | 'interviews' | 'selected' | 'stats' | 'notifications' | 'add-members' | 'pipeline' | 'analytics';
  onTabChange: (tab: 'job-posts' | 'upload-resumes' | 'candidates' | 'shortlisted' | 'interviews' | 'selected' | 'stats' | 'notifications' | 'add-members' | 'pipeline' | 'analytics') => void;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, onTabChange, onLogout }: SidebarProps) {
  const jobPostsTabs = [
    { id: 'job-posts', label: 'Posts', icon: Briefcase },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const screeningTabs = [
    { id: 'upload-resumes', label: 'Upload Resumes', icon: Upload },
    { id: 'pipeline', label: 'Pipeline (Kanban)', icon: Trello },
    { id: 'candidates', label: 'Candidates', icon: Users },
    { id: 'shortlisted', label: 'ShortListed', icon: CheckCircle },
    { id: 'interviews', label: 'Interviews', icon: Users },
    { id: 'selected', label: 'Selected Candidates', icon: CheckCircle },
    { id: 'stats', label: 'Stats', icon: BarChart },
  ];

  return (
    <div className="w-64 bg-white shadow-lg flex flex-col h-full border-r border-gray-200">
      {/* Header with Logo and Branding */}
      <div className="p-6 bg-gradient-to-br from-primary-50 to-orange-50 border-b border-primary-100">
        <div className="flex items-center gap-3 mb-2">
          <img
            src="/images/indianinfra.png"
            alt="Indian Infra Logo"
            className="w-10 h-10 object-contain"
          />
          <h1 className="text-xl font-bold text-gray-800 leading-tight">
            Indian Infra <br />
            <span className="text-primary-600">Jobs</span>
          </h1>
        </div>
      </div>

      <nav className="mt-6 flex-1 overflow-y-auto">
        {/* Job Posts Section */}
        <div className="px-3 mb-6">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 mb-2">
            Job Posts
          </h2>
          {/* Orange gradient line */}
          <div className="h-0.5 bg-gradient-to-r from-primary-500 to-orange-500 mb-3 mx-3 rounded-full"></div>
          {jobPostsTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id as any)}
                className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 ${isActive
                  ? 'bg-gradient-to-r from-primary-100 to-orange-50 text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:bg-primary-50 hover:text-primary-700'
                  }`}
              >
                <Icon className="mr-3 h-5 w-5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Screenings Section */}
        <div className="px-3">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 mb-2">
            Screenings
          </h2>
          {/* Orange gradient line */}
          <div className="h-0.5 bg-gradient-to-r from-primary-500 to-orange-500 mb-3 mx-3 rounded-full"></div>
          {screeningTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id as any)}
                className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 ${isActive
                  ? 'bg-gradient-to-r from-primary-100 to-orange-50 text-primary-700 shadow-sm'
                  : 'text-gray-600 hover:bg-primary-50 hover:text-primary-700'
                  }`}
              >
                <Icon className="mr-3 h-5 w-5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="mt-auto border-t border-gray-200 py-3 space-y-1">
        <button
          onClick={() => onTabChange('add-members')}
          className={`w-full flex items-center px-6 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === 'add-members'
            ? 'bg-gradient-to-r from-primary-100 to-orange-50 text-primary-700 shadow-sm'
            : 'text-gray-600 hover:bg-primary-50 hover:text-primary-700'
            }`}
        >
          <UserPlus className="mr-3 h-5 w-5" />
          Add Members
        </button>

        <button
          onClick={() => onTabChange('notifications')}
          className={`w-full flex items-center px-6 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${activeTab === 'notifications'
            ? 'bg-gradient-to-r from-primary-100 to-orange-50 text-primary-700 shadow-sm'
            : 'text-gray-600 hover:bg-primary-50 hover:text-primary-700'
            }`}
        >
          <NotificationBell className="mr-3" simpleMode={true} />
          Notification
        </button>

        <button
          onClick={onLogout}
          className="w-full flex items-center px-6 py-2.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all duration-200 group"
        >
          <LogOut className="mr-3 h-5 w-5 text-gray-400 group-hover:text-red-600 transition-colors" />
          Logout
        </button>
      </div>
    </div>
  );
}