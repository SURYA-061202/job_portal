import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  const location = useLocation();

  useEffect(() => {
    if (location.state && (location.state as any).activeTab) {
      setActiveTab((location.state as any).activeTab);
      if ((location.state as any).postId) {
        setSelectedPostId((location.state as any).postId);
      }
      // Clear state to avoid getting stuck
      window.history.replaceState({}, document.title);
    }
  }, [location]);

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

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    // When manually switching tabs, clear selectedPostId so we don't carry over context unwontedly.
    // Specifically for Candidates tab, we want to show ALL candidates if accessed via sidebar.
    // For Job Posts, we want to show the list, not a specific detail view.
    // For others, it doesn't matter much but cleaner to reset.
    // However, if we stay on 'candidates', selectedPostId is preserved if we just view details and come back?
    // This function is for global tab switching (Sidebar).
    if (tab === 'candidates' || tab === 'job-posts') {
      setSelectedPostId(null);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'job-posts':
        return <JobPostsTab onViewCandidates={handleViewCandidates} initialSelectedPostId={selectedPostId} />;
      case 'upload-resumes':
        return <UploadResumesTab />;
      case 'candidates':
        // Only show Back button if we have a selectedPostId (meaning we came from Job Details)
        // If selectedPostId is null (Sidebar access), no Back button.
        return (
          <CandidatesTab
            postId={selectedPostId}
            onClearFilter={() => setSelectedPostId(null)}
            onBack={selectedPostId ? () => setActiveTab('job-posts') : undefined}
          />
        );
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} onLogout={handleLogout} />
      <main className="flex-1 overflow-auto flex flex-col">
        <div className="p-6 flex-1 flex flex-col">{renderTabContent()}</div>
      </main>
    </div>
  );
}