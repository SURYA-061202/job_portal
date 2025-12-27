import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { LogOut, User, Briefcase, Bell } from 'lucide-react';
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
        <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                    <div className="flex items-center gap-8">
                        <Link to="/jobs" className="flex items-center gap-2">
                            <div className="bg-orange-gradient p-1.5 rounded-lg">
                                <Briefcase className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-xl font-bold text-gray-900 font-outfit">Job<span className="text-orange-gradient">Portal</span></span>
                        </Link>

                        <nav className="hidden md:flex items-center gap-6">
                            <Link
                                to="/jobs"
                                className={`text-sm font-bold transition-all relative py-2 group ${isActive('/jobs') ? 'text-primary-600' : 'text-gray-500 hover:text-primary-600'
                                    }`}
                            >
                                Find Jobs
                                <div className={`absolute bottom-0 left-0 w-full h-0.5 bg-orange-gradient transition-all duration-300 ${isActive('/jobs') ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-50'
                                    }`} />
                            </Link>
                            <Link
                                to="/my-applications"
                                className={`text-sm font-bold transition-all relative py-2 group ${isActive('/my-applications') ? 'text-primary-600' : 'text-gray-500 hover:text-primary-600'
                                    }`}
                            >
                                My Applications
                                <div className={`absolute bottom-0 left-0 w-full h-0.5 bg-orange-gradient transition-all duration-300 ${isActive('/my-applications') ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-50'
                                    }`} />
                            </Link>
                        </nav>
                    </div>

                    <div className="flex items-center gap-4">
                        <button className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-full transition-all">
                            <Bell className="w-5 h-5" />
                        </button>

                        <div className="h-6 w-px bg-gray-200 mx-2"></div>

                        <div className="flex items-center gap-3">
                            <Link
                                to="/profile"
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                                    <User className="w-4 h-4 text-primary-600" />
                                </div>
                                <span className="text-sm font-medium text-gray-700 hidden sm:block">Profile</span>
                            </Link>

                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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
