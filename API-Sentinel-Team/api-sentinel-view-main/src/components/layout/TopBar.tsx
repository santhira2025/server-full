import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight, Bell, Search, ChevronDown, RefreshCw, LogOut, Clock, Zap, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { useApiCollections } from '@/hooks/use-discovery';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

const PAGE_LABELS: Record<string, string> = {
  organization: 'Organization',
  dashboard: 'Dashboard',
  discovery: 'Discovery',
  testing: 'Testing',
  protection: 'Protection',
  reports: 'Reports',
  intelligence: 'Intel',
  settings: 'Settings',
  'system-health': 'System Health',
  operations: 'Operations',
  'add-application': 'Add Application',
  live: 'Live Feed',
  alerts: 'Alerts',
  blocklist: 'Blocklist',
};

type SearchShortcut = {
  label: string;
  path: string;
  hint: string;
  keywords?: string[];
  adminOnly?: boolean;
};

const SEARCH_SHORTCUTS: SearchShortcut[] = [
  { label: 'Dashboard', path: '/dashboard', hint: 'Overview & KPIs', keywords: ['home', 'overview', 'kpi'] },
  { label: 'Live Feed', path: '/live', hint: 'Real-time traffic', keywords: ['realtime', 'stream', 'events'] },
  { label: 'Alerts', path: '/alerts', hint: 'Active detections', keywords: ['incidents', 'detections'] },
  { label: 'Discovery', path: '/discovery', hint: 'Inventory & catalog', keywords: ['inventory', 'catalog'] },
  { label: 'Testing', path: '/testing', hint: 'Tests & results', keywords: ['vulnerabilities', 'tests'] },
  { label: 'Protection', path: '/protection', hint: 'Policies & enforcement', keywords: ['policy', 'enforce'] },
  { label: 'Blocklist', path: '/blocklist', hint: 'IP and actor bans', keywords: ['deny', 'block'] },
  { label: 'Reports', path: '/reports', hint: 'Exports & summaries', keywords: ['export', 'summary'] },
  { label: 'Intel', path: '/intelligence', hint: 'Threat insights', keywords: ['threats', 'intel'] },
  { label: 'System Health', path: '/system-health', hint: 'Sensors & controllers', keywords: ['health', 'status'], adminOnly: true },
  { label: 'Operations', path: '/operations', hint: 'Admin operations', keywords: ['ops', 'admin'], adminOnly: true },
  { label: 'Add Application', path: '/add-application', hint: 'Register a new app', keywords: ['app', 'register'], adminOnly: true },
  { label: 'Settings', path: '/settings', hint: 'Users & org', keywords: ['account', 'org'] },
];

