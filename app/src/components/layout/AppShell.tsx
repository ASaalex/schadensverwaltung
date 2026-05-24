import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import {
  LogOut,
  Construction,
  Camera,
  LayoutDashboard,
  AlertTriangle,
  ClipboardList,
  HardHat,
  Settings,
  List,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/types/database';
import { SyncIndicator } from './SyncIndicator';

export interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Route-Präfix zum Match (Default: exakte to-Übereinstimmung mit startsWith) */
  match?: string;
}

interface Props {
  title: string;
  subtitle?: string;
  /** Optionaler Akzent (für Header-Logo-Färbung) */
  accent?: 'blue' | 'orange' | 'slate';
  /** Sub-Navigation der aktuellen Sektion (links/Sidebar auf Desktop, oben als Pills auf Mobile) */
  sidebar?: NavItem[];
  children: ReactNode;
}

const ACCENT: Record<NonNullable<Props['accent']>, string> = {
  blue: 'bg-blue-600',
  orange: 'bg-orange-500',
  slate: 'bg-slate-900',
};

// =============================================================================
//  ROLE-SWITCHER (Desktop-Top + Mobile-Bottom)
// =============================================================================

interface RoleTab {
  to: string;
  icon: LucideIcon;
  label: string;
  emoji: string;
  /** Routen-Präfix für Active-Detection */
  prefix: string;
}

const TAB_DASHBOARD: RoleTab = { to: '/dispo/dashboard', icon: LayoutDashboard, label: 'Dashboard', emoji: '🖥️', prefix: '/dispo/dashboard' };
const TAB_DAMAGES: RoleTab   = { to: '/dispo/damages',   icon: AlertTriangle,   label: 'Schäden',   emoji: '⚠️', prefix: '/dispo/damages' };
const TAB_ORDERS: RoleTab    = { to: '/dispo/orders',    icon: ClipboardList,   label: 'Aufträge',  emoji: '📋', prefix: '/dispo/orders' };
const TAB_ERFASSER: RoleTab  = { to: '/erfasser',        icon: Camera,          label: 'Erfassen',  emoji: '📱', prefix: '/erfasser' };
const TAB_FIRMA: RoleTab     = { to: '/firma/orders',    icon: HardHat,         label: 'Aufträge',  emoji: '🏗️', prefix: '/firma' };
const TAB_ADMIN: RoleTab     = { to: '/admin/users',     icon: Settings,        label: 'Admin',     emoji: '⚙️', prefix: '/admin' };
const TAB_ERFASSER_HOME: RoleTab = { to: '/erfasser',     icon: Camera,          label: 'Start',     emoji: '📱', prefix: '/erfasser' };
const TAB_ERFASSER_LIST: RoleTab = { to: '/erfasser/list', icon: List,           label: 'Liste',     emoji: '📋', prefix: '/erfasser/list' };

function navForRole(role: UserRole | undefined): RoleTab[] {
  switch (role) {
    case 'admin':
      return [TAB_DASHBOARD, TAB_DAMAGES, TAB_ORDERS, TAB_ERFASSER, TAB_FIRMA, TAB_ADMIN];
    case 'dispatcher':
      return [TAB_DASHBOARD, TAB_DAMAGES, TAB_ORDERS, TAB_ERFASSER];
    case 'field_worker':
      return [TAB_ERFASSER_HOME, TAB_ERFASSER_LIST];
    case 'company_user':
      return [TAB_FIRMA];
    default:
      return [];
  }
}

function isActive(pathname: string, prefix: string): boolean {
  if (prefix === pathname) return true;
  return pathname.startsWith(prefix + '/');
}

// =============================================================================
//  DESKTOP-ROLLEN-SWITCHER (Top-Tabs)
// =============================================================================

