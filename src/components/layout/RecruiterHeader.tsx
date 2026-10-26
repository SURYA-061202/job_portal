import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Menu, Pencil, X, UserCheck, CalendarClock, BadgeCheck, type LucideIcon } from 'lucide-react';
import NotificationBell from './NotificationBell';
import ExpandingModal from '@/components/subscription/ExpandingModal';
import ProfileTab from '@/components/tabs/ProfileTab';
import NotificationsTab from '@/components/tabs/NotificationsTab';
import { useSkin, FOCUS } from '@/styles/skin';

export type RecruiterNavTab =
  | 'job-posts'
  | 'upload-resumes'
  | 'candidates'
  | 'shortlisted'
  | 'interviews'
  | 'selected'
  | 'notifications'
  | 'add-members'
  | 'member-detail'
  | 'pipeline'
  | 'analytics'
  | 'profile'
  | 'assessments'
  | 'subscription';

interface RecruiterHeaderProps {
  activeTab: RecruiterNavTab;
  onTabChange: (tab: RecruiterNavTab) => void;
  onLogout: () => void;
  userRole: string | null;
}

interface NavLink {
  id: RecruiterNavTab;
  label: string;
  adminOnly?: boolean;
  /** Optional icon and one-line hint; drop-downs show them as a richer menu. */
  icon?: LucideIcon;
  hint?: string;
}

interface NavSection {
  key: string;
  label: string;
  links: NavLink[];
}

/**
 * Tabs switched on for recruiters and admins. Everything else is hidden for
 * now and is brought back one at a time: add its id here to show it again.
 */
const ENABLED_TABS: RecruiterNavTab[] = ['job-posts', 'candidates', 'shortlisted', 'interviews', 'selected', 'add-members', 'subscription'];
const SHOW_BELL = true; // notifications bell sits before Logout, like the job seeker header
const SHOW_PROFILE = true; // profile icon after the bell opens the profile panel; Logout lives inside it

/** Head-and-shoulders avatar inside a ring: the profile icon. */
function ProfileCircleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="profile-icon-clip">
          <circle cx="12" cy="12" r="9.6" />
        </clipPath>
      </defs>
      <circle cx="12" cy="12" r="10.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="9.2" r="3.6" fill="currentColor" />
      <g clipPath="url(#profile-icon-clip)">
        <ellipse cx="12" cy="21.2" rx="7.4" ry="6.2" fill="currentColor" />
      </g>
    </svg>
  );
}

/**
 * Top navigation for recruiters and admins - the same bar the job seekers get
 * (logo left, sections, notifications and logout right), replacing the old
 * sidebar. Each section opens a drop-down with its modules.
 */
