import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { LogOut, User, Briefcase, FileText, Bell, Menu, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useState } from 'react';

export default function UserHeader() {
    const navigate = useNavigate();
    const location = useLocation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
            <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
                <div className="w-full px-4 sm:px-6 lg:px-12">
                    <div className="flex justify-between h-16 items-center">
                        {/* Left Side - Logo and Desktop Navigation */}
                        <div className="flex items-center gap-4 sm:gap-8">
                            <Link to="/jobs" className="flex items-center gap-2 sm:gap-3">
                                <img
                                    src="/images/indianinfra.png"
                                    alt="Indian Infra Logo"
                                    className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
                                />
                                <span className="text-base sm:text-xl font-bold font-outfit bg-gradient-to-r from-orange-500 via-orange-600 to-primary-600 bg-clip-text text-transparent whitespace-nowrap">
                                    Indian Infra Jobs
                                </span>
                            </Link>

                            {/* Desktop Navigation - Hidden on mobile */}
                            <nav className="hidden md:flex items-center gap-6">
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

                        {/* Right Side - Desktop Actions */}
                        <div className="hidden md:flex items-center gap-4">
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
                                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gradient-to-r hover:from-orange-500 hover:to-primary-600 hover:text-white transition-all group"
                                >
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-orange-500 to-primary-600 flex items-center justify-center">
                                        <User className="w-4 h-4 text-white" />
                                    </div>
                                    <span className="text-sm font-medium text-gray-700 group-hover:text-white hidden sm:block transition-colors">Profile</span>
                                </Link>

                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gradient-to-r hover:from-orange-500 hover:to-primary-600 hover:text-white rounded-lg transition-all"
                                >
                                    <LogOut className="w-4 h-4" />
                                    <span className="hidden sm:block">Logout</span>
                                </button>
                            </div>
                        </div>

                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                            aria-label="Toggle menu"
                        >
                            {mobileMenuOpen ? (
                                <X className="w-6 h-6 text-gray-600" />
                            ) : (
                                <Menu className="w-6 h-6 text-gray-600" />
                            )}
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile Menu Drawer */}
            {mobileMenuOpen && (
                <div className="fixed inset-0 z-40 md:hidden">
                    {/* Overlay */}
                    <div
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setMobileMenuOpen(false)}
                    />

                    {/* Menu Panel */}
                    <div className="fixed top-16 left-0 right-0 bg-white border-b border-gray-200 shadow-xl animate-in slide-in-from-top duration-300">
                        <nav className="px-4 py-6 space-y-1">
                            <Link
                                to="/jobs"
                                onClick={() => setMobileMenuOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive('/jobs')
                                    ? 'bg-gradient-to-r from-orange-500 to-primary-600 text-white'
                                    : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                            >
                                <Briefcase className="w-5 h-5" />
                                <span className="font-bold">Find Jobs</span>
                            </Link>

                            <Link
                                to="/my-applications"
                                onClick={() => setMobileMenuOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive('/my-applications')
                                    ? 'bg-gradient-to-r from-orange-500 to-primary-600 text-white'
                                    : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                            >
                                <FileText className="w-5 h-5" />
                                <span className="font-bold">My Applications</span>
                            </Link>

                            <Link
                                to="/notifications"
                                onClick={() => setMobileMenuOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive('/notifications')
                                    ? 'bg-gradient-to-r from-orange-500 to-primary-600 text-white'
                                    : 'text-gray-700 hover:bg-gray-100'
                                    }`}
                            >
                                <Bell className="w-5 h-5" />
                                <span className="font-bold">Notifications</span>
                            </Link>

                            <div className="h-px bg-gray-200 my-4" />

                            <Link
                                to="/profile"
                                onClick={() => setMobileMenuOpen(false)}
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-gray-700 hover:bg-gray-100 transition-all"
                            >
                                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-orange-500 to-primary-600 flex items-center justify-center">
                                    <User className="w-4 h-4 text-white" />
                                </div>
                                <span className="font-bold">Profile</span>
                            </Link>

                            <button
                                onClick={() => {
                                    setMobileMenuOpen(false);
                                    handleLogout();
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-all"
                            >
                                <LogOut className="w-5 h-5" />
                                <span className="font-bold">Logout</span>
                            </button>
                        </nav>
                    </div>
                </div>
            )}
        </>
    );
}
