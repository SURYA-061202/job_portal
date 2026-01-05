'use client';

import { Users, CheckCircle, BarChart, LogOut, UserPlus, Briefcase, Upload, Trello, BarChart3, User, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight, MessageSquare, Award } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useState } from 'react';

interface SidebarProps {
  activeTab: 'job-posts' | 'upload-resumes' | 'candidates' | 'shortlisted' | 'interviews' | 'selected' | 'stats' | 'notifications' | 'add-members' | 'pipeline' | 'analytics' | 'profile';
  onTabChange: (tab: 'job-posts' | 'upload-resumes' | 'candidates' | 'shortlisted' | 'interviews' | 'selected' | 'stats' | 'notifications' | 'add-members' | 'pipeline' | 'analytics' | 'profile') => void;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, onTabChange, onLogout }: SidebarProps) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const jobPostsTabs = [
    { id: 'job-posts', label: 'Posts', icon: Briefcase },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  ];

  const screeningTabs = [
    { id: 'upload-resumes', label: 'Upload Resumes', icon: Upload },
    { id: 'pipeline', label: 'Pipeline (Kanban)', icon: Trello },
    { id: 'candidates', label: 'Candidates', icon: Users },
    { id: 'shortlisted', label: 'ShortListed', icon: CheckCircle },
    { id: 'interviews', label: 'Interviews', icon: MessageSquare },
    { id: 'selected', label: 'Selected Candidates', icon: Award },
    { id: 'stats', label: 'Stats', icon: BarChart },
  ];

  const accountTabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'add-members', label: 'Add Members', icon: UserPlus },
    { id: 'notifications', label: 'Notification', icon: NotificationBell, isCustomIcon: true },
  ];

  return (
    <div className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white shadow-lg flex flex-col h-full max-h-screen border-r border-gray-200 transition-all duration-300 ease-in-out relative overflow-hidden`}>
      {/* Header with Logo and Branding */}
      <div className="p-6 bg-gradient-to-br from-orange-400 to-orange-600 border-b border-orange-500 flex-shrink-0">
        {!isCollapsed && (
          <>
            <div className="flex items-center gap-3 mb-3 -ml-1">
              <img
                src="/images/indianinfra.png"
                alt="Indian Infra Logo"
                className="w-10 h-10 object-contain"
              />
              <h1 className="text-xl font-bold text-white leading-tight whitespace-nowrap">
                Indian Infra Jobs
              </h1>
            </div>

            {/* Toggle Button - Separate Row */}
            <div className="flex justify-center">
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="text-white transition-all duration-300 hover:scale-125 hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] active:scale-95 animate-pulse"
                aria-label="Collapse sidebar"
              >
                <ChevronsLeft className="w-5 h-5" />
              </button>
            </div>
          </>
        )}
        {isCollapsed && (
          <>
            <div className="flex items-center justify-center mb-3">
              <img
                src="/images/indianinfra.png"
                alt="Indian Infra Logo"
                className="w-10 h-10 object-contain"
              />
            </div>

            {/* Toggle Button - Separate Row */}
            <div className="flex justify-center">
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="text-white transition-all duration-300 hover:scale-125 hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.8)] active:scale-95 animate-pulse"
                aria-label="Expand sidebar"
              >
                <ChevronsRight className="w-5 h-5" />
              </button>
            </div>
          </>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden hover-scrollbar bg-gradient-to-br from-primary-50 to-orange-50 pb-4">
        {/* Job Posts Section */}
        <div className="px-3 pt-6 mb-6">
          {!isCollapsed && (
            <h2 className="text-xs font-bold uppercase tracking-wider px-3 mb-2 bg-gradient-to-r from-primary-600 to-orange-500 bg-clip-text text-transparent">
              Job Posts
            </h2>
          )}
          {jobPostsTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id as any)}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 ${isActive
                  ? 'bg-white shadow-md border border-orange-200'
                  : 'text-gray-700 hover:bg-white/50'
                  }`}
                title={isCollapsed ? tab.label : undefined}
              >
                <Icon className={`${isCollapsed ? '' : 'mr-3'} h-5 w-5 ${isActive ? 'text-orange-600' : ''}`} />
                {!isCollapsed && (
                  <span className={isActive ? 'bg-gradient-to-r from-primary-600 to-orange-500 bg-clip-text text-transparent font-semibold' : ''}>
                    {tab.label}
                  </span>
                )}
              </button>
            );
          })}
          {isCollapsed && <div className="border-t border-gray-200 mt-2 pt-2" />}
        </div>

        <div className="px-3 mb-6">
          {!isCollapsed && (
            <h2 className="text-xs font-bold uppercase tracking-wider px-3 mb-2 pt-2 bg-gradient-to-r from-primary-600 to-orange-500 bg-clip-text text-transparent">
              Screenings
            </h2>
          )}
          {screeningTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id as any)}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 ${isActive
                  ? 'bg-white shadow-md border border-orange-200'
                  : 'text-gray-700 hover:bg-white/50'
                  }`}
                title={isCollapsed ? tab.label : undefined}
              >
                <Icon className={`${isCollapsed ? '' : 'mr-3'} h-5 w-5 ${isActive ? 'text-orange-600' : ''}`} />
                {!isCollapsed && (
                  <span className={isActive ? 'bg-gradient-to-r from-primary-600 to-orange-500 bg-clip-text text-transparent font-semibold' : ''}>
                    {tab.label}
                  </span>
                )}
              </button>
            );
          })}
          {isCollapsed && <div className="border-t border-gray-200 mt-2 pt-2" />}
        </div>
      </nav>

      {/* Account Section - Fixed at Bottom */}
      <div className="px-3 py-4 border-t border-orange-200 bg-gradient-to-br from-orange-400 to-orange-600 flex-shrink-0">
        {/* Expand/Collapse button for collapsed sidebar */}
        {isCollapsed && (
          <button
            onClick={() => setIsAccountOpen(!isAccountOpen)}
            className="w-full flex items-center justify-center mb-2"
          >
            {!isAccountOpen ? <ChevronUp className="w-5 h-5 text-white" /> : <ChevronDown className="w-5 h-5 text-white" />}
          </button>
        )}

        {!isCollapsed && (
          <button
            onClick={() => setIsAccountOpen(!isAccountOpen)}
            className="w-full flex items-center justify-between group px-3 mb-2"
          >
            <h2 className="text-xs font-bold uppercase tracking-wider transition-colors text-white">
              Account
            </h2>
            {/* Arrow Logic: Up when collapsed (to expand up), Down when expanded (to collapse) */}
            {/* BUT User said: "The expand arrow should be up before expand". So if !isAccountOpen (collapsed), show Up. */}
            {!isAccountOpen ? <ChevronUp className="w-4 h-4 text-white" /> : <ChevronDown className="w-4 h-4 text-white" />}
          </button>
        )}

        <div className="space-y-1">
          {/* When collapsed, show collapsible items. When expanded, show based on isAccountOpen state */}
          {isCollapsed ? (
            // Collapsed sidebar - show Profile always, others when expanded
            <>
              <button
                onClick={() => onTabChange('profile')}
                className={`w-full flex items-center justify-center px-2 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 ${activeTab === 'profile'
                  ? 'bg-white text-orange-600 shadow-md'
                  : 'text-white hover:bg-white/20'
                  }`}
                title="Profile"
              >
                <User className="h-5 w-5" />
              </button>

              {/* Collapsible items when sidebar is collapsed */}
              <div className={`transition-all duration-300 overflow-hidden ${isAccountOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                {accountTabs.filter(tab => tab.id !== 'profile').map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id as any)}
                      className={`w-full flex items-center justify-center px-2 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 ${isActive
                        ? 'bg-white text-orange-600 shadow-md'
                        : 'text-white hover:bg-white/20'
                        }`}
                      title={tab.label}
                    >
                      <div className="w-5 h-5 flex items-center justify-center">
                        {'isCustomIcon' in tab ? <Icon simpleMode={true} /> : <Icon className="w-full h-full" />}
                      </div>
                    </button>
                  );
                })}

                <button
                  onClick={onLogout}
                  className="w-full flex items-center justify-center px-2 py-2.5 text-sm font-medium text-white hover:bg-white/20 rounded-lg transition-all duration-200 group mb-1"
                  title="Logout"
                >
                  <LogOut className="h-5 w-5" />
                </button>
              </div>
            </>
          ) : (
            // Expanded sidebar - use expand/collapse functionality
            <>
              {/* Profile Tab - Always Visible */}
              <button
                onClick={() => onTabChange('profile')}
                className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 ${activeTab === 'profile'
                  ? 'bg-white text-orange-600 shadow-md'
                  : 'text-white hover:bg-white/20'
                  }`}
              >
                <User className="mr-3 h-5 w-5" />
                <span className="font-semibold">
                  Profile
                </span>
              </button>

              {/* Collapsible Content - Only when expanded */}
              <div className={`transition-all duration-300 overflow-hidden ${isAccountOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                {accountTabs.filter(tab => tab.id !== 'profile').map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id as any)}
                      className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 ${isActive
                        ? 'bg-white text-orange-600 shadow-md'
                        : 'text-white hover:bg-white/20'
                        }`}
                    >
                      <div className="w-5 h-5 mr-3 flex items-center justify-center">
                        {'isCustomIcon' in tab ? <Icon simpleMode={true} /> : <Icon className="w-full h-full" />}
                      </div>
                      <span className={isActive ? 'font-semibold' : ''}>
                        {tab.label}
                      </span>
                    </button>
                  );
                })}

                <button
                  onClick={onLogout}
                  className="w-full flex items-center px-3 py-2.5 text-sm font-medium text-white hover:bg-white/20 rounded-lg transition-all duration-200 group mb-1"
                >
                  <LogOut className="mr-3 h-5 w-5" />
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}