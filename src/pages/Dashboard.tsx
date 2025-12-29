import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import Sidebar from '@/components/layout/Sidebar';
import JobPostsTab from '@/components/tabs/JobPostsTab';
import UploadResumesTab from '@/components/tabs/UploadResumesTab';
import CandidatesTab from '@/components/tabs/CandidatesTab';
import InterviewsTab from '@/components/tabs/InterviewsTab';
import SelectedCandidatesTab from '@/components/tabs/SelectedCandidatesTab';
import StatsTab from '@/components/tabs/StatsTab';
import NotificationsTab from '@/components/tabs/NotificationsTab';
import ShortlistedTab from '@/components/tabs/ShortlistedTab.tsx';
import AddMembersTab from '@/components/tabs/AddMembersTab';
import RecruitmentPipelineTab from '@/components/tabs/RecruitmentPipelineTab';
import ProfileTab from '@/components/tabs/ProfileTab';

import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';

export type TabType = 'job-posts' | 'upload-resumes' | 'candidates' | 'shortlisted' | 'interviews' | 'selected' | 'stats' | 'notifications' | 'add-members' | 'pipeline' | 'analytics' | 'profile';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('job-posts');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (usr) => {
      if (!usr) {
        navigate('/');
        return;
      }

      // Check role
      try {
        const userDoc = await getDoc(doc(db, 'users', usr.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.role !== 'manager' && userData.role !== 'recruiter') {
            navigate('/jobs', { replace: true });
          }
        }
      } catch (error) {
        console.error('Error checking role in Dashboard:', error);
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

  const handleViewCandidates = (postId: string) => {
    setSelectedPostId(postId);
    setActiveTab('candidates');
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
      case 'job-posts':
        return <JobPostsTab onViewCandidates={handleViewCandidates} />;
      case 'upload-resumes':
        return <UploadResumesTab />;
      case 'candidates':
        return <CandidatesTab postId={selectedPostId} onClearFilter={() => setSelectedPostId(null)} />;
      case 'shortlisted':
        return <ShortlistedTab />;
      case 'interviews':
        return <InterviewsTab />;
      case 'selected':
        return <SelectedCandidatesTab />;
      case 'stats':
        return <StatsTab />;
      case 'notifications':
        return <NotificationsTab />;
      case 'add-members':
        return <AddMembersTab />;
      case 'pipeline':
        return <RecruitmentPipelineTab />;
      case 'analytics':
        return <AnalyticsDashboard />;
      case 'profile':
        return <ProfileTab />;
      default:
        return <JobPostsTab onViewCandidates={handleViewCandidates} />;
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