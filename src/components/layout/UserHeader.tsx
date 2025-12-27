import { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { LogOut, User, Bell, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function UserHeader() {
    const navigate = useNavigate();
    const location = useLocation();
    const [showNotifications, setShowNotifications] = useState(false);

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
        <>
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16 items-center">
                        <div className="flex items-center gap-8">
                            <Link to="/jobs" className="flex items-center gap-3">
                                <img
                                    src="/images/indianinfra.png"
                                    alt="Indian Infra Logo"
                                    className="w-8 h-8 object-contain"
                                />
                                <span className="text-xl font-bold text-gray-900 font-outfit">Indian Infra <span className="text-orange-gradient">Jobs</span></span>
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
                            <button
                                onClick={() => setShowNotifications(!showNotifications)}
                                className="relative p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-full transition-all"
                            >
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

            {/* Notifications Panel */}
            {showNotifications && (
                <div className="fixed inset-0 z-50" onClick={() => setShowNotifications(false)}>
                    <div className="absolute top-16 right-4 sm:right-8 w-80 bg-white rounded-lg shadow-2xl border border-gray-200 animate-in slide-in-from-top-2 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-gray-200">
                            <h3 className="text-lg font-bold text-gray-900">Notifications</h3>
                            <button
                                onClick={() => setShowNotifications(false)}
                                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                            >
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-8 text-center">
                            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <p className="text-gray-500 font-medium">No Notifications till now</p>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
