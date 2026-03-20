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


function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/jobs" element={<UserDashboard />} />
        <Route path="/job/:jobId" element={<JobDetailPage />} />
        <Route path="/my-applications" element={<UserDashboard />} />
        <Route path="/profile" element={<UserProfile />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/interview" element={<InterviewResponsePage />} />
        <Route path="/verify-details" element={<VerifyDetailsPage />} />
      </Routes>
      <Toaster position="bottom-center" />
    </BrowserRouter>
  );
}

export default App
