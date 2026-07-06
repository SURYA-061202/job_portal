import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { LogOut, Menu, X } from 'lucide-react';
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

    const isActive = (path: string) => {
        const fullUrl = location.pathname + location.search;
        return fullUrl === path;
    };

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
        { to: '/home?tab=profile', label: 'Profile' },
        { to: '/home?tab=jobs', label: 'Find Jobs' },
        { to: '/home?tab=applications', label: 'My Applications' },
        { to: '/personalized-cv', label: 'Personalized CV' },
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
                        <Link to="/home" className="flex items-center group">
                            <div className="flex items-center gap-1 font-outfit text-xl font-bold tracking-tighter">
                                <span className="text-gray-800">Indian Infra</span>
                                <span className="text-gray-800">
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
                                    </Link>
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
            <div className={`md:hidden absolute top-full left-0 w-full bg-white border-b border-gray-200 shadow-xl transition-all duration-300 origin-top ${isMenuOpen ? 'scale-y-100 opacity-100 pointer-events-auto' : 'scale-y-0 opacity-0 pointer-events-none'
                }`}>
                <div className="px-6 py-4 flex flex-col gap-2">
                    {navLinks.map((link) => (
                        <Link
                            key={link.to}
                            to={link.to}
                            onClick={() => setIsMenuOpen(false)}
                            className={`flex items-center p-4 rounded-xl transition-all ${
                                isActive(link.to) 
                                ? 'bg-orange-50 text-orange-600 font-bold' 
                                : 'text-gray-600 hover:bg-gray-50'
                            }`}
                        >
                            <span className="text-base">{link.label}</span>
                        </Link>
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