function getInitials(user: { login: string; name?: string } | null): string {
  if (!user) return '??';
  const name = user.name || user.login;
  const parts = name.split(/[@.\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function useCurrentTime() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);
  return time;
}

export const TopBar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isFetching = useIsFetching();
  const { user, isAdmin, logout } = useAuth();
  const { data: collectionsData } = useApiCollections();
  const collections = collectionsData?.apiCollections ?? [];
  const currentTime = useCurrentTime();

  const pathParts = location.pathname.split('/').filter(Boolean);
  const currentPage = PAGE_LABELS[pathParts[0]] || 'Dashboard';
  const subPage = pathParts[1]
    ? pathParts[1].charAt(0).toUpperCase() + pathParts[1].slice(1).replace(/-/g, ' ')
    : null;

  const appNames = collections.map(c => c.displayName || c.hostName).filter(Boolean);
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const activeApp = selectedApp || appNames[0] || 'Default Inventory';
  const [appOpen, setAppOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasNotif] = useState(true);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  const initials = getInitials(user);
  const displayName = user?.name || user?.login?.split('@')[0] || 'User';
  const roleLabel = isAdmin ? 'Admin' : 'Member';

  // Keyboard shortcut for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setAppOpen(false);
        setUserMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (searchOpen) setSearchQuery('');
  }, [searchOpen]);

  useEffect(() => {
    if (isFetching === 0) {
      setLastSync(new Date());
    }
  }, [isFetching]);

  const filteredShortcuts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base = SEARCH_SHORTCUTS.filter(item => !item.adminOnly || isAdmin);
    if (!q) return base;
    return base.filter(item => {
      const haystack = [item.label, item.hint, ...(item.keywords ?? [])].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [searchQuery, isAdmin]);

  const handleRefresh = () => {
    queryClient.invalidateQueries();
    toast({
      title: 'Refreshing data',
      description: 'Fetching the latest telemetry and inventory.',
    });
  };

  return (
    <>
      <div
        className="flex items-center justify-between px-5 py-2 border-b shrink-0 border-border-subtle glass"
        style={{ minHeight: 48 }}
      >
        {/* Left: Breadcrumb */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setAppOpen(v => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors outline-none"
            >
              <div className="w-5 h-5 rounded-md bg-brand/10 border border-brand/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-sm bg-brand" />
              </div>
              <span className="max-w-[160px] truncate">{activeApp}</span>
              <ChevronDown size={11} className={`transition-transform duration-200 text-muted-foreground ${appOpen ? 'rotate-180' : ''}`} />
            </button>
            {appOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setAppOpen(false)} />
                <div className="absolute left-0 top-full mt-1.5 w-56 rounded-xl border border-border-subtle shadow-2xl z-50 py-1 max-h-64 overflow-y-auto glass-card-premium animate-scale-in">
                  {appNames.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No applications found</div>
                  )}
                  {appNames.map(app => (
                    <button key={app} onClick={() => { setSelectedApp(app); setAppOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-black/[0.04] ${app === activeApp ? 'text-brand font-semibold' : 'text-text-secondary'}`}>
                      {app}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <ChevronRight size={12} className="text-text-muted" />
          <span className="text-xs font-medium text-text-secondary">{currentPage}</span>
          {subPage && (
            <>
              <ChevronRight size={12} className="text-text-muted" />
              <span className="text-xs font-semibold text-text-primary">
                {pathParts[1] === 'api-catalogue' ? 'API Catalogue' :
                  pathParts[1] === 'api-governance' ? 'API Governance' : subPage}
              </span>
            </>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Environment pill */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[10px] text-emerald-600 font-semibold">
            <Zap size={10} />
            Production
          </div>

          {/* Live sync status */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border-subtle bg-bg-elevated text-[10px] font-semibold text-text-secondary">
            <span className={`w-2 h-2 rounded-full ${isFetching > 0 ? 'bg-brand animate-pulse' : 'bg-green-500'}`} />
            {isFetching > 0 ? 'Syncing' : 'Live'}
            {lastSync && (
              <span className="text-text-muted ml-1">
                {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {/* Clock */}
          <div className="hidden md:flex items-center gap-1 text-[11px] text-text-muted tabular-nums">
            <Clock size={11} />
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>

          <div className="w-px h-4 bg-border-subtle mx-0.5" />

          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 h-7 px-2.5 rounded-lg border border-border-subtle bg-bg-elevated/50 text-muted-foreground hover:text-text-primary hover:border-brand/20 transition-all outline-none"
          >
            <Search size={13} />
            <span className="hidden md:inline text-[11px]">Search</span>
            <kbd className="hidden md:inline text-[9px] px-1 py-0.5 rounded bg-bg-base border border-border-subtle text-text-muted font-mono">
              {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}K
            </kbd>
          </button>

          <button
            onClick={handleRefresh}
            className="w-7 h-7 rounded-lg border border-border-subtle bg-bg-elevated/50 flex items-center justify-center text-muted-foreground hover:text-brand hover:border-brand/20 transition-all outline-none"
          >
            <RefreshCw size={13} />
          </button>

          {/* Notifications */}
          <button className="relative w-7 h-7 rounded-lg border border-border-subtle bg-bg-elevated/50 flex items-center justify-center text-muted-foreground hover:text-text-primary hover:border-brand/20 transition-all outline-none">
            <Bell size={13} />
            {hasNotif && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-brand text-[8px] text-white font-bold flex items-center justify-center ring-2 ring-bg-base">
                3
              </span>
            )}
          </button>

          <div className="w-px h-4 bg-border-subtle mx-0.5" />

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-lg hover:bg-black/[0.03] transition-colors outline-none"
            >
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-sm bg-gradient-to-br from-brand to-brand-dark ring-2 ring-brand/20">
                {initials}
              </div>
              <div className="hidden md:block text-left">
                <div className="text-[11px] font-medium text-text-secondary leading-none">{displayName}</div>
                <div className="text-[9px] text-text-muted mt-0.5">{roleLabel}</div>
              </div>
            </button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-border-subtle shadow-2xl z-50 py-1 glass-card-premium animate-scale-in">
                  <div className="px-3 py-3 border-b border-border-subtle">
                    <div className="text-xs font-semibold text-text-primary">{displayName}</div>
                    <div className="text-[10px] text-text-muted mt-0.5">{user?.login}</div>
                    <div className="mt-1.5 inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-brand border border-brand/20 bg-brand/10">
                      {roleLabel}
                    </div>
                  </div>
                  <button
                    onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                    className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-black/[0.04] transition-colors flex items-center gap-2"
                  >
                    <Settings size={12} />
                    Settings
                  </button>
                  <button
                    onClick={() => { setUserMenuOpen(false); logout(); }}
                    className="w-full text-left px-3 py-2 text-xs text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2"
                  >
                    <LogOut size={12} />
                    Sign Out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Command Palette / Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
          <div className="relative w-full max-w-lg glass-card-premium rounded-xl shadow-2xl border border-border-subtle animate-scale-in overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
              <Search size={16} className="text-text-muted shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Search endpoints, tests, events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
              />
              <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-bg-base border border-border-subtle text-text-muted font-mono">
                ESC
              </kbd>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filteredShortcuts.map(item => (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); setSearchOpen(false); }}
                  className="w-full text-left px-4 py-3 text-xs text-text-secondary hover:text-text-primary hover:bg-black/[0.04] transition-colors flex items-center justify-between"
                >
                  <div className="flex flex-col">
                    <span className="text-[12px] font-semibold">{item.label}</span>
                    <span className="text-[10px] text-text-muted">{item.hint}</span>
                  </div>
                  <ChevronRight size={12} className="text-text-muted" />
                </button>
              ))}
              {filteredShortcuts.length === 0 && (
                <div className="p-4 text-center text-xs text-text-muted">
                  No matches. Try "alerts", "live", or "discovery".
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
