'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Cloud, MessageSquare, Settings, LogOut, Globe,
  Shield, Users, Activity, ChevronDown, ChevronRight,
  FolderOpen, Database, Brain, StickyNote, Clock,
  PanelLeftClose, PanelLeftOpen, Menu, X, CreditCard, ScrollText,
} from 'lucide-react';
import { MiningIcon } from './mining-icon';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslation } from '@/hooks/use-translation';
import { useAuthStore, useSidebarStore, useAiProcessingStore } from '@/lib/store';
import { chatApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import { MartaniLogo } from './martani-logo';
import { useI18nStore, type Locale } from '@/lib/i18n';

/* ─── Collapsed tooltip wrapper ─── */
function NavTooltip({ label, show }: { label: string; show: boolean }) {
  if (!show) return null;
  return (
    <span className="absolute left-full ml-2 px-2.5 py-1 bg-gray-800 text-gray-200 text-xs rounded-md shadow-lg border border-gray-700
      opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
      {label}
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { isCollapsed, isMobileOpen, toggleSidebar, setSidebarCollapsed, setMobileOpen } = useSidebarStore();
  const isMobile = useIsMobile();
  const { t } = useTranslation('common');
  const locale = useI18nStore((s) => s.locale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const isAdmin = user?.role === 'admin';
  const effectiveCollapsed = isMobile ? false : isCollapsed;

  const aiProcessing = useAiProcessingStore((s) => s.isProcessing);
  const setProcessing = useAiProcessingStore((s) => s.setProcessing);

  // Restore AI processing state on mount (survives page navigation / browser refresh)
  useEffect(() => {
    if (!user) return;
    chatApi.getProcessingStatus().then((active) => {
      if (active.length > 0) {
        setProcessing(active[0].session_id, active[0].message_id);
      }
    }).catch(() => {});
  }, [user, setProcessing]);

  const adminItems = [
    { href: '/admin', label: t('admin.dashboard'), icon: Activity },
    { href: '/admin/users', label: t('admin.users'), icon: Users },
    { href: '/admin/logs', label: t('admin.logs'), icon: ScrollText },
    { href: '/admin', label: t('admin.settings'), icon: Settings },
  ];

  // Tree expansion states
  const [cloudExpanded, setCloudExpanded] = useState(true);
  const [aiExpanded, setAiExpanded] = useState(true);

  // User popup menu
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Hydrate collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved === 'true') setSidebarCollapsed(true);
  }, [setSidebarCollapsed]);

  // Close mobile sidebar on navigation
  useEffect(() => {
    if (isMobile) setMobileOpen(false);
  }, [pathname, isMobile, setMobileOpen]);

  // Auto-expand trees based on current path
  useEffect(() => {
    if (pathname.startsWith('/files') || pathname.startsWith('/indexing') || pathname.startsWith('/vault')) {
      setCloudExpanded(true);
    }
    if (pathname.startsWith('/chat') || pathname.startsWith('/ai/') || pathname.startsWith('/ai/schedule')) {
      setAiExpanded(true);
    }
  }, [pathname]);

  // Close user menu on outside click
  useEffect(() => {
    if (!showUserMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showUserMenu]);

  const isFilesActive = pathname === '/files' || pathname.startsWith('/files/');
  const isIndexingActive = pathname === '/indexing' || pathname.startsWith('/indexing/');
  const isVaultActive = pathname === '/vault' || pathname.startsWith('/vault/');
  const isCloudActive = isFilesActive || isIndexingActive || isVaultActive;
  const isChatActive = pathname === '/chat' || pathname.startsWith('/chat/');
  const isDataActive = pathname.startsWith('/ai/data');
  const isScheduleActive = pathname === '/ai/schedule' || pathname.startsWith('/ai/schedule/');
  const isAiActive = isChatActive || isDataActive || isScheduleActive;
  const isAdminActive = pathname === '/admin' || pathname.startsWith('/admin/');

  return (
    <>
    {/* Mobile hamburger button */}
    {isMobile && !isMobileOpen && (
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-3 left-3 z-50 p-2 bg-gray-800 rounded-lg text-gray-300 hover:text-white shadow-lg border border-gray-700"
      >
        <Menu className="w-5 h-5" />
      </button>
    )}

    {/* Mobile backdrop */}
    {isMobile && isMobileOpen && (
      <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
    )}

    <aside
      className={cn(
        'bg-surface-dark flex flex-col h-screen flex-shrink-0',
        'shadow-[4px_0_24px_-4px_rgba(0,0,0,0.6)]',
        'transition-all duration-300 ease-in-out',
        isMobile
          ? cn('fixed inset-y-0 left-0 w-64 z-50', isMobileOpen ? 'translate-x-0' : '-translate-x-full')
          : cn('sticky top-0 z-40', effectiveCollapsed ? 'w-16' : 'w-64')
      )}
    >
      {/* Logo + Toggle */}
      <div className={cn(
        'flex items-center h-14 flex-shrink-0 border-b border-gray-800/60',
        effectiveCollapsed ? 'justify-center px-2' : 'px-4 gap-3'
      )}>
        <Link href="/files" className="flex-shrink-0">
          <MartaniLogo size={effectiveCollapsed ? 28 : 30} />
        </Link>
        {!effectiveCollapsed && (
          <h1 className="text-lg font-extrabold bg-gradient-to-r from-primary-400 to-primary-600 bg-clip-text text-transparent whitespace-nowrap">
            Martani
          </h1>
        )}
        {isMobile ? (
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 transition-colors flex-shrink-0 ml-auto"
            title={t('nav.close')}
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={toggleSidebar}
            className={cn(
              'p-1.5 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 transition-colors flex-shrink-0',
              effectiveCollapsed ? '' : 'ml-auto'
            )}
            title={effectiveCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          >
            {effectiveCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className={cn(
        'flex-1 space-y-1 overflow-y-auto overflow-x-hidden',
        effectiveCollapsed ? 'px-1.5 py-3' : 'p-4'
      )}>
        {/* Cloud */}
        <div>
          {effectiveCollapsed ? (
            <Link
              href="/files"
              className={cn(
                'flex items-center justify-center rounded-lg py-2.5 transition-colors group relative',
                isCloudActive ? 'bg-gray-800 text-primary-400' : 'text-gray-300 hover:bg-gray-800'
              )}
            >
              <Cloud className="w-5 h-5" />
              <NavTooltip label={t('nav.cloud')} show />
            </Link>
          ) : (
            <>
              <button
                onClick={() => setCloudExpanded(!cloudExpanded)}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isCloudActive ? 'bg-gray-800 text-primary-400' : 'text-gray-300 hover:bg-gray-800'
                )}
              >
                <Cloud className="w-5 h-5" />
                <span className="flex-1 text-left">{t('nav.cloud')}</span>
                {cloudExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {cloudExpanded && (
                <div className="ml-4 mt-1 flex">
                  <div className="w-px bg-gray-700 ml-2 mr-1 flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Link
                      href="/files"
                      className={cn(
                        'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors',
                        isFilesActive ? 'text-primary-400 font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                      )}
                    >
                      <FolderOpen className="w-4 h-4" />
                      {t('nav.explorer')}
                    </Link>
                    <Link
                      href="/indexing"
                      className={cn(
                        'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors',
                        isIndexingActive ? 'text-primary-400 font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                      )}
                    >
                      <Database className="w-4 h-4" />
                      {t('nav.indexing')}
                    </Link>
                    <Link
                      href="/vault"
                      className={cn(
                        'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors',
                        isVaultActive ? 'text-primary-400 font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                      )}
                    >
                      <Shield className="w-4 h-4" />
                      {t('nav.vault')}
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* AI */}
        <div>
          {effectiveCollapsed ? (
            <Link
              href="/chat"
              className={cn(
                'flex items-center justify-center rounded-lg py-2.5 transition-colors group relative',
                isAiActive ? 'bg-gray-800 text-primary-400' : 'text-gray-300 hover:bg-gray-800'
              )}
            >
              <Brain className="w-5 h-5" />
              <NavTooltip label={t('nav.ai')} show />
            </Link>
          ) : (
            <>
              <button
                onClick={() => setAiExpanded(!aiExpanded)}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isAiActive ? 'bg-gray-800 text-primary-400' : 'text-gray-300 hover:bg-gray-800'
                )}
              >
                <Brain className="w-5 h-5" />
                <span className="flex-1 text-left">{t('nav.ai')}</span>
                {aiExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {aiExpanded && (
                <div className="ml-4 mt-1 flex">
                  <div className="w-px bg-gray-700 ml-2 mr-1 flex-shrink-0" />
                  <div className="flex-1 space-y-1">
                    {/* Messenger (moved above Data) */}
                    <Link
                      href="/chat"
                      className={cn(
                        'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors',
                        isChatActive ? 'text-primary-400 font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                      )}
                    >
                      <MessageSquare className="w-4 h-4" />
                      {t('nav.messenger')}
                    </Link>
                    {/* Mining (unified wizard) */}
                    <Link
                      href="/ai/data/mining"
                      className={cn(
                        'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors',
                        isDataActive ? 'text-primary-400 font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                      )}
                    >
                      <MiningIcon className="w-4 h-4" />
                      {t('nav.data')}
                      {aiProcessing && (
                        <span className="w-2 h-2 bg-primary-400 rounded-full animate-pulse flex-shrink-0" />
                      )}
                    </Link>
                    {/* Schedule */}
                    <Link
                      href="/ai/schedule"
                      className={cn(
                        'flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm transition-colors',
                        isScheduleActive ? 'text-primary-400 font-medium' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                      )}
                    >
                      <Clock className="w-4 h-4" />
                      {t('nav.schedule')}
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

      </nav>

      {/* User Section */}
      <div ref={userMenuRef} className={cn(
        'border-t border-gray-800/60 relative flex-shrink-0',
        effectiveCollapsed ? 'p-2' : 'p-3'
      )}>
        {/* User Popup Menu */}
        {showUserMenu && (
          <div className={cn(
            'absolute bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 z-[60]',
            effectiveCollapsed
              ? 'bottom-0 left-full ml-2 w-48'
              : 'bottom-full left-2 right-2 mb-2'
          )}>
            {isAdmin && (
              <>
                <div className="px-3 py-2 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-accent-400" />
                  <span className="text-xs font-semibold text-accent-400 uppercase tracking-wider">
                    {t('admin.label')}
                  </span>
                </div>
                {adminItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setShowUserMenu(false)}
                      className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
                <div className="border-t border-gray-700 my-1" />
              </>
            )}
            {!isAdmin && (
              <Link
                href="/billing"
                onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-3 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
              >
                <CreditCard className="w-4 h-4" />
                {t('user.billing')}
              </Link>
            )}
            <button
              onClick={() => {
                const next: Locale = locale === 'ko' ? 'en' : 'ko';
                setLocale(next);
              }}
              className="flex items-center justify-between w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              <span className="flex items-center gap-3">
                <Globe className="w-4 h-4" />
                {t('user.language')}
              </span>
              <span className="text-xs font-medium text-primary-400 uppercase">{locale.toUpperCase()}</span>
            </button>
            <div className="border-t border-gray-700 my-1" />
            <button
              onClick={() => { setShowUserMenu(false); logout(); }}
              className="flex items-center gap-3 w-full px-3 py-2 text-sm text-gray-400 hover:bg-gray-700 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              {t('user.logout')}
            </button>
          </div>
        )}

        {/* Clickable User Profile */}
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className={cn(
            'flex items-center rounded-lg hover:bg-gray-800 transition-colors',
            effectiveCollapsed ? 'justify-center p-1.5 w-full' : 'gap-3 w-full text-left p-1.5'
          )}
        >
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
            isAdmin ? "bg-accent-500/20" : "bg-primary-500/20"
          )}>
            {isAdmin ? (
              <Shield className="w-4 h-4 text-accent-400" />
            ) : (
              <span className="text-primary-400 text-sm font-medium">
                {user?.name?.[0] || user?.email?.[0] || 'U'}
              </span>
            )}
          </div>
          {!effectiveCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-200 truncate">
                {user?.name || user?.email}
              </p>
              {isAdmin && (
                <p className="text-xs text-accent-400">{t('user.admin')}</p>
              )}
            </div>
          )}
        </button>
      </div>
    </aside>
    </>
  );
}
