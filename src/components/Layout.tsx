import React, { useState } from 'react';
import {
  CheckSquare,
  Download,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Settings,
  WifiOff,
  X,
} from 'lucide-react';
import { useApp } from '../app/AppContext';
import { useOnlineStatus, usePWAInstall } from '../lib/pwa';
import type { NavTab } from '../types';

const NAV_ITEMS: { id: NavTab; label: string; shortLabel: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { id: 'assistant', label: 'AI Assistant', shortLabel: 'Assistant', icon: MessageSquare },
  { id: 'tasks', label: 'Tasks & Reminders', shortLabel: 'Tasks', icon: CheckSquare },
  { id: 'notes', label: 'Smart Notes', shortLabel: 'Notes', icon: FileText },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

export const Layout: React.FC<{
  children: React.ReactNode;
  onQuickNewTask: () => void;
}> = ({ children, onQuickNewTask }) => {
  const { activeTab, setActiveTab, settings, tasks, notes, toasts, dismissToast } = useApp();
  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showInstallModal, setShowInstallModal] = useState(false);

  const openTasksCount = tasks.filter((t) => !t.completed).length;

  const modeLabel =
    settings.aiMode === 'offline'
      ? 'Offline Command Mode'
      : settings.aiMode === 'local'
      ? 'On-Device Browser AI'
      : 'Cloud Gemini Mode';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Bar following the strict 3-zone contract */}
      <header className="sticky top-0 z-30 h-13 flex items-center justify-between gap-8 px-4 lg:px-8 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('dashboard');
          }}
          className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-teal-600 rounded"
        >
          MyAI Hub
        </a>

        {/* Zone 2: Contextual Breadcrumb on Desktop (lg:) and Compact Nav Links on Tablet (md: to lg:) */}
        <div className="hidden lg:flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span>Workspace</span>
          <span aria-hidden="true">/</span>
          <span className="text-slate-900 dark:text-white font-semibold">
            {NAV_ITEMS.find((i) => i.id === activeTab)?.label ?? 'Dashboard'}
          </span>
          <span aria-hidden="true">·</span>
          <span>{modeLabel}</span>
        </div>

        <nav aria-label="Tablet Navigation" className="hidden md:flex lg:hidden items-center gap-5 text-sm font-medium">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  isActive
                    ? 'border-teal-600 text-slate-900 dark:text-white font-semibold'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {item.shortLabel}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onQuickNewTask}
            className="min-h-[38px] px-4 py-1.5 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 active:bg-teal-800 rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>New Task</span>
          </button>
        </div>
      </header>

      {/* Main Workspace Container */}
      <div className="flex-1 flex max-w-[1440px] w-full mx-auto">
        {/* Desktop Sidebar */}
        <aside
          aria-label="Workspace Sidebar"
          className="hidden lg:flex flex-col w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-5 justify-between"
        >
          <div className="space-y-6">
            <div>
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500 px-3 mb-2">
                Workspace
              </p>
              <nav aria-label="Sidebar Navigation" className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveTab(item.id)}
                      className={`w-full min-h-[42px] px-3 py-2 rounded-xl text-sm font-medium flex items-center justify-between transition-colors ${
                        isActive
                          ? 'bg-slate-900 text-white dark:bg-teal-600 dark:text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <span className="flex items-center gap-3 whitespace-nowrap">
                        <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>{item.label}</span>
                      </span>
                      {item.id === 'tasks' && openTasksCount > 0 && (
                        <span className="font-mono text-xs tabular-nums opacity-80">
                          {openTasksCount}
                        </span>
                      )}
                      {item.id === 'notes' && notes.length > 0 && (
                        <span className="font-mono text-xs tabular-nums opacity-80">
                          {notes.length}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 px-3 space-y-2">
              <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
                Privacy & Runtime
              </p>
              <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                {modeLabel}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {isOnline ? 'Network connected' : 'Offline — Using IndexedDB'} · Local storage active
              </p>
            </div>
          </div>

          {/* PWA Install Trigger in Sidebar */}
          {!isInstalled && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={async () => {
                  if (isInstallable) {
                    await install();
                  } else {
                    setShowInstallModal(true);
                  }
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
              >
                <Download className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden="true" />
                <span>{isInstallable ? 'Install MyAI Hub App' : 'PWA Install Guide'}</span>
              </button>
            </div>
          )}
        </aside>

        {/* Main Content Viewport */}
        <main
          id="main-content"
          className="flex-1 min-w-0 pb-20 lg:pb-10 px-4 sm:px-6 lg:px-8 pt-5"
        >
          {!isOnline && (
            <div
              role="status"
              className="mb-4 px-4 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2">
                <WifiOff className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <span>
                  <strong>Offline Mode Active:</strong> Tasks, Smart Notes, and Offline Command Assistant continue working locally via IndexedDB.
                </span>
              </span>
            </div>
          )}

          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (< lg screens, h-15 = 60px, adhering to <15% sticky height cap) */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 h-15 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center px-1"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`min-h-[48px] min-w-[44px] flex flex-col items-center justify-center rounded-xl transition-colors ${
                isActive
                  ? 'text-teal-600 dark:text-teal-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Icon className="w-5 h-5" aria-hidden="true" />
              <span className="text-[11px] mt-0.5 tracking-tight whitespace-nowrap">
                {item.shortLabel}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Toast Feedback Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-18 lg:bottom-6 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl shadow-lg border text-xs font-medium ${
                t.type === 'error'
                  ? 'bg-red-950 text-red-100 border-red-800'
                  : t.type === 'success'
                  ? 'bg-slate-900 text-white border-slate-700 dark:bg-teal-950 dark:border-teal-800'
                  : 'bg-slate-900 text-slate-100 border-slate-800'
              }`}
            >
              <span>{t.text}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                className="p-1 rounded hover:bg-white/10"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* PWA Install Instructions Modal */}
      {showInstallModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 id="pwa-install-title" className="text-lg font-bold text-slate-900 dark:text-white">
                Install MyAI Hub as an App
              </h2>
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                aria-label="Close install guide"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              MyAI Hub includes a compliant Web App Manifest and Service Worker for offline access. Installation requires an HTTPS connection (or <code className="font-mono text-xs">localhost</code>).
            </p>
            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white mb-1">
                  Android (Chrome / Edge / Brave):
                </p>
                <p>
                  Tap the browser menu (<strong>⋮</strong>) in the top-right corner and select <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                </p>
              </div>
              {isIOS || true ? (
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white mb-1">
                    iPhone & iPad (Safari):
                  </p>
                  <p>
                    Tap the <strong>Share</strong> button in the Safari toolbar, scroll down, and tap <strong>Add to Home Screen</strong>.
                  </p>
                </div>
              ) : null}
              <div>
                <p className="font-semibold text-slate-900 dark:text-white mb-1">
                  Desktop (Chrome / Edge):
                </p>
                <p>
                  Click the <strong>Install MyAI Hub</strong> icon on the right side of the address bar.
                </p>
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowInstallModal(false)}
                className="min-h-[42px] px-4 py-2 rounded-lg bg-slate-900 text-white dark:bg-teal-600 text-xs font-semibold hover:opacity-90"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
