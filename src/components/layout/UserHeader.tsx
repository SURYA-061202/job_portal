import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { LogOut, User, FileText, Menu, X, Rocket, BellRing } from 'lucide-react';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

export default function UserHeader() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 20);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

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

    const navLinks = [
        { to: '/jobs', label: 'Find Jobs', icon: Rocket },
        { to: '/my-applications', label: 'My Applications', icon: FileText },
        { to: '/notifications', label: 'Notifications', icon: BellRing },
    ];

    return (
        <header 
            className={`sticky top-0 z-50 transition-all duration-300 ${
                scrolled 
                ? 'bg-white/80 backdrop-blur-md border-b border-gray-200/50 shadow-sm py-2' 
                : 'bg-white border-b border-gray-200 py-4'
            }`}
        >
            <div className="w-full px-6 lg:px-12">
                <div className="flex justify-between items-center">
                    {/* Left Side - Logo and Desktop Navigation */}
                    <div className="flex items-center gap-10">
                        <Link to="/jobs" className="flex items-center gap-3 group">
                            <div className="relative">
                                <img
                                    src="/images/indianinfra.png"
                                    alt="Indian Infra Logo"
                                    className="w-11 h-11 object-contain transition-transform duration-500 group-hover:rotate-[10deg]"
                                />
                                <div className="absolute -inset-2 bg-orange-500/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            </div>
                            <div className="flex items-center gap-1 font-outfit text-2xl font-bold tracking-tighter">
                                <span className="text-gray-800">Indian Infra</span>
                                <span className="bg-gradient-to-r from-orange-600 via-rose-500 to-amber-500 bg-clip-text text-transparent animate-gradient-x">
                                    Jobs
                                </span>
                            </div>
                        </Link>

                        <nav className="hidden md:flex items-center gap-8">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.to}
                                    to={link.to}
                                    className={`flex items-center gap-2 text-sm font-semibold transition-all relative py-2 group ${
                                        isActive(link.to) ? 'text-orange-600' : 'text-gray-500 hover:text-orange-600'
                                    }`}
                                >
                                    <link.icon className={`w-4 h-4 transition-transform duration-300 ${isActive(link.to) ? 'scale-110' : 'group-hover:scale-110'}`} />
                                    <span>{link.label}</span>
                                    <div className={`absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-orange-500 to-primary-600 transition-all duration-300 origin-left ${
                                        isActive(link.to) ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0 group-hover:scale-x-100 group-hover:opacity-70'
                                    }`} />
                                </Link>
                            ))}
                        </nav>
                    </div>

                    {/* Right Side - Profile & Actions (Desktop) */}
                    <div className="hidden md:flex items-center gap-4">
                        <div className="h-6 w-px bg-gray-200 mx-2"></div>
                        <div className="flex items-center gap-3">
                            <Link
                                to="/profile"
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all group ${
                                    isActive('/profile') 
                                    ? 'bg-gradient-to-r from-orange-500 to-primary-600 text-white shadow-md shadow-orange-500/20' 
                                    : 'hover:bg-gray-50 text-gray-700'
                                }`}
                            >
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                                    isActive('/profile') ? 'bg-white/20' : 'bg-gradient-to-r from-orange-500 to-primary-600'
                                }`}>
                                    <User className={`w-4 h-4 ${isActive('/profile') ? 'text-white' : 'text-white'}`} />
                                </div>
                                <span className="text-sm font-bold font-inter">Profile</span>
                            </Link>

                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                            >
                                <LogOut className="w-4 h-4" />
                                <span>Logout</span>
                            </button>
                        </div>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden flex items-center gap-4">
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-all focus:outline-none"
                        >
                            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            <div className={`md:hidden absolute top-full left-0 w-full bg-white border-b border-gray-200 shadow-xl transition-all duration-300 origin-top ${
                isMenuOpen ? 'scale-y-100 opacity-100 pointer-events-auto' : 'scale-y-0 opacity-0 pointer-events-none'
            }`}>
                <div className="px-6 py-4 flex flex-col gap-2">
                    {navLinks.map((link) => (
                        <Link
                            key={link.to}
                            to={link.to}
                            onClick={() => setIsMenuOpen(false)}
                            className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                                isActive(link.to) 
                                ? 'bg-orange-50 text-orange-600 font-bold' 
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            <link.icon className="w-5 h-5" />
                            <span className="text-base">{link.label}</span>
                        </Link>
                    ))}
                    <div className="h-px bg-gray-100 my-2"></div>
                    <Link
                        to="/profile"
                        onClick={() => setIsMenuOpen(false)}
                        className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                            isActive('/profile') 
                            ? 'bg-orange-50 text-orange-600 font-bold' 
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        <User className="w-5 h-5" />
                        <span className="text-base">Profile</span>
                    </Link>
                    <button
                        onClick={() => {
                            setIsMenuOpen(false);
                            handleLogout();
                        }}
                        className="flex items-center gap-4 p-4 rounded-xl text-red-600 hover:bg-red-50 transition-all text-left"
                    >
                        <LogOut className="w-5 h-5" />
                        <span className="text-base font-medium">Logout</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
