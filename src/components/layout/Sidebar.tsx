'use client';

import {
  Award,
  BarChart3,
  Briefcase,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  MessageSquare,
  SquareKanban,
  Upload,
  User,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import NotificationBell from './NotificationBell';
import { useState } from 'react';
import { useAppStyle } from '@/lib/appStyle';

interface SidebarProps {
  activeTab: 'job-posts' | 'upload-resumes' | 'candidates' | 'shortlisted' | 'interviews' | 'selected' | 'stats' | 'notifications' | 'add-members' | 'member-detail' | 'pipeline' | 'analytics' | 'profile' | 'assessments';
  onTabChange: (tab: any) => void;
  onLogout: () => void;
  userRole: string | null;
}

type TabId = SidebarProps['activeTab'];

interface NavTab {
  id: TabId;
  label: string;
  /** Half-width label for the icon rail. Falls back to `label`. */
  short?: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

interface NavSection {
  key: string;
  label: string;
  /** Group heading for the icon rail. */
  short: string;
  tabs: NavTab[];
}

/* Six rails, one type system and one orange. The active rail lives in the
   shared app-style store (@/lib/appStyle), so the Posts tab re-skins itself
   to match whenever this switcher cycles. Delete this component plus the
   store wiring to ship a single rail.

   rail        (default) Completely different form factor: an 88px activity
               column with the logo mark only, stacked icon-over-label tiles,
               micro group headings and a single logout tile. No wordmark, no
               text rows, no account panel - the row list is replaced by a
               grid of 56px targets.
   rail-dark   Same activity column inverted: ink surface, white labels, and
               the orange tile as the only chroma on the rail.
   ink         Inverted column: ink surface, brand labels, brand-tint active row.
   swiss      Quiet #f5f5f5 column, square rows, active row a solid orange block.
   editorial  White column ruled with black hairlines, no row fills at all -
              the active item is bold black type on a hard orange rule.
   dock       Flush flat column against the page edge, no card shell, black
              pill active.

   Contrast note: #FF6600 only reaches 2.7-2.9:1 against light surfaces, so on
   the light rails orange never carries text - only fills, rules and aria-hidden
   icons. Black-on-orange is 6.75:1, which is what the rail and swiss active
   states use. */
type ColumnVariant = 'ink' | 'swiss' | 'editorial' | 'dock';
type RailVariant = 'rail' | 'rail-dark';

interface Skin {
  label: string;
  /** Outer flex column: padding, border, background, overflow. */
  root: string;
  header: string;
  wordmark: string;
  wordmarkAccent: string;
  controls: string;
  iconBtn: string;
  rule: string;
  nav: string;
  section: string;
  sectionLabel: string;
  sectionDivider: string;
  rowRadius: string;
  rowMinHeight: string;
  rowMotion: string;
  rowIdle: string;
  rowActive: string;
  rowActiveIcon: string;
  /** Left indicator pill. null when the row shape itself carries the state. */
  bar: string | null;
  /** Bottom rule shown on hover and always on the active row. */
  underline: string | null;
  footer: string;
  accountBtn: string;
  logout: string;
}

const COLUMN_SKINS: Record<ColumnVariant, Skin> = {
  ink: {
    label: 'Ink',
    root: 'overflow-hidden border-r border-brand/20 bg-ink shadow-lg',
    header: 'border-b border-brand/20 bg-ink',
    wordmark: 'text-lg font-bold leading-tight tracking-tight text-gray-100',
    wordmarkAccent: 'text-brand',
    controls: 'bg-ink',
    iconBtn: 'text-gray-400 hover:bg-surface/5 hover:text-white',
    rule: 'bg-gradient-to-r from-transparent via-brand to-transparent',
    nav: 'bg-ink',
    section: 'px-3 pb-6 pt-6',
    sectionLabel: 'mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-brand',
    sectionDivider: 'mx-3 mb-2 border-t border-brand/20',
    rowRadius: 'rounded-lg',
    rowMinHeight: 'min-h-10',
    rowMotion: 'transition-colors duration-150',
    rowIdle: 'font-medium text-gray-300 hover:bg-surface/5 hover:text-white active:opacity-80',
    rowActive: 'bg-brand/10 font-semibold text-brand',
    rowActiveIcon: '',
    bar: 'left-1 h-5 w-0.5 rounded-full bg-brand',
    underline: null,
    footer: 'border-t border-brand/20 bg-ink',
    accountBtn: 'text-brand hover:text-white',
    logout: 'text-gray-300 hover:bg-destructive/10 hover:text-destructive',
  },
  swiss: {
    label: 'Swiss',
    root: 'overflow-hidden border-r border-border bg-muted',
    header: 'border-b border-border bg-muted',
    wordmark: 'text-lg font-bold leading-tight tracking-tight text-foreground',
    wordmarkAccent: 'text-foreground',
    controls: 'bg-muted',
    iconBtn: 'text-foreground/60 hover:bg-surface hover:text-foreground',
    rule: 'bg-brand',
    nav: 'bg-muted',
    section: 'px-3 pb-6 pt-6',
    sectionLabel: 'mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-foreground/60',
    sectionDivider: 'mx-3 mb-2 border-t border-border',
    rowRadius: 'rounded-none',
    rowMinHeight: 'min-h-11',
    rowMotion: 'transition-colors duration-200',
    rowIdle: 'font-medium text-foreground/70 hover:bg-surface hover:text-foreground active:opacity-80',
    rowActive: 'bg-brand font-semibold text-foreground',
    rowActiveIcon: 'text-foreground',
    bar: null,
    underline: null,
    footer: 'border-t border-border bg-muted',
    accountBtn: 'text-foreground/60 hover:bg-surface hover:text-foreground',
    logout: 'text-foreground/70 hover:bg-destructive/10 hover:text-foreground',
  },
  editorial: {
    label: 'Editorial',
    root: 'overflow-hidden border-r border-ink/15 bg-surface',
    header: 'border-b border-ink/15 bg-surface',
    wordmark: 'text-lg font-black uppercase leading-tight tracking-tight text-ink',
    wordmarkAccent: 'text-ink',
    controls: 'bg-surface',
    iconBtn: 'text-ink/60 hover:bg-ink/5 hover:text-ink',
    rule: 'bg-brand',
    nav: 'bg-surface',
    section: 'border-t border-ink px-3 pb-6 pt-4',
    sectionLabel: 'mb-3 px-3 text-xs font-black uppercase tracking-[0.16em] text-ink',
    sectionDivider: 'h-2',
    rowRadius: 'rounded-none',
    rowMinHeight: 'min-h-10',
    rowMotion: 'transition-colors duration-200',
    rowIdle: 'font-medium text-ink/70 hover:text-ink active:opacity-80',
    rowActive: 'font-black text-ink',
    rowActiveIcon: 'text-brand',
    bar: null,
    underline: 'bg-brand',
    footer: 'border-t border-ink/20 bg-surface',
    accountBtn: 'text-ink/60 hover:text-ink',
    logout: 'text-ink/70 hover:bg-destructive/10 hover:text-ink',
  },
  dock: {
    label: 'Dock',
    root: 'overflow-hidden border-r border-border bg-surface',
    header:
      'relative bg-surface after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-gradient-to-r after:from-transparent after:via-brand after:to-transparent',
    wordmark: 'text-lg font-bold leading-tight tracking-tight text-ink',
    wordmarkAccent: 'text-ink',
    controls: 'bg-surface',
    iconBtn: 'text-ink/60 hover:bg-ink/5 hover:text-ink',
    rule: 'bg-gradient-to-r from-transparent via-brand to-transparent',
    nav: 'bg-surface',
    section: 'px-3 pb-5 pt-5',
    sectionLabel: 'mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-ink/50',
    sectionDivider: 'mx-3 mb-2 border-t border-border',
    rowRadius: 'rounded-xl',
    rowMinHeight: 'min-h-10',
    rowMotion: 'transition-colors duration-150',
    rowIdle: 'font-medium text-ink/70 hover:bg-ink/5 hover:text-ink active:opacity-80',
    rowActive: 'bg-ink font-semibold text-surface',
    rowActiveIcon: 'text-brand',
    bar: 'left-1.5 h-5 w-1 rounded-full bg-brand',
    underline: null,
    footer:
      'relative bg-surface before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-gradient-to-r before:from-transparent before:via-brand before:to-transparent',
    accountBtn: 'text-ink/60 hover:bg-ink/5 hover:text-ink',
    logout: 'text-ink/70 hover:bg-destructive/10 hover:text-ink',
  },
};

/* The activity column in two skins. Orange never carries text here either:
   #FF6600 on the light rail is 2.7:1, so the tile is always a fill with a
   near-black glyph (6.75:1) and the resting labels are neutral greys. */
interface RailSkin {
  label: string;
  root: string;
  markWrap: string;
  controlsIcon: string;
  rule: string;
  groupLabel: string;
  tileIdle: string;
  tileActive: string;
  footerWrap: string;
  logout: string;
}

const RAIL_SKINS: Record<RailVariant, RailSkin> = {
  rail: {
    label: 'Rail',
    root: 'w-[88px] bg-surface shadow-xl',
    markWrap: 'border-b border-ink/10 px-4 py-4',
    controlsIcon: 'text-ink/60 hover:bg-ink/5 hover:text-ink',
    rule: 'bg-brand',
    groupLabel: 'text-ink/60',
    tileIdle: 'font-medium text-ink/60 hover:bg-ink/5 hover:text-ink active:opacity-80',
    tileActive: 'bg-brand font-semibold text-foreground',
    footerWrap: 'border-t border-ink/10 px-2 py-3',
    logout: 'text-ink/60 hover:bg-destructive/10 hover:text-ink active:opacity-80',
  },
  'rail-dark': {
    label: 'Noir',
    root: 'w-[88px] bg-ink shadow-xl',
    markWrap: 'border-b border-white/10 px-4 py-4',
    controlsIcon: 'text-white/60 hover:bg-white/5 hover:text-white',
    rule: 'bg-brand',
    groupLabel: 'text-white/60',
    tileIdle: 'font-medium text-white/60 hover:bg-white/5 hover:text-white active:opacity-80',
    tileActive: 'bg-brand font-semibold text-foreground',
    footerWrap: 'border-t border-white/10 px-2 py-3',
    logout: 'text-white/60 hover:bg-destructive/20 hover:text-white active:opacity-80',
  },
};

/* ---------------------------------------------------------------- Rail ----
   Mark-only activity column. Every target is a 56px tile with the icon over
   a 12px label, so nothing depends on hover and nothing needs to escape the
   scroll container (which would clip an external flyout). */
function RailTile({
  label,
  icon: Icon,
  isActive,
  skin,
  onSelect,
}: {
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  skin: RailSkin;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isActive ? 'page' : undefined}
      aria-label={label}
      title={label}
      className={`flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 transition-colors duration-150 ${
        isActive ? skin.tileActive : skin.tileIdle
      }`}
    >
      <Icon aria-hidden="true" className="icon-lg shrink-0" />
      <span className="w-full truncate text-center text-xs leading-tight">{label}</span>
    </button>
  );
}

function RailSidebar({
  sections,
  activeTab,
  onTabChange,
  onLogout,
  railSkin,
}: Omit<SidebarProps, 'userRole'> & {
  sections: NavSection[];
  railSkin: RailSkin;
}) {
  return (
    <div className={`flex h-full max-h-screen flex-col overflow-hidden ${railSkin.root}`}>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Mark only - the rail carries no wordmark. */}
        <div className={`flex-shrink-0 px-4 py-4 ${railSkin.markWrap}`}>
          <img
            src="/images/indianinfra.png"
            alt=""
            aria-hidden="true"
            className="mx-auto size-9 object-contain transition-transform duration-500 hover:rotate-[10deg]"
          />
        </div>

        <div className="relative flex flex-shrink-0 items-center justify-center gap-0.5 px-2 py-2">
          <button
            type="button"
            onClick={() => onTabChange('notifications')}
            aria-label="Notifications"
            title="Notifications"
            className={`cursor-pointer rounded-lg p-2 transition-colors duration-150 ${railSkin.controlsIcon}`}
          >
            <NotificationBell simpleMode />
          </button>
          <div aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-0.5 ${railSkin.rule}`} />
        </div>

        <nav aria-label="Main" className="hover-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3">
          {sections.map((section) => (
            <div key={section.key} className="pb-3">
              <div
                className={`mb-1.5 truncate text-center text-xs font-semibold uppercase tracking-wider ${railSkin.groupLabel}`}
              >
                {section.short}
              </div>
              <div className="space-y-1">
                {section.tabs.map((tab) => (
                  <RailTile
                    key={tab.id}
                    label={tab.short ?? tab.label}
                    icon={tab.icon}
                    isActive={activeTab === tab.id}
                    skin={railSkin}
                    onSelect={() => onTabChange(tab.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className={`flex-shrink-0 px-2 py-3 ${railSkin.footerWrap}`}>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Logout"
            title="Logout"
            className={`flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 font-medium transition-colors duration-150 ${railSkin.logout}`}
          >
            <LogOut aria-hidden="true" className="icon-lg shrink-0" />
            <span className="w-full truncate text-center text-xs leading-tight">Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Column ----
   Section headings sit on the 12/14/16/18/24 type scale as 12px bold uppercase.
   Collapsed, the label is swapped for a rule so groups stay separated without
   spending horizontal room. */
function SectionLabel({
  collapsed,
  skin,
  children,
}: {
  collapsed: boolean;
  skin: Skin;
  children: string;
}) {
  if (collapsed) {
    return <div aria-hidden="true" className={skin.sectionDivider} />;
  }

  return <h2 className={skin.sectionLabel}>{children}</h2>;
}

/* One row shape for every nav group. Row height comes from the skin token so
   the target stays 40-44px even though the type is only 14px, and the icon
   always uses --icon-md rather than an arbitrary size. */
function NavItem({
  tab,
  isActive,
  collapsed,
  skin,
  onSelect,
}: {
  tab: NavTab;
  isActive: boolean;
  collapsed: boolean;
  skin: Skin;
  onSelect: (id: TabId) => void;
}) {
  const Icon = tab.icon;
  const padding = collapsed ? 'justify-center px-2 py-2' : 'px-3 py-2';
  const underlineInset = collapsed ? 'left-2 right-2' : 'left-3 right-3';

  return (
    <button
      type="button"
      onClick={() => onSelect(tab.id)}
      aria-current={isActive ? 'page' : undefined}
      aria-label={collapsed ? tab.label : undefined}
      title={collapsed ? tab.label : undefined}
      className={[
        'group relative mb-1 flex w-full cursor-pointer items-center text-sm',
        skin.rowRadius,
        skin.rowMinHeight,
        skin.rowMotion,
        padding,
        isActive ? skin.rowActive : skin.rowIdle,
      ].join(' ')}
    >
      {skin.bar && isActive && (
        <span aria-hidden="true" className={`absolute top-1/2 -translate-y-1/2 ${skin.bar}`} />
      )}
      {skin.underline && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-1.5 h-0.5 ${underlineInset} ${skin.underline} ${
            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        />
      )}
      {/* Icons sit beside visible labels, so they are decoration here. */}
      <Icon
        aria-hidden="true"
        className={`icon-md shrink-0 ${collapsed ? '' : 'mr-3'} ${isActive ? skin.rowActiveIcon : ''}`}
      />
      {!collapsed && <span className="truncate">{tab.label}</span>}
    </button>
  );
}

function ColumnSidebar({
  sections,
  activeTab,
  onTabChange,
  onLogout,
  skin,
}: Omit<SidebarProps, 'userRole'> & {
  sections: NavSection[];
  skin: Skin;
}) {
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const accountTabs: NavTab[] = [
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div
      className={`${isCollapsed ? 'w-20' : 'w-64'} flex h-full max-h-screen flex-col transition-[width] duration-200 ease-in-out ${skin.root}`}
    >
      {/* Flat column - the dock no longer detaches into a floating card. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Header with Logo and Branding */}
        <div className={`flex-shrink-0 px-6 py-4 ${skin.header}`}>
          <div className="group flex min-w-0 items-center gap-3">
            <img
              src="/images/indianinfra.png"
              alt=""
              aria-hidden="true"
              className="size-10 shrink-0 object-contain transition-transform duration-500 group-hover:rotate-[10deg]"
            />
            {!isCollapsed && (
              <div className={`min-w-0 flex-1 truncate ${skin.wordmark}`}>
                IndianInfra <span className={skin.wordmarkAccent}>Jobs</span>
              </div>
            )}
          </div>
        </div>

        {/* Controls - brand rule sits on the bottom edge */}
        <div className={`relative flex-shrink-0 px-4 py-2 ${skin.controls}`}>
          <div className="flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!isCollapsed}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={`group flex cursor-pointer items-center justify-center rounded-lg p-2 transition-colors duration-150 ${skin.iconBtn}`}
            >
              {isCollapsed ? (
                <ChevronsRight
                  aria-hidden="true"
                  className="icon-lg transition-transform duration-200 group-hover:translate-x-0.5"
                />
              ) : (
                <ChevronsLeft
                  aria-hidden="true"
                  className="icon-lg transition-transform duration-200 group-hover:-translate-x-0.5"
                />
              )}
            </button>

            <div className="flex items-center">
              {/* Notifications - shown in both states; the bell inherits its
                  colour, so the button carries the visible one. */}
              <button
                type="button"
                onClick={() => onTabChange('notifications')}
                aria-label="Notifications"
                title="Notifications"
                className={`relative cursor-pointer rounded-lg p-2 transition-colors duration-150 ${skin.iconBtn}`}
              >
                <NotificationBell simpleMode />
              </button>
            </div>
          </div>
          <div aria-hidden="true" className={`absolute inset-x-0 bottom-0 h-0.5 ${skin.rule}`} />
        </div>

        <nav aria-label="Main" className={`hover-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-4 ${skin.nav}`}>
          {sections.map((section) => (
            <div key={section.key} className={skin.section}>
              <SectionLabel collapsed={isCollapsed} skin={skin}>
                {section.label}
              </SectionLabel>
              {section.tabs.map((tab) => (
                <NavItem
                  key={tab.id}
                  tab={tab}
                  isActive={activeTab === tab.id}
                  collapsed={isCollapsed}
                  skin={skin}
                  onSelect={(id) => onTabChange(id)}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* Account Section - Fixed at Bottom */}
        <div className={`flex-shrink-0 px-3 py-4 ${skin.footer}`}>
          <button
            type="button"
            onClick={() => setIsAccountOpen(!isAccountOpen)}
            aria-expanded={isAccountOpen}
            aria-label={isCollapsed ? 'Account' : undefined}
            title={isCollapsed ? 'Account' : undefined}
            className={`mb-2 flex w-full cursor-pointer items-center rounded-lg px-3 transition-colors duration-150 ${
              skin.accountBtn
            } ${isCollapsed ? 'justify-center py-2' : 'justify-between py-1.5'}`}
          >
            {!isCollapsed && (
              <span className="text-xs font-semibold uppercase tracking-wider">Account</span>
            )}
            {!isAccountOpen ? (
              <ChevronUp aria-hidden="true" className="icon-sm shrink-0" />
            ) : (
              <ChevronDown aria-hidden="true" className="icon-sm shrink-0" />
            )}
          </button>

          <div className="space-y-1">
            <button
              type="button"
              onClick={onLogout}
              aria-label={isCollapsed ? 'Logout' : undefined}
              title={isCollapsed ? 'Logout' : undefined}
              className={`flex min-h-10 w-full cursor-pointer items-center rounded-lg py-2 text-sm font-medium transition-colors duration-150 ${skin.logout} ${
                isCollapsed ? 'justify-center px-2' : 'px-3'
              }`}
            >
              <LogOut aria-hidden="true" className={`icon-md shrink-0 ${isCollapsed ? '' : 'mr-3'}`} />
              {!isCollapsed && <span>Logout</span>}
            </button>

            {/* visibility:hidden (not just opacity) keeps the closed panel out of
                the tab order, so keyboard focus can't land on hidden links. */}
            <div
              className={`overflow-hidden transition-all duration-300 ${
                isAccountOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 invisible'
              }`}
            >
              {accountTabs.map((tab) => (
                <NavItem
                  key={tab.id}
                  tab={tab}
                  isActive={activeTab === tab.id}
                  collapsed={isCollapsed}
                  skin={skin}
                  onSelect={(id) => onTabChange(id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar(props: SidebarProps) {
  const { activeTab, onTabChange, onLogout, userRole } = props;
  // Shared with the Posts tab - both surfaces always agree on the active style.
  const variant = useAppStyle();

  const jobPostsTabs: NavTab[] = [
    { id: 'job-posts', label: 'Posts', short: 'Posts', icon: Briefcase },
    { id: 'analytics', label: 'Analytics', short: 'Analytics', icon: BarChart3 },
  ];

  const screeningTabs: NavTab[] = [
    { id: 'upload-resumes', label: 'Upload Resumes', short: 'Upload', icon: Upload },
    { id: 'pipeline', label: 'Pipeline (Kanban)', short: 'Pipeline', icon: SquareKanban },
    { id: 'candidates', label: 'Candidates', short: 'Candidates', icon: Users },
    { id: 'shortlisted', label: 'ShortListed', short: 'Shortlist', icon: CheckCircle },
    { id: 'interviews', label: 'Interviews', short: 'Interviews', icon: MessageSquare },
    { id: 'selected', label: 'Selected Candidates', short: 'Selected', icon: Award },
  ];

  const recruiterTabs: NavTab[] = [
    { id: 'add-members', label: 'Add Recruiters', short: 'Recruiters', icon: UserPlus, adminOnly: true },
  ];

  const sections: NavSection[] = [
    { key: 'job-posts', label: 'Job Posts', short: 'Jobs', tabs: jobPostsTabs },
    { key: 'screenings', label: 'Screenings', short: 'Screening', tabs: screeningTabs },
    {
      key: 'recruiter',
      label: 'Recruiter',
      short: 'Team',
      tabs: recruiterTabs.filter((tab) => !tab.adminOnly || userRole === 'admin'),
    },
  ].filter((section) => section.tabs.length > 0);

  if (variant === 'rail' || variant === 'rail-dark') {
    return (
      <RailSidebar
        sections={sections}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onLogout={onLogout}
        railSkin={RAIL_SKINS[variant]}
      />
    );
  }

  return (
    <ColumnSidebar
      sections={sections}
      activeTab={activeTab}
      onTabChange={onTabChange}
      onLogout={onLogout}
      skin={COLUMN_SKINS[variant]}
    />
  );
}
