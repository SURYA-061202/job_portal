'use client';

import { FileText, Users, CheckCircle, BarChart, LogOut } from 'lucide-react';

interface SidebarProps {
  activeTab: 'resumes' | 'interviews' | 'selected' | 'stats';
  onTabChange: (tab: 'resumes' | 'interviews' | 'selected' | 'stats') => void;
  onLogout: () => void;
}

export default function Sidebar({ activeTab, onTabChange, onLogout }: SidebarProps) {
  const tabs = [
    { id: 'resumes', label: 'Resumes', icon: FileText },
    { id: 'interviews', label: 'Interviews', icon: Users },
    { id: 'selected', label: 'Candidates', icon: CheckCircle },
    { id: 'stats', label: 'Stats', icon: BarChart },
  ];

  return (
    <div className="w-64 bg-white shadow-lg">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Recruitment <span className="text-primary-600">Portal</span>
        </h1>
      </div>
      
      <nav className="mt-6">
        <div className="px-3">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id as 'resumes' | 'interviews' | 'selected' | 'stats')}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md mb-1 transition-colors ${
                  isActive
                    ? 'bg-primary-100 text-primary-700'
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
      
      <div className="absolute bottom-0 w-64 p-4">
        <button
          onClick={onLogout}
          className="w-full flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-md transition-colors"
        >
          <LogOut className="mr-3 h-5 w-5 text-red-600" />
          Logout
        </button>
      </div>
    </div>
  );
} 