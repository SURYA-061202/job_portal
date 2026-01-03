import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { LogOut, User, Briefcase, FileText, Bell } from 'lucide-react';
import toast from 'react-hot-toast';

export default function UserHeader() {
    const navigate = useNavigate();
    const location = useLocation();

    const isActive = (path: string) => location.pathname === path;

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/');
            toast.success('Logged out successfully');
        } catch (error) {
            console.error('Error signing out:', error);
            toast.error('Failed to log out');
        }
    };

    return (
        <header className="bg-orange-50 border-b border-orange-100 sticky top-0 z-50 shadow-sm">
            <div className="w-full px-6 lg:px-12">
                <div className="flex justify-between h-16 items-center">
                    {/* Left Side - Logo and Navigation */}
                    <div className="flex items-center gap-8">
                        <Link to="/jobs" className="flex items-center gap-3">
                            <img
                                src="/images/indianinfra.png"
                                alt="Indian Infra Logo"
                                className="w-8 h-8 object-contain"
                            />
                            <span className="text-xl font-bold font-outfit bg-gradient-to-r from-orange-500 via-orange-600 to-primary-600 bg-clip-text text-transparent">
                                Indian Infra Jobs
                            </span>
                        </Link>

                        <nav className="flex items-center gap-6">
                            <Link
                                to="/jobs"
                                className={`flex items-center gap-2 text-sm font-bold transition-all relative py-2 group ${isActive('/jobs') ? 'text-orange-600' : 'text-gray-600 hover:text-orange-600'
                                    }`}
                            >
                                <Briefcase className="w-4 h-4" />
                                <span>Find Jobs</span>
                                <div className={`absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-orange-500 to-primary-600 transition-all duration-300 ${isActive('/jobs') ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-70'
                                    }`} />
                            </Link>
                            <Link
                                to="/my-applications"
                                className={`flex items-center gap-2 text-sm font-bold transition-all relative py-2 group ${isActive('/my-applications') ? 'text-orange-600' : 'text-gray-600 hover:text-orange-600'
                                    }`}
                            >
                                <FileText className="w-4 h-4" />
                                <span>My Applications</span>
                                <div className={`absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-orange-500 to-primary-600 transition-all duration-300 ${isActive('/my-applications') ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-70'
                                    }`} />
                            </Link>
                        </nav>
                    </div>

                    {/* Right Side - Notifications, Profile, Logout */}
                    <div className="flex items-center gap-4">
                        <Link
                            to="/notifications"
                            className={`flex items-center gap-2 text-sm font-bold transition-all relative py-2 group ${isActive('/notifications') ? 'text-orange-600' : 'text-gray-600 hover:text-orange-600'
                                }`}
                        >
                            <Bell className="w-4 h-4" />
                            <span>Notifications</span>
                            <div className={`absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-orange-500 to-primary-600 transition-all duration-300 ${isActive('/notifications') ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-70'
                                }`} />
                        </Link>

                        <div className="h-6 w-px bg-gray-300 mx-2"></div>

                        <div className="flex items-center gap-3">
                            <Link
                                to="/profile"
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-orange-500 to-primary-600 flex items-center justify-center">
                                    <User className="w-4 h-4 text-white" />
                                </div>
                                <span className="text-sm font-medium text-gray-700 hidden sm:block">Profile</span>
                            </Link>

                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                <LogOut className="w-4 h-4" />
                                <span className="hidden sm:block">Logout</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}
