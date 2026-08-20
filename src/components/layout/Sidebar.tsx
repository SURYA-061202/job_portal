'use client';

import { Users, CheckCircle, LogOut, UserPlus, Briefcase, Upload, Trello, BarChart3, User, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight, MessageSquare, Award, ClipboardCheck } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useState } from 'react';

interface SidebarProps {
  activeTab: 'job-posts' | 'upload-resumes' | 'candidates' | 'shortlisted' | 'interviews' | 'selected' | 'stats' | 'notifications' | 'add-members' | 'member-detail' | 'pipeline' | 'analytics' | 'profile' | 'assessments';
  onTabChange: (tab: any) => void;
  onLogout: () => void;
  userRole: string | null;
}

export default function Sidebar({ activeTab, onTabChange, onLogout, userRole }: SidebarProps) {
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
    { id: 'assessments', label: 'Assessments', icon: ClipboardCheck, adminOnly: true },
  ];

  const recruiterTabs = [
    { id: 'add-members', label: 'Add Recruiters', icon: UserPlus, adminOnly: true },
  ];

  const accountTabs = [
    { id: 'profile', label: 'Profile', icon: User },
  ];

  const visibleRecruiterTabs = recruiterTabs.filter(tab => !tab.adminOnly || userRole === 'admin');

  return (
    <div className={`${isCollapsed ? 'w-20' : 'w-64'} bg-ink shadow-lg flex flex-col h-full max-h-screen border-r border-brand/20 transition-all duration-300 ease-in-out relative overflow-hidden`}>
      {/* Header with Logo and Branding */}
      <div className="px-6 py-4 bg-ink border-b border-brand/20 flex-shrink-0">
        <div className="flex items-center gap-3 group">
          <div className="relative">
            <img
              src="/images/indianinfra.png"
              alt="Indian Infra Logo"
              className="w-10 h-10 object-contain transition-transform duration-500 group-hover:rotate-[10deg]"
            />
          </div>
          {!isCollapsed && (
            <div className="flex items-center gap-1.5 font-outfit text-xl font-black tracking-tighter pr-1">
              <span className="text-gray-100">Indian Infra</span>
              <span className="text-gray-100">Jobs</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls Section - Dark Background with Gradient Border */}
      <div className="relative px-4 py-2 bg-ink flex-shrink-0">
        <div className="flex items-center justify-between gap-1">
          {/* Toggle Button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center justify-center group transition-all duration-300"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? (
              <ChevronsRight className="w-5 h-5 text-gray-400 transition-all duration-300 group-hover:scale-110 group-hover:translate-x-1" />
            ) : (
              <ChevronsLeft className="w-5 h-5 text-gray-400 transition-all duration-300 group-hover:scale-110 group-hover:-translate-x-1" />
            )}
          </button>

          {/* Notifications — shown in both states; the bell inherits its colour,
              so it needs an explicit one to be visible on the dark sidebar. */}
          <button
            onClick={() => onTabChange('notifications')}
            className="relative p-1.5 rounded-lg text-gray-400 hover:text-brand hover:bg-gray-800 transition-colors"
            title="Notifications"
          >
            <NotificationBell simpleMode={true} />
          </button>
        </div>
        {/* Gradient Border - Fades at both ends */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand to-transparent"></div>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden hover-scrollbar bg-ink pb-4">
        {/* Job Posts Section */}
        <div className="px-3 pt-6 mb-6">
          {!isCollapsed && (
            <h2 className="text-xs font-bold uppercase tracking-wider px-3 mb-2 text-brand">
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
                className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 relative ${isActive
                  ? 'bg-gray-800/60 shadow-md border border-brand/30'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-brand hover:shadow-sm'
                  }`}
                title={isCollapsed ? tab.label : undefined}
              >
                {isActive && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-brand rounded-full" />}
                <Icon className={`${isCollapsed ? '' : 'mr-3'} h-5 w-5 ${isActive ? 'text-brand' : ''}`} />
                {!isCollapsed && (
                  <span className={isActive ? 'text-brand font-semibold' : ''}>
                    {tab.label}
                  </span>
                )}
              </button>
            );
          })}
          {isCollapsed && <div className="border-t border-brand/20 mt-2 pt-2" />}
        </div>

        <div className="px-3 mb-6">
          {!isCollapsed && (
            <h2 className="text-xs font-bold uppercase tracking-wider px-3 mb-2 pt-2 text-brand">
              Screenings
            </h2>
          )}
          {screeningTabs.filter(tab => !tab.adminOnly || userRole === 'admin').map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id as any)}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 relative ${isActive
                  ? 'bg-gray-800/60 shadow-md border border-brand/30'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-brand hover:shadow-sm'
                  }`}
                title={isCollapsed ? tab.label : undefined}
              >
                {isActive && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-brand rounded-full" />}
                <Icon className={`${isCollapsed ? '' : 'mr-3'} h-5 w-5 ${isActive ? 'text-brand' : ''}`} />
                {!isCollapsed && (
                  <span className={isActive ? 'text-brand font-semibold' : ''}>
                    {tab.label}
                  </span>
                )}
              </button>
            );
          })}
          {isCollapsed && <div className="border-t border-brand/20 mt-2 pt-2" />}
        </div>

        {/* Recruiter Section — hidden entirely when the user can't see any of its tabs */}
        {visibleRecruiterTabs.length > 0 && (
          <div className="px-3 mb-6">
            {!isCollapsed && (
              <h2 className="text-xs font-bold uppercase tracking-wider px-3 mb-2 pt-2 text-brand">
                Recruiter
              </h2>
            )}
            {visibleRecruiterTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id as any)}
                  className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 relative ${isActive
                    ? 'bg-gray-800/60 shadow-md border border-brand/30'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-brand hover:shadow-sm'
                    }`}
                  title={isCollapsed ? tab.label : undefined}
                >
                  {isActive && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-brand rounded-full" />}
                  <Icon className={`${isCollapsed ? '' : 'mr-3'} h-5 w-5 ${isActive ? 'text-brand' : ''}`} />
                  {!isCollapsed && (
                    <span className={isActive ? 'text-brand font-semibold' : ''}>
                      {tab.label}
                    </span>
                  )}
                </button>
              );
            })}
            {isCollapsed && <div className="border-t border-brand/20 mt-2 pt-2" />}
          </div>
        )}
      </nav>

      {/* Account Section - Fixed at Bottom */}
      <div className="px-3 py-4 border-t border-brand/20 bg-ink flex-shrink-0">
        {/* Expand/Collapse button for collapsed sidebar */}
        {isCollapsed && (
          <button
            onClick={() => setIsAccountOpen(!isAccountOpen)}
            className="w-full flex items-center justify-center mb-2"
          >
            {!isAccountOpen ? <ChevronUp className="w-5 h-5 text-brand" /> : <ChevronDown className="w-5 h-5 text-brand" />}
          </button>
        )}

        {!isCollapsed && (
          <button
            onClick={() => setIsAccountOpen(!isAccountOpen)}
            className="w-full flex items-center justify-between group px-3 mb-2"
          >
            <h2 className="text-xs font-bold uppercase tracking-wider transition-colors text-brand">
              Account
            </h2>
            {!isAccountOpen ? <ChevronUp className="w-4 h-4 text-brand" /> : <ChevronDown className="w-4 h-4 text-brand" />}
          </button>
        )}

        <div className="space-y-1">
          {isCollapsed ? (
            <>
              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center px-2 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 text-gray-300 hover:bg-red-950/50 hover:text-red-400 group"
                title="Logout"
              >
                <LogOut className="h-5 w-5" />
              </button>

              <div className={`transition-all duration-300 overflow-hidden ${isAccountOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                {accountTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id as any)}
                      className={`w-full flex items-center justify-center px-2 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 relative ${isActive
                        ? 'bg-brand/15 text-brand shadow-md border border-brand/30'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-brand'
                        }`}
                      title={tab.label}
                    >
                      {isActive && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-brand rounded-full" />}
                      <Icon className="h-5 w-5" />
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <button
                onClick={onLogout}
                className="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 text-gray-300 hover:bg-red-950/50 hover:text-red-400"
              >
                <LogOut className="mr-3 h-5 w-5" />
                <span className="font-semibold">
                  Logout
                </span>
              </button>

              <div className={`transition-all duration-300 overflow-hidden ${isAccountOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                {accountTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id as any)}
                      className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 relative ${isActive
                        ? 'bg-brand/15 text-brand shadow-md border border-brand/30'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-brand'
                        }`}
                    >
                      {isActive && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-brand rounded-full" />}
                      <Icon className="mr-3 h-5 w-5" />
                      <span className={isActive ? 'font-semibold' : ''}>
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}