export default function RecruiterHeader({ activeTab, onTabChange, onLogout, userRole }: RecruiterHeaderProps) {
  const skin = useSkin();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const [expandedMobile, setExpandedMobile] = useState<string | null>(null);
  // Profile panel on the right; it grows out of the profile icon.
  const [profileOrigin, setProfileOrigin] = useState<{ x: number; y: number } | null>(null);
  const [profileEditing, setProfileEditing] = useState(false);
  // Notifications panel on the right; it grows out of the bell.
  const [notifOrigin, setNotifOrigin] = useState<{ x: number; y: number } | null>(null);
  const openNotifications = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setNotifOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  };

  const rawSections: NavSection[] = [
    {
      key: 'screenings',
      label: 'Screenings',
      links: [
        { id: 'pipeline', label: 'Pipeline (Kanban)' },
        { id: 'candidates', label: 'Candidates' },
      ],
    },
    {
      key: 'job-posts',
      label: 'Job Posts',
      links: [
        { id: 'job-posts', label: 'Posts' },
        { id: 'analytics', label: 'Analytics' },
      ],
    },
    {
      key: 'interview',
      label: 'Interview',
      links: [
        { id: 'shortlisted', label: 'Shortlisted', icon: UserCheck, hint: 'Candidates you have shortlisted' },
        { id: 'interviews', label: 'Interview', icon: CalendarClock, hint: 'Schedule and track interview rounds' },
        { id: 'selected', label: 'Selected', icon: BadgeCheck, hint: 'Candidates who got the offer' },
      ],
    },
    {
      key: 'recruiters',
      label: 'Recruiters',
      links: [{ id: 'add-members', label: 'Recruiters', adminOnly: true }],
    },
    {
      key: 'subscription',
      label: 'Subscription',
      links: [{ id: 'subscription', label: userRole === 'admin' ? 'Subscriptions' : 'Subscription' }],
    },
  ];
  const sections = rawSections
    .map((section) => ({
      ...section,
      links: section.links.filter((l) => ENABLED_TABS.includes(l.id) && (!l.adminOnly || userRole === 'admin')),
    }))
    .filter((section) => section.links.length > 0);

  // A recruiter's detail page belongs to the Recruiters tab.
  const isActive = (id: RecruiterNavTab) =>
    id === 'add-members' ? activeTab === 'add-members' || activeTab === 'member-detail' : activeTab === id;
  const sectionActive = (section: NavSection) => section.links.some((l) => isActive(l.id));

  // Close any open drop-down on outside click or Escape.
  useEffect(() => {
    if (!openSection && !isMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenSection(null);
        setIsMenuOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (openSection && navRef.current && !navRef.current.contains(e.target as Node)) setOpenSection(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [openSection, isMenuOpen]);

  const select = (id: RecruiterNavTab) => {
    setIsMenuOpen(false);
    setOpenSection(null);
    onTabChange(id);
  };

  return (
    <header className={`relative z-40 shrink-0 ${skin.surface} border-b ${skin.edge} py-2`}>
      <div className="w-full px-4 sm:px-6 lg:px-12">
        <div className="flex items-center justify-between gap-4">
          {/* Logo and desktop navigation */}
          <div className="flex min-w-0 items-center gap-8">
            <button type="button" onClick={() => select('job-posts')} className={`flex shrink-0 items-center gap-2 cursor-pointer ${FOCUS}`} aria-label="Indian Infra Jobs - Posts">
              <img src="/images/indianinfra.png" alt="" aria-hidden="true" width={108} height={102} className="h-7 w-auto object-contain sm:h-8" />
              <div className="flex items-center gap-1 font-outfit text-xl font-bold tracking-tighter">
                <span className="text-brand">Indian</span>
                <span className="text-ink">Infra</span>
                <span className="text-ink">Jobs</span>
              </div>
            </button>

            <nav ref={navRef} aria-label="Main" className="hidden md:flex items-center gap-6">
              {sections.map((section) => {
                const open = openSection === section.key;
                const active = sectionActive(section);
                // A section with one enabled module is just that module's tab - no drop-down.
                if (section.links.length === 1) {
                  const only = section.links[0];
                  return (
                    <button
                      key={section.key}
                      type="button"
                      onClick={() => select(only.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`relative cursor-pointer whitespace-nowrap py-3 text-sm font-semibold transition-colors ${FOCUS} ${
                        active ? 'text-brand' : 'text-ink/60 hover:text-brand'
                      }`}
                    >
                      <span className="relative">
                        {only.label}
                        {active && <span aria-hidden="true" className="absolute -bottom-1 left-0 h-0.5 w-full bg-brand" />}
                      </span>
                    </button>
                  );
                }
                return (
                  <div key={section.key} className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenSection(open ? null : section.key)}
                      aria-expanded={open}
                      aria-haspopup="menu"
                      className={`relative flex cursor-pointer items-center gap-1.5 whitespace-nowrap py-3 text-sm font-semibold transition-colors ${FOCUS} ${
                        active || open ? 'text-brand' : 'text-ink/60 hover:text-brand'
                      }`}
                    >
                      <span className="relative">
                        {section.label}
                        {active && <span aria-hidden="true" className="absolute -bottom-1 left-0 h-0.5 w-full bg-brand" />}
                      </span>
                      <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && (
                      <div
                        role="menu"
                        className={`absolute left-0 top-full z-50 mt-[15px] w-72 border ${skin.edge} ${skin.surface} rounded-xl ${skin.shadow} p-2`}
                      >
                        {section.links.map((link) => {
                          const on = isActive(link.id);
                          const Icon = link.icon;
                          return (
                            <button
                              key={link.id}
                              type="button"
                              role="menuitem"
                              onClick={() => select(link.id)}
                              aria-current={on ? 'page' : undefined}
                              className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${FOCUS} ${
                                on ? 'bg-brand/10' : 'hover:bg-ink/5'
                              }`}
                            >
                              {Icon && (
                                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-brand text-surface' : 'bg-ink/5 text-ink/70'}`}>
                                  <Icon className="h-4 w-4" aria-hidden="true" />
                                </span>
                              )}
                              <span className="min-w-0">
                                <span className={`block text-sm font-semibold ${on ? 'text-brand' : 'text-ink'}`}>{link.label}</span>
                                {link.hint && <span className="block truncate text-xs text-ink/50">{link.hint}</span>}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>

          {/* Actions (desktop) */}
          <div className="hidden md:flex items-center gap-3">
            {SHOW_BELL && (
            <button
              type="button"
              onClick={openNotifications}
              aria-label="Notifications"
              title="Notifications"
              aria-expanded={!!notifOrigin}
              className={`relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${
                notifOrigin ? 'bg-ink/10 text-ink' : 'text-ink/70 hover:bg-ink/5 hover:text-ink'
              } ${FOCUS}`}
            >
              <NotificationBell simpleMode filled />
            </button>
            )}
            {SHOW_PROFILE && (
            <button
              type="button"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setProfileOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
              }}
              aria-label="Profile"
              title="Profile"
              aria-expanded={!!profileOrigin}
              className={`flex h-10 w-10 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ${
                profileOrigin ? 'bg-ink/10 text-ink' : 'text-ink/80 hover:bg-ink/5 hover:text-ink'
              } ${FOCUS}`}
            >
              <ProfileCircleIcon className="h-8 w-8" />
            </button>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center gap-1">
            {SHOW_BELL && (
            <button
              type="button"
              onClick={openNotifications}
              aria-label="Notifications"
              className={`relative cursor-pointer rounded-lg p-2 text-ink/60 hover:bg-ink/5 hover:text-ink ${FOCUS}`}
            >
              <NotificationBell simpleMode />
            </button>
            )}
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              aria-label="Toggle menu"
              aria-expanded={isMenuOpen}
              className={`cursor-pointer p-2 text-ink/60 hover:bg-ink/5 hover:text-ink ${skin.radius} transition-all ${FOCUS}`}
            >
              {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`md:hidden absolute left-0 top-full max-h-[calc(100vh-4rem)] w-full overflow-y-auto ${skin.surface} border-b ${skin.edge} ${skin.shadow} transition-all duration-300 origin-top ${
          isMenuOpen ? 'scale-y-100 opacity-100 pointer-events-auto' : 'scale-y-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col gap-1 px-4 py-4 sm:px-6">
          {sections.map((section) => {
            const expanded = expandedMobile === section.key;
            if (section.links.length === 1) {
              const only = section.links[0];
              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => select(only.id)}
                  className={`w-full cursor-pointer p-3.5 text-left text-base font-semibold ${skin.radius} transition-all ${
                    sectionActive(section) ? 'bg-brand/10 text-brand' : 'text-ink/70 hover:bg-ink/5'
                  }`}
                >
                  {only.label}
                </button>
              );
            }
            return (
              <div key={section.key}>
                <button
                  type="button"
                  onClick={() => setExpandedMobile(expanded ? null : section.key)}
                  aria-expanded={expanded}
                  className={`flex w-full cursor-pointer items-center justify-between p-3.5 text-left text-base font-semibold ${skin.radius} transition-all ${
                    sectionActive(section) ? 'text-brand' : 'text-ink/70 hover:bg-ink/5'
                  }`}
                >
                  {section.label}
                  <ChevronDown aria-hidden="true" className={`h-5 w-5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                </button>
                {expanded && (
                  <div className="mb-1 ml-3 flex flex-col gap-1 border-l border-border pl-2">
                    {section.links.map((link) => (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => select(link.id)}
                        className={`cursor-pointer p-3 text-left text-base ${skin.radius} transition-all ${
                          isActive(link.id) ? 'bg-brand/10 font-bold text-brand' : 'text-ink/60 hover:bg-ink/5'
                        }`}
                      >
                        {link.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="my-2 h-px bg-border" />
          {SHOW_PROFILE && (
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen(false);
              setProfileOrigin({ x: window.innerWidth - 40, y: 40 });
            }}
            className={`cursor-pointer p-3.5 text-left text-base text-ink/60 hover:bg-ink/5 ${skin.radius} transition-all`}
          >
            Profile
          </button>
          )}
        </div>
      </div>

      {notifOrigin && (
        <ExpandingModal title="Notifications" origin={notifOrigin} onClose={() => setNotifOrigin(null)} widthClass="max-w-[32rem]">
          <NotificationsTab embedded />
        </ExpandingModal>
      )}
      {profileOrigin && (
        <ExpandingModal
          title="Profile"
          origin={profileOrigin}
          onClose={() => {
            setProfileOrigin(null);
            setProfileEditing(false);
          }}
          widthClass="max-w-[22rem]"
          titleAction={
            <button
              type="button"
              onClick={() => setProfileEditing((v) => !v)}
              aria-label={profileEditing ? 'Cancel editing' : 'Edit profile'}
              aria-pressed={profileEditing}
              title={profileEditing ? 'Cancel editing' : 'Edit profile'}
              className={`flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg transition-colors ${
                profileEditing ? 'text-ink' : 'text-ink/50 hover:text-ink'
              } ${FOCUS}`}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          }
        >
          <ProfileTab
            embedded
            editing={profileEditing}
            onEditingChange={setProfileEditing}
            onLogout={() => {
              setProfileOrigin(null);
              setProfileEditing(false);
              onLogout();
            }}
          />
        </ExpandingModal>
      )}
    </header>
  );
}
