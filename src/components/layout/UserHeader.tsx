import { useNavigate, Link, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { LogOut, Menu, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import NotificationBell from './NotificationBell';
import { useSkin, FOCUS } from '@/styles/skin';


export default function UserHeader() {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const skin = useSkin();

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
                ? `${skin.surface} backdrop-blur-md border-b ${skin.edge} shadow-sm py-1`
                : `${skin.surface} border-b ${skin.edge} py-2`
            }`}
        >
            <div className="w-full px-6 lg:px-12">
                <div className="flex justify-between items-center">
                    {/* Left Side - Logo and Desktop Navigation */}
                    <div className="flex items-center gap-10">
                        <Link to="/home" className="flex items-center group">
                            <div className="flex items-center gap-1 font-outfit text-xl font-bold tracking-tighter">
                                <span className="text-ink">IndianInfra</span>
                                <span className="text-ink">
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
                                            isActive(link.to) ? 'text-brand' : 'text-ink/60 hover:text-brand'
                                        }`}
                                    >
                                        <span>{link.label}</span>
                                    </Link>
                                </div>
                            ))}
                        </nav>
                    </div>

                    {/* Right Side - Actions (Desktop) */}
                    <div className="hidden md:flex items-center gap-2">
                        <NotificationBell />
                        <button
                            onClick={handleLogout}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-destructive bg-surface text-destructive ${skin.radius} transition-all hover:bg-destructive/10 ${FOCUS}`}
                        >
                            <LogOut className="w-4 h-4" />
                            <span>Logout</span>
                        </button>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden flex items-center">
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className={`p-2 text-ink/60 hover:bg-ink/5 hover:text-ink ${skin.radius} transition-all ${FOCUS}`}
                        >
                            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu Overlay */}
            <div className={`md:hidden absolute top-full left-0 w-full ${skin.surface} border-b ${skin.edge} ${skin.shadow} transition-all duration-300 origin-top ${isMenuOpen ? 'scale-y-100 opacity-100 pointer-events-auto' : 'scale-y-0 opacity-0 pointer-events-none'
                }`}>
                <div className="px-6 py-4 flex flex-col gap-2">
                    {navLinks.map((link) => (
                        <Link
                            key={link.to}
                            to={link.to}
                            onClick={() => setIsMenuOpen(false)}
                            className={`flex items-center p-4 ${skin.radius} transition-all ${
                                isActive(link.to)
                                ? 'bg-brand/10 text-brand font-bold'
                                : 'text-ink/60 hover:bg-ink/5'
                            }`}
                        >
                            <span className="text-base">{link.label}</span>
                        </Link>
                    ))}
                    <div className="h-px bg-border my-2"></div>
                    <div className={`flex items-center gap-3 p-4 ${skin.radius} text-ink/60`}>
                        <NotificationBell />
                        <span className="text-base font-medium">Notifications</span>
                    </div>
                    <button
                        onClick={() => {
                            setIsMenuOpen(false);
                            handleLogout();
                        }}
                        className={`flex items-center gap-4 p-4 ${skin.radius} border border-destructive bg-surface text-destructive hover:bg-destructive/10 transition-all text-left w-full ${FOCUS}`}
                    >
                        <LogOut className="w-5 h-5" />
                        <span className="text-base font-medium">Logout</span>
                    </button>
                </div>
            </div>
        </header>
    );
}
