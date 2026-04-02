import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { LogOut, Menu, X, ChevronDown } from 'lucide-react';
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
        { to: '/home', label: 'Home' },
        { to: '/personalized-cv', label: 'Personalized CV' },
        { to: '/training-module', label: 'Training Module' },
        { to: '/career-assistance', label: 'Career Assistance' },
    ];

    return (
        <header 
            className={`sticky top-0 z-50 transition-all duration-300 ${
                scrolled 
                ? 'bg-white/80 backdrop-blur-md border-b border-gray-200/50 shadow-sm py-1' 
                : 'bg-white border-b border-gray-200 py-2'
            }`}
        >
            <div className="w-full px-6 lg:px-12">
                <div className="flex justify-between items-center">
                    {/* Left Side - Logo and Desktop Navigation */}
                    <div className="flex items-center gap-10">
                        <Link to="/home" className="flex items-center gap-3 group">
                            <div className="relative">
                                <img
                                    src="/images/indianinfra.png"
                                    alt="Indian Infra Logo"
                                    className="w-9 h-9 object-contain transition-transform duration-500 group-hover:rotate-[10deg]"
                                />
                                <div className="absolute -inset-2 bg-orange-500/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            </div>
                            <div className="flex items-center gap-1 font-outfit text-xl font-bold tracking-tighter">
                                <span className="text-gray-800">Indian Infra</span>
                                <span className="bg-gradient-to-r from-orange-600 via-rose-500 to-amber-500 bg-clip-text text-transparent animate-gradient-x">
                                    Jobs
                                </span>
                            </div>
                        </Link>

                        <nav className="hidden md:flex items-center gap-8">
                            {navLinks.map((link) => (
                                <div key={link.to} className="relative group/nav">
                                    <Link
                                        to={link.to}
                                        className={`flex items-center gap-2 text-sm font-semibold transition-all relative py-3 ${
                                            isActive(link.to) ? 'text-orange-600' : 'text-gray-500 hover:text-orange-600'
                                        }`}
                                    >
                                        <span>{link.label}</span>
                                        {link.label === 'Home' && <ChevronDown className="w-3.5 h-3.5 opacity-50 group-hover/nav:rotate-180 transition-transform duration-300" />}
                                    </Link>

                                    {/* Sub-tab dropdown for Home */}
                                    {link.label === 'Home' && (
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 opacity-0 invisible group-hover/nav:opacity-100 group-hover/nav:visible transition-all duration-300 transform group-hover/nav:translate-y-0 translate-y-2 z-50">
                                            <div className="bg-white border border-gray-100 rounded-2xl shadow-xl overflow-hidden min-w-[200px] p-2 flex flex-col gap-1 ring-1 ring-black/5">
                                                <Link 
                                                    to="/home?tab=profile" 
                                                    className="px-4 py-3 text-xs font-bold text-gray-700 hover:text-orange-600 hover:bg-orange-50 rounded-xl transition-all"
                                                >
                                                    Profile Update
                                                </Link>
                                                <Link 
                                                    to="/home?tab=jobs" 
                                                    className="px-4 py-3 text-xs font-bold text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                                >
                                                    Find Jobs
                                                </Link>
                                                <Link 
                                                    to="/home?tab=applications" 
                                                    className="px-4 py-3 text-xs font-bold text-gray-700 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all"
                                                >
                                                    My Applications
                                                </Link>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </nav>
                    </div>

                    {/* Right Side - Actions (Desktop) */}
                    <div className="hidden md:flex items-center gap-4">
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                        >
                            <LogOut className="w-4 h-4" />
                            <span>Logout</span>
                        </button>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden flex items-center">
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
                        <div key={link.to}>
                            <Link
                                to={link.to}
                                onClick={() => link.label !== 'Home' && setIsMenuOpen(false)}
                                className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                                    isActive(link.to) 
                                    ? 'bg-orange-50 text-orange-600 font-bold' 
                                    : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                <span className="text-base">{link.label}</span>
                                {link.label === 'Home' && <ChevronDown className={`w-4 h-4 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />}
                            </Link>
                            
                            {link.label === 'Home' && (
                                <div className="pl-6 pr-4 py-2 flex flex-col gap-1">
                                    <Link 
                                        to="/home?tab=profile" 
                                        onClick={() => setIsMenuOpen(false)}
                                        className="py-3 px-4 text-sm font-semibold text-gray-600 hover:text-orange-600 rounded-lg hover:bg-orange-50 transition-colors"
                                    >
                                        Profile Update
                                    </Link>
                                    <Link 
                                        to="/home?tab=jobs" 
                                        onClick={() => setIsMenuOpen(false)}
                                        className="py-3 px-4 text-sm font-semibold text-gray-600 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                                    >
                                        Find Jobs
                                    </Link>
                                    <Link 
                                        to="/home?tab=applications" 
                                        onClick={() => setIsMenuOpen(false)}
                                        className="py-3 px-4 text-sm font-semibold text-gray-600 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"
                                    >
                                        My Applications
                                    </Link>
                                </div>
                            )}
                        </div>
                    ))}
                    <div className="h-px bg-gray-100 my-2"></div>
                    <button
                        onClick={() => {
                            setIsMenuOpen(false);
                            handleLogout();
                        }}
                        className="flex items-center gap-4 p-4 rounded-xl text-red-600 hover:bg-red-50 transition-all text-left w-full"
                    >
                        <LogOut className="w-5 h-5" />
                        <span className="text-base font-medium">Logout</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
