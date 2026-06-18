'use client';

import { Users, CheckCircle, BarChart, LogOut, UserPlus, Briefcase, Upload, Trello, BarChart3, User, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight, MessageSquare, Award, ClipboardCheck } from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useState } from 'react';

interface SidebarProps {
  activeTab: 'job-posts' | 'upload-resumes' | 'candidates' | 'shortlisted' | 'interviews' | 'selected' | 'stats' | 'notifications' | 'add-members' | 'pipeline' | 'analytics' | 'profile' | 'assessments';
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
    { id: 'upload-resumes', label: 'Upload Resumes', icon: Upload, adminOnly: true },
    { id: 'pipeline', label: 'Pipeline (Kanban)', icon: Trello },
    { id: 'candidates', label: 'Candidates', icon: Users },
    { id: 'shortlisted', label: 'ShortListed', icon: CheckCircle },
    { id: 'interviews', label: 'Interviews', icon: MessageSquare },
    { id: 'selected', label: 'Selected Candidates', icon: Award },
    { id: 'stats', label: 'Stats', icon: BarChart },
    { id: 'assessments', label: 'Assessments', icon: ClipboardCheck, adminOnly: true },
  ];

  const accountTabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'add-members', label: 'Add Members', icon: UserPlus, adminOnly: true },
  ];

  return (
    <div className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white shadow-lg flex flex-col h-full max-h-screen border-r border-gray-200 transition-all duration-300 ease-in-out relative overflow-hidden`}>
      {/* Header with Logo and Branding */}
      <div className="px-6 py-4 bg-white border-b border-gray-200 flex-shrink-0">
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
              <span className="text-gray-800">Indian Infra</span>
              <span className="text-gray-800">Jobs</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls Section - White Background with Gradient Border */}
      <div className="relative px-4 py-2 bg-white flex-shrink-0">
        <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} gap-1`}>
          {/* Toggle Button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center justify-center group transition-all duration-300"
            title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
          >
            {isCollapsed ? (
              <ChevronsRight className="w-5 h-5 text-gray-600 transition-all duration-300 group-hover:scale-110 group-hover:translate-x-1" />
            ) : (
              <ChevronsLeft className="w-5 h-5 text-gray-600 transition-all duration-300 group-hover:scale-110 group-hover:-translate-x-1" />
            )}
          </button>

          {/* Notification Icon - Only show when expanded */}
          {!isCollapsed && (
            <button
              onClick={() => onTabChange('notifications')}
              className="relative p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
              title="Notifications"
            >
              <NotificationBell simpleMode={true} />
            </button>
          )}
        </div>
        {/* Gradient Border - Fades at both ends */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-orange-500 to-transparent"></div>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden hover-scrollbar bg-white pb-4">
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
                className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 relative ${isActive
                  ? 'bg-white shadow-md border border-orange-200'
                  : 'text-gray-700 hover:bg-orange-50/50 hover:text-orange-600 hover:shadow-sm'
                  }`}
                title={isCollapsed ? tab.label : undefined}
              >
                {isActive && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-gradient-to-b from-orange-400 to-orange-600 rounded-full" />}
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
          {screeningTabs.filter(tab => !tab.adminOnly || userRole === 'admin').map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id as any)}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center px-2' : 'px-3'} py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 relative ${isActive
                  ? 'bg-white shadow-md border border-orange-200'
                  : 'text-gray-700 hover:bg-orange-50/50 hover:text-orange-600 hover:shadow-sm'
                  }`}
                title={isCollapsed ? tab.label : undefined}
              >
                {isActive && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-gradient-to-b from-orange-400 to-orange-600 rounded-full" />}
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
      <div className="px-3 py-4 border-t border-gray-200 bg-white flex-shrink-0">
        {/* Expand/Collapse button for collapsed sidebar */}
        {isCollapsed && (
          <button
            onClick={() => setIsAccountOpen(!isAccountOpen)}
            className="w-full flex items-center justify-center mb-2"
          >
            {!isAccountOpen ? <ChevronUp className="w-5 h-5 text-orange-600" /> : <ChevronDown className="w-5 h-5 text-orange-600" />}
          </button>
        )}

        {!isCollapsed && (
          <button
            onClick={() => setIsAccountOpen(!isAccountOpen)}
            className="w-full flex items-center justify-between group px-3 mb-2"
          >
            <h2 className="text-xs font-bold uppercase tracking-wider transition-colors text-orange-600">
              Account
            </h2>
            {!isAccountOpen ? <ChevronUp className="w-4 h-4 text-orange-600" /> : <ChevronDown className="w-4 h-4 text-orange-600" />}
          </button>
        )}

        <div className="space-y-1">
          {isCollapsed ? (
            <>
              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center px-2 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 text-gray-700 hover:bg-red-50 hover:text-red-600 group"
                title="Logout"
              >
                <LogOut className="h-5 w-5" />
              </button>

              <div className={`transition-all duration-300 overflow-hidden ${isAccountOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                {accountTabs.filter(tab => !tab.adminOnly || userRole === 'admin').map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id as any)}
                      className={`w-full flex items-center justify-center px-2 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 relative ${isActive
                        ? 'bg-orange-50 text-orange-600 shadow-md border border-orange-200'
                        : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                        }`}
                      title={tab.label}
                    >
                      {isActive && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-gradient-to-b from-orange-400 to-orange-600 rounded-full" />}
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
                className="w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 text-gray-700 hover:bg-red-50 hover:text-red-600"
              >
                <LogOut className="mr-3 h-5 w-5" />
                <span className="font-semibold">
                  Logout
                </span>
              </button>

              <div className={`transition-all duration-300 overflow-hidden ${isAccountOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                {accountTabs.filter(tab => !tab.adminOnly || userRole === 'admin').map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;

                  return (
                    <button
                      key={tab.id}
                      onClick={() => onTabChange(tab.id as any)}
                      className={`w-full flex items-center px-3 py-2.5 text-sm font-medium rounded-lg mb-1 transition-all duration-200 relative ${isActive
                        ? 'bg-orange-50 text-orange-600 shadow-md border border-orange-200'
                        : 'text-gray-700 hover:bg-orange-50 hover:text-orange-600'
                        }`}
                    >
                      {isActive && <div className="absolute left-1 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-gradient-to-b from-orange-400 to-orange-600 rounded-full" />}
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