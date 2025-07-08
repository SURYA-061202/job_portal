import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Sidebar from '@/components/layout/Sidebar';
import ResumesTab from '@/components/tabs/ResumesTab';
import InterviewsTab from '@/components/tabs/InterviewsTab';
import CandidatesTab from '@/components/tabs/SelectedCandidatesTab';
import StatsTab from '@/components/tabs/StatsTab';
import ShortlistedTab from '@/components/tabs/ShortlistedTab.tsx';

export type TabType = 'resumes' | 'shortlisted' | 'interviews' | 'selected' | 'stats';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('resumes');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (usr) => {
      if (!usr) {
        navigate('/');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600" />
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'resumes':
        return <ResumesTab />;
      case 'shortlisted':
        return <ShortlistedTab />;
      case 'interviews':
        return <InterviewsTab />;
      case 'selected':
        return <CandidatesTab />;
      case 'stats':
        return <StatsTab />;
      default:
        return <ResumesTab />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} onLogout={handleLogout} />
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="p-6 flex-1 flex flex-col">{renderTabContent()}</div>
      </main>
    </div>
  );
} 