function DesktopRoleSwitcher() {
  const { profile } = useAuth();
  const location = useLocation();
  if (!profile) return null;
  const tabs = navForRole(profile.role);
  if (tabs.length <= 1) return null;
  return (
    <nav className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
      {tabs.map((t) => {
        const active = isActive(location.pathname, t.prefix);
        return (
          <Link
            key={t.to}
            to={t.to}
            className={`rounded-md px-3 py-1.5 transition ${
              active
                ? 'bg-white font-semibold text-blue-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="mr-1">{t.emoji}</span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

// =============================================================================
//  MOBILE BOTTOM-NAV
// =============================================================================

function MobileBottomNav() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  const tabs = navForRole(profile.role);

  return (
    <nav
      className="bottom-nav md:hidden"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: '#0f172a',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        paddingTop: 6,
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-x',
        overscrollBehaviorX: 'contain',
        scrollbarWidth: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          minWidth: 'max-content',
          padding: '0 6px',
        }}
      >
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.prefix === '/erfasser'}
            style={({ isActive: act }) => ({
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '8px 12px',
              borderRadius: 10,
              textDecoration: 'none',
              minWidth: 64,
              color: act ? 'white' : 'rgba(255,255,255,0.55)',
              background: act ? 'rgba(37,99,235,0.35)' : 'transparent',
              flexShrink: 0,
            })}
          >
            <t.icon size={22} />
            <span style={{ fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap' }}>{t.label}</span>
          </NavLink>
        ))}
        <button
          onClick={signOut}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            padding: '8px 12px',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.55)',
            minWidth: 64,
            flexShrink: 0,
          }}
        >
          <LogOut size={22} />
          <span style={{ fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap' }}>Logout</span>
        </button>
      </div>
    </nav>
  );
}

// =============================================================================
//  MOBILE SUB-NAV (Sidebar als horizontale Pills)
// =============================================================================

function MobileSubNav({ items }: { items: NavItem[] }) {
  const location = useLocation();
  return (
    <nav
      className="sub-nav md:hidden"
      style={{
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-x',
        scrollbarWidth: 'none',
      }}
    >
      <div style={{ display: 'flex', gap: 6, padding: '8px 12px', minWidth: 'max-content' }}>
        {items.map((item) => {
          const matchPath = item.match ?? item.to;
          const active =
            location.pathname === item.to || location.pathname.startsWith(matchPath + '/');
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                active ? 'bg-blue-50 font-medium text-blue-700' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// =============================================================================
//  HAUPT-APPSHELL
// =============================================================================

export function AppShell({ title, subtitle, accent = 'blue', sidebar, children }: Props) {
  const { profile, signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ===== TOP-HEADER ===== */}
      <header className="sticky top-0 z-40 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2.5 md:gap-4 md:px-6 md:py-3">
          <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg md:h-9 md:w-9 ${ACCENT[accent]}`}>
              <Construction className="h-4 w-4 text-white md:h-5 md:w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold">{title}</h1>
              <div className="truncate text-xs text-muted-foreground">{subtitle ?? 'Bauhof Erfurt'}</div>
            </div>
          </div>

          {/* Desktop Role-Switcher */}
          <div className="hidden md:block">
            <DesktopRoleSwitcher />
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <SyncIndicator variant="desktop" />
            {/* Desktop User-Bereich + Logout */}
            <div className="hidden items-center gap-2 md:flex">
              <div className="text-right">
                <div className="text-sm font-medium">{profile?.full_name ?? '—'}</div>
                <div className="text-xs text-muted-foreground">{profile?.role}</div>
              </div>
              <button
                onClick={signOut}
                className="flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs hover:bg-slate-50"
              >
                <LogOut className="h-3.5 w-3.5" /> Abmelden
              </button>
            </div>
            {/* Mobile: nur Avatar als Profil-Link */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white md:hidden">
              {initials(profile?.full_name)}
            </div>
          </div>
        </div>
      </header>

      {/* ===== MOBILE SUB-NAV (Sidebar als Pills) ===== */}
      {sidebar && sidebar.length > 0 && <MobileSubNav items={sidebar} />}

      <div className="mx-auto flex max-w-7xl">
        {/* ===== DESKTOP SIDEBAR ===== */}
        {sidebar && sidebar.length > 0 && (
          <aside className="hidden w-56 flex-shrink-0 border-r bg-white py-4 md:block">
            <nav className="space-y-0.5 px-2">
              {sidebar.map((item) => {
                const matchPath = item.match ?? item.to;
                const active =
                  location.pathname === item.to || location.pathname.startsWith(matchPath + '/');
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
                      active
                        ? 'bg-blue-50 font-medium text-blue-700'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        )}

        {/* ===== CONTENT ===== */}
        {/* min-w-0 ist wichtig — sonst sprengen child-Tabellen den Flex-Container */}
        <main className="main-content min-w-0 flex-1 px-3 py-4 md:px-6 md:py-6">{children}</main>
      </div>

      {/* ===== MOBILE BOTTOM-NAV ===== */}
      <MobileBottomNav />

      {/* Globale Mobile-Styles für die Nav-Scrollbars + Bottom-Padding */}
      <style>{`
        .bottom-nav::-webkit-scrollbar,
        .sub-nav::-webkit-scrollbar { display: none; }
        @media (max-width: 768px) {
          /* Platz nach unten für Bottom-Nav (Höhe ~62-72px + safe-area) */
          .main-content { padding-bottom: calc(80px + env(safe-area-inset-bottom)) !important; }
        }
      `}</style>
    </div>
  );
}

function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
