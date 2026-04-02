import './index.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import InterviewResponsePage from './pages/InterviewResponsePage';
import VerifyDetailsPage from './pages/VerifyDetailsPage';
import UserDashboard from './pages/UserDashboard';
import UserProfile from './components/user/UserProfile';
import NotificationsPage from './pages/NotificationsPage';
import JobDetailPage from './pages/JobDetailPage';

import VerifiedProfilePage from './pages/VerifiedProfilePage';
import PersonalizedCVPage from './pages/PersonalizedCVPage';
import TrainingModulePage from './pages/TrainingModulePage';
import CareerAssistancePage from './pages/CareerAssistancePage';
import MatchingJobs from './pages/MatchingJobs';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/jobs" element={<UserDashboard />} />
        <Route path="/job/:jobId" element={<JobDetailPage />} />
        <Route path="/my-applications" element={<UserDashboard />} />
        <Route path="/home" element={<UserProfile />} />
        <Route path="/verified-profile" element={<VerifiedProfilePage />} />
        <Route path="/personalized-cv" element={<PersonalizedCVPage />} />
        <Route path="/training-module" element={<TrainingModulePage />} />
        <Route path="/career-assistance" element={<CareerAssistancePage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/interview" element={<InterviewResponsePage />} />
        <Route path="/verify-details" element={<VerifyDetailsPage />} />
        <Route path="/matching-jobs" element={<MatchingJobs />} />
      </Routes>
      <Toaster position="bottom-center" />
    </BrowserRouter>
  );
}

export default App
