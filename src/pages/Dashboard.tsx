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
      <main className="flex-1 overflow-auto thin-scrollbar flex flex-col relative">
        {/* Gradient Background with Dotted Patterns */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Soft gradient overlay - top to bottom */}
          <div
            className="absolute inset-0 opacity-30"
            style={{
              background: 'linear-gradient(135deg, rgba(249, 250, 251, 0.5) 0%, rgba(229, 231, 235, 0.3) 50%, rgba(249, 250, 251, 0.5) 100%)',
            }}
          />

          {/* Dotted halftone pattern - top right */}
          <div
            className="absolute top-0 right-0 w-80 h-80 opacity-50"
            style={{
              backgroundImage: `radial-gradient(circle, rgba(209, 213, 219, 0.8) 1.5px, transparent 1.5px)`,
              backgroundSize: '10px 10px',
              maskImage: 'radial-gradient(ellipse at top right, black 0%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(ellipse at top right, black 0%, transparent 70%)',
            }}
          />

          {/* Dotted halftone pattern - bottom left */}
          <div
            className="absolute bottom-0 left-0 w-80 h-80 opacity-50"
            style={{
              backgroundImage: `radial-gradient(circle, rgba(209, 213, 219, 0.8) 1.5px, transparent 1.5px)`,
              backgroundSize: '10px 10px',
              maskImage: 'radial-gradient(ellipse at bottom left, black 0%, transparent 70%)',
              WebkitMaskImage: 'radial-gradient(ellipse at bottom left, black 0%, transparent 70%)',
            }}
          />

          {/* Subtle wave accent */}
          <div
            className="absolute top-1/4 left-0 w-full h-64 opacity-20"
            style={{
              background: 'radial-gradient(ellipse 80% 50% at 50% 50%, rgba(229, 231, 235, 0.6) 0%, transparent 70%)',
            }}
          />
        </div>

        <div className="p-6 flex-1 flex flex-col relative z-10">{renderTabContent()}</div>
      </main>
    </div>
  );
}