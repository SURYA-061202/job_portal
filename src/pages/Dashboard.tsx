import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import RecruiterHeader from '@/components/layout/RecruiterHeader';
import JobPostsTab from '@/components/tabs/JobPostsTab';
// import UploadResumesTab from '@/components/tabs/UploadResumesTab'; // hidden: Resume Upload module disabled on recruiter/admin side
import CandidatesTab from '@/components/tabs/CandidatesTab';
import InterviewsTab from '@/components/tabs/InterviewsTab';
import SelectedCandidatesTab from '@/components/tabs/SelectedCandidatesTab';
import NotificationsTab from '@/components/tabs/NotificationsTab';
import ShortlistedTab from '@/components/tabs/ShortlistedTab.tsx';
import AddMembersTab from '@/components/tabs/AddMembersTab';
import MemberDetailContent from '@/components/tabs/MemberDetailContent';
import RecruitmentPipelineTab from '@/components/tabs/RecruitmentPipelineTab';
import ProfileTab from '@/components/tabs/ProfileTab';
import AssessmentsTab from '@/components/tabs/AssessmentsTab';
import { useSkin } from '@/styles/skin';

import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';
import AdminSubscriptionTab from '@/components/subscription/AdminSubscriptionTab';
import RecruiterSubscriptionTab from '@/components/subscription/RecruiterSubscriptionTab';
import { useSubscription } from '@/lib/useSubscription';

export type TabType = 'job-posts' | 'upload-resumes' | 'candidates' | 'shortlisted' | 'interviews' | 'selected' | 'notifications' | 'add-members' | 'member-detail' | 'pipeline' | 'analytics' | 'profile' | 'assessments' | 'subscription';

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabType>('candidates');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [selectedPostTitle, setSelectedPostTitle] = useState<string | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  // Live plan + limits: updates the moment the admin approves a request.
  const subscription = useSubscription(userId);
  const navigate = useNavigate();
  const location = useLocation();
  const skin = useSkin();

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
          if (userData.role !== 'manager' && userData.role !== 'recruiter' && userData.role !== 'admin') {
            navigate('/jobs', { replace: true });
          }
          setUserRole(userData.role);
          setUserId(usr.uid);
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

  const handleViewCandidates = (postId: string, postTitle?: string) => {
    setSelectedPostId(postId);
    setSelectedPostTitle(postTitle || null);
    setActiveTab('candidates');
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'candidates' || tab === 'job-posts') {
      setSelectedPostId(null);
      setSelectedPostTitle(null);
    }
    if (tab !== 'member-detail') {
      setSelectedMemberId(null);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'job-posts':
        return <JobPostsTab onViewCandidates={handleViewCandidates} initialSelectedPostId={selectedPostId} userRole={userRole} userId={userId} subscription={subscription} />;
      case 'upload-resumes':
        // Hidden: Resume Upload module is disabled on the recruiter/admin side.
        return null;
      case 'candidates':
        return (
          <CandidatesTab
            postId={selectedPostId}
            postTitle={selectedPostTitle}
            userRole={userRole}
            userId={userId}
            candidateLimit={subscription?.maxCandidates}
            planName={subscription?.planName}
            canViewContact={!!subscription && subscription.source !== 'free'}
            onViewPlans={() => handleTabChange('subscription')}
            onClearFilter={() => setSelectedPostId(null)}
            onBack={selectedPostId ? () => setActiveTab('job-posts') : undefined}
            onNavigateToShortlisted={(candidateId) => {
              setSelectedCandidateId(candidateId);
              setActiveTab('shortlisted');
            }}
          />
        );
      case 'shortlisted':
        return (
          <ShortlistedTab
            candidateId={selectedCandidateId}
            userRole={userRole}
            userId={userId}
            onBack={selectedCandidateId ? () => {
              setSelectedCandidateId(null);
              setActiveTab('candidates');
            } : undefined}
          />
        );
      case 'interviews':
        return <InterviewsTab userRole={userRole} userId={userId} onCandidateSelected={() => setActiveTab('selected')} />;
      case 'selected':
        return <SelectedCandidatesTab userRole={userRole} userId={userId} />;
      case 'notifications':
        return <NotificationsTab />;
      case 'add-members':
        return <AddMembersTab onViewMember={(memberId) => {
          setSelectedMemberId(memberId);
          setActiveTab('member-detail');
        }} />;
      case 'member-detail':
        return (
          <MemberDetailContent
            memberId={selectedMemberId}
            onBack={() => {
              setSelectedMemberId(null);
              setActiveTab('add-members');
            }}
          />
        );
      case 'pipeline':
        return <RecruitmentPipelineTab userRole={userRole} userId={userId} />;
      case 'analytics':
        return <AnalyticsDashboard userRole={userRole} userId={userId} />;
      case 'profile':
        return <ProfileTab />;
      case 'assessments':
        return <AssessmentsTab />;
      case 'subscription':
        return userRole === 'admin'
          ? <AdminSubscriptionTab adminId={userId} />
          : <RecruiterSubscriptionTab userId={userId} subscription={subscription} />;
      default:
        return <JobPostsTab onViewCandidates={handleViewCandidates} userRole={userRole} userId={userId} subscription={subscription} />;
    }
  };

  // Wait for the plan too, so the Candidates list never flashes the wrong limit.
  if (loading || (userId && !subscription)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-brand" />
      </div>
    );
  }

  // Tabs that manage their own internal scrolling (fixed header + scrollable body).
  // For these, <main> must not scroll, and the content wrapper needs min-h-0 so the
  // flex chain resolves to a bounded height instead of growing with its content.
  const isSelfScrollingTab = activeTab === 'job-posts' || activeTab === 'analytics' || activeTab === 'pipeline' || activeTab === 'shortlisted' || activeTab === 'interviews' || activeTab === 'selected' || activeTab === 'candidates' || activeTab === 'notifications';

  return (
    <div className={`flex h-screen flex-col ${skin.canvas}`}>
      <RecruiterHeader
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onLogout={handleLogout}
        userRole={userRole}
      />

      <main className={`flex-1 min-h-0 ${isSelfScrollingTab ? 'overflow-hidden' : 'overflow-auto'} thin-scrollbar flex flex-col relative w-full`}>
        <div className={`mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 md:py-6 flex-1 flex flex-col relative z-10 ${isSelfScrollingTab ? 'min-h-0' : ''}`}>{renderTabContent()}</div>
      </main>
    </div>
  );
}
