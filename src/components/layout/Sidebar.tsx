'use client';

import { Users, CheckCircle, BarChart, LogOut, UserPlus, Briefcase, Upload, Trello, BarChart3, User, ChevronUp, ChevronDown } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useState } from 'react';

interface SidebarProps {
  activeTab: 'job-posts' | 'upload-resumes' | 'candidates' | 'shortlisted' | 'interviews' | 'selected' | 'stats' | 'notifications' | 'add-members' | 'pipeline' | 'analytics' | 'profile';
  onTabChange: (tab: 'job-posts' | 'upload-resumes' | 'candidates' | 'shortlisted' | 'interviews' | 'selected' | 'stats' | 'notifications' | 'add-members' | 'pipeline' | 'analytics' | 'profile') => void;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, onTabChange, onLogout }: SidebarProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);

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

  const accountTabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'add-members', label: 'Add Members', icon: UserPlus },
    { id: 'notifications', label: 'Notification', icon: NotificationBell, isCustomIcon: true },
  ];

  return (
    <div className="w-64 bg-white shadow-lg flex flex-col h-full border-r border-gray-200">
      {/* Header with Logo and Branding */}
      <div className="p-6 bg-gradient-to-br from-primary-50 to-orange-50 border-b border-primary-100 flex-shrink-0">
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

      <nav className="flex-1 overflow-y-auto custom-scrollbar">
        <style jsx global>{`
          .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
          }
          .custom-scrollbar::-webkit-scrollbar-track {
            background: #f1f1f1;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: linear-gradient(to bottom, #d97706, #ea580c);
            border-radius: 3px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(to bottom, #b45309, #c2410c);
          }
        `}</style>

        {/* Job Posts Section */}
        <div className="px-3 pt-6 mb-6">
          <h2 className="text-xs font-bold uppercase tracking-wider px-3 mb-2 bg-gradient-to-r from-primary-600 to-orange-500 bg-clip-text text-transparent">
            Job Posts
          </h2>
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

        <div className="px-3 mb-6">
          <h2 className="text-xs font-bold uppercase tracking-wider px-3 mb-2 bg-gradient-to-r from-primary-600 to-orange-500 bg-clip-text text-transparent">
            Screenings
          </h2>
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

      {/* Account Section - Fixed at Bottom */}
      <div className="px-3 py-4 border-t border-gray-200 bg-gray-50/50">
        <button
          onClick={() => setIsAccountOpen(!isAccountOpen)}
          className="w-full flex items-center justify-between group px-3 mb-2"
        >
          <h2 className="text-xs font-bold uppercase tracking-wider transition-colors bg-gradient-to-r from-primary-600 to-orange-500 bg-clip-text text-transparent">
            Account
          </h2>
          {/* Arrow Logic: Up when collapsed (to expand up), Down when expanded (to collapse) */}
          {/* BUT User said: "The expand arrow should be up before expand". So if !isAccountOpen (collapsed), show Up. */}
          {!isAccountOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </button>

        <div className="space-y-1">
          {/* Profile Tab - Always Visible */}
          <button
            onClick={() => onTabChange('profile')}
            className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 ${activeTab === 'profile'
              ? 'bg-gradient-to-r from-primary-100 to-orange-50 text-primary-700 shadow-sm'
              : 'text-gray-600 hover:bg-primary-50 hover:text-primary-700'
              }`}
          >
            <User className="mr-3 h-5 w-5" />
            Profile
          </button>

          {/* Collapsible Content */}
          <div className={`transition-all duration-300 overflow-hidden ${isAccountOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
            {accountTabs.filter(tab => tab.id !== 'profile').map((tab) => {
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
                  <div className="w-5 h-5 mr-3 flex items-center justify-center">
                    {'isCustomIcon' in tab ? <Icon simpleMode={true} /> : <Icon className="w-full h-full" />}
                  </div>
                  {tab.label}
                </button>
              );
            })}

            <button
              onClick={onLogout}
              className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all duration-200 group mb-1"
            >
              <LogOut className="mr-3 h-5 w-5 text-gray-400 group-hover:text-red-600 transition-colors" />
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}