import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Cpu,
  Database,
  Download,
  Info,
  Moon,
  Monitor,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { checkCloudServerStatus } from '../../lib/cloudAiClient';
import { checkLocalModelStatus } from '../../lib/localAiEngine';
import { useOnlineStatus, usePWAInstall } from '../../lib/pwa';
import {
  getNotificationPermissionState,
  requestBrowserNotificationPermission,
  triggerBrowserNotification,
  type NotificationPermissionState,
} from '../../lib/reminders';
import { validateBackupPayload } from '../../lib/validation';
import type { AIMode, CloudServerStatus, LocalModelStatus, ThemeMode } from '../../types';

export const SettingsView: React.FC = () => {
  const {
    settings,
    updateSettings,
    tasks,
    notes,
    conversations,
    messages,
    exportBackupJson,
    importBackupJson,
    clearAllData,
    showToast,
  } = useApp();

  const isOnline = useOnlineStatus();
  const { isInstallable, isInstalled, install } = usePWAInstall();

  const [localModelStatus, setLocalModelStatus] = useState<LocalModelStatus | null>(null);
  const [cloudStatus, setCloudStatus] = useState<CloudServerStatus | null>(null);
  const [notifPerm, setNotifPerm] = useState<NotificationPermissionState>(() =>
    getNotificationPermissionState()
  );

  // Import JSON state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingImportJson, setPendingImportJson] = useState<string | null>(null);
  const [pendingImportSummary, setPendingImportSummary] = useState<{
    tasks: number;
    notes: number;
    conversations: number;
    exportedAt: string;
  } | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  // Clear All Data confirmation modal
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState('');

  useEffect(() => {
    checkLocalModelStatus().then(setLocalModelStatus);
    checkCloudServerStatus().then(setCloudStatus);
  }, []);

  const handleExportBackup = () => {
    const payload = exportBackupJson();
    const jsonString = JSON.stringify(payload, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `myai-hub-backup-v1-${dateStamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported versioned JSON backup', 'success');
  };

  const handleFileUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportErrors([]);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setImportErrors(['Selected file is not valid JSON.']);
        return;
      }

      const validation = validateBackupPayload(parsed);
      if (!validation.valid || !validation.payload) {
        setImportErrors(validation.errors);
        return;
      }

      setPendingImportJson(text);
      setPendingImportSummary({
        tasks: validation.payload.data.tasks.length,
        notes: validation.payload.data.notes.length,
        conversations: validation.payload.data.conversations.length,
        exportedAt: validation.payload.exportedAt,
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmImport = async (mode: 'merge' | 'overwrite') => {
    if (!pendingImportJson) return;
    const res = await importBackupJson(pendingImportJson, mode);
    if (!res.ok) {
      setImportErrors(res.errors);
    }
    setPendingImportJson(null);
    setPendingImportSummary(null);
  };

  const handleRequestNotifications = async () => {
    const perm = await requestBrowserNotificationPermission();
    setNotifPerm(perm);
    if (perm === 'granted') {
      updateSettings({ notificationsEnabled: true });
      await triggerBrowserNotification(
        'MyAI Hub Notifications Enabled',
        'You will receive foreground alerts when scheduled task reminders come due.'
      );
      showToast('Browser notifications enabled', 'success');
    } else if (perm === 'denied') {
      updateSettings({ notificationsEnabled: false });
      showToast('Browser notifications are blocked in site settings', 'error');
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div className="pb-5 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings & Privacy</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Configure appearance, local/offline AI runtime modes, notification permissions, and IndexedDB backups
        </p>
      </div>

      {/* 1. Appearance & Theme */}
      <section
        aria-labelledby="settings-theme-heading"
        className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
      >
        <div>
          <h2 id="settings-theme-heading" className="text-base font-bold text-slate-900 dark:text-white">
            Appearance & Theme
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Follow system light/dark preference by default or lock a specific theme
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { id: 'system', label: 'System Default', icon: Monitor },
              { id: 'light', label: 'Light Mode', icon: Sun },
              { id: 'dark', label: 'Dark Mode', icon: Moon },
            ] as { id: ThemeMode; label: string; icon: React.FC<{ className?: string }> }[]
          ).map((item) => {
            const Icon = item.icon;
            const active = settings.theme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => updateSettings({ theme: item.id })}
                aria-pressed={active}
                className={`min-h-[52px] p-3 rounded-xl border text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-2 transition-colors ${
                  active
                    ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. AI Mode, Hardware Diagnostics & Privacy */}
      <section
        aria-labelledby="settings-ai-heading"
        className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="settings-ai-heading" className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              <span>AI Operating Mode & Privacy Controls</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Defaults to 100% local/offline execution. Private notes and tasks are never sent to a cloud provider without your explicit opt-in.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {(
            [
              {
                id: 'offline',
                title: '1. Offline / Basic Command Mode (Default — Recommended for Privacy)',
                desc: 'Works completely offline with zero network calls. Supports structured commands: plan my day, add task, list tasks, complete task, note, search notes, summarize, and task extraction.',
              },
              {
                id: 'local',
                title: '2. Local On-Device Browser Model Mode',
                desc: 'Uses a genuinely on-device browser runtime (Chrome built-in Prompt API / window.ai with WebGPU) when supported by your device, falling back to the Offline Command Assistant when unavailable.',
              },
              {
                id: 'cloud',
                title: '3. Optional Server-Side Cloud Provider Mode (Gemini API)',
                desc: 'Connects to the backend /api/ai/chat route using server-side environment credentials. Never stores API keys in browser storage.',
              },
            ] as { id: AIMode; title: string; desc: string }[]
          ).map((option) => {
            const active = settings.aiMode === option.id;
            return (
              <div
                key={option.id}
                className={`p-4 rounded-xl border transition-colors ${
                  active
                    ? 'border-teal-600 bg-teal-50/40 dark:bg-teal-950/25'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="ai-mode-radio"
                    checked={active}
                    onChange={() => {
                      if (option.id === 'cloud') {
                        updateSettings({ aiMode: 'cloud', cloudConsentGiven: true });
                      } else {
                        updateSettings({ aiMode: option.id });
                      }
                    }}
                    className="mt-1 text-teal-600 focus:ring-teal-500"
                  />
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {option.title}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {option.desc}
                    </p>
                  </div>
                </label>
              </div>
            );
          })}
        </div>

        {/* Honest Local Model Runtime Diagnostics */}
        {localModelStatus && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <p className="font-semibold text-slate-900 dark:text-white">
              On-Device Browser Runtime Compatibility Check:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 dark:text-slate-400 font-mono tabular-nums">
              <p>
                Runtime Status:{' '}
                <strong className="text-slate-900 dark:text-slate-200">
                  {localModelStatus.supported ? 'Available' : 'Unavailable in current browser'}
                </strong>
              </p>
              <p>
                WebGPU Adapter:{' '}
                <strong className="text-slate-900 dark:text-slate-200">
                  {localModelStatus.hasWebGPU ? localModelStatus.gpuAdapterName : 'Not detected'}
                </strong>
              </p>
              <p>Est. Model Download: {localModelStatus.estimatedDownloadSize}</p>
              <p>Min Hardware Memory: {localModelStatus.minimumMemoryRequired}</p>
            </div>
            <p className="text-slate-500 dark:text-slate-400 pt-1 leading-relaxed">
              {localModelStatus.reason}
            </p>
          </div>
        )}

        {/* Cloud Mode Privacy & Server Check */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              <span>Cloud Backend Endpoint Status:</span>
            </p>
            <span className="font-mono text-slate-600 dark:text-slate-400">
              {!isOnline
                ? 'Offline'
                : cloudStatus?.available
                ? `Configured (${cloudStatus.model})`
                : cloudStatus?.message || 'Checking...'}
            </span>
          </div>

          <label className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.cloudConsentGiven}
              onChange={(e) =>
                updateSettings({
                  cloudConsentGiven: e.target.checked,
                  ...(e.target.checked ? {} : { aiMode: 'offline' }),
                })
              }
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>
              I consent to sending chat prompts to the server-side Gemini endpoint when Cloud Mode is active
            </span>
          </label>

          <label className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.includeContextInCloud}
              onChange={(e) => updateSettings({ includeContextInCloud: e.target.checked })}
              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
            />
            <span>
              Include relevant local task titles & matching note excerpts as context in Cloud Mode
            </span>
          </label>
        </div>
      </section>

      {/* 3. Browser Notifications & Reminders */}
      <section
        aria-labelledby="settings-notifications-heading"
        className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2
              id="settings-notifications-heading"
              className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"
            >
              <Bell className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              <span>Reminders & Browser Notifications</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Current Browser Permission: <strong className="uppercase">{notifPerm}</strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRequestNotifications}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-teal-600 text-xs font-semibold hover:opacity-90 whitespace-nowrap"
            >
              {notifPerm === 'granted' ? 'Send Test Notification' : 'Enable Browser Notifications'}
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          <strong>Honest Platform Limitation:</strong> Standard web apps and PWAs can fire scheduled notifications reliably while the app is open in the foreground or a background tab. When the browser or OS suspends the process on Android or iOS, background delivery requires a remote Web Push server (<code className="font-mono">PushManager</code> + VAPID) or a native OS wrapper.
        </p>
      </section>

      {/* 4. Data Backup, Restore & Clear Data */}
      <section
        aria-labelledby="settings-backup-heading"
        className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-5"
      >
        <div>
          <h2
            id="settings-backup-heading"
            className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"
          >
            <Database className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <span>Local IndexedDB Storage, Backup & Restore</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
            Currently storing {tasks.length} tasks · {notes.length} notes · {conversations.length} conversations ({messages.length} messages)
          </p>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          All personal data lives in your browser’s <strong>IndexedDB</strong> (<code className="font-mono">MyAIHubDB</code>). Clearing your browser site data or uninstalling the browser will remove locally stored data unless you export a JSON backup.
        </p>

        {importErrors.length > 0 && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 space-y-1"
          >
            <p className="font-semibold">Backup Import Validation Failed:</p>
            {importErrors.map((err, i) => (
              <p key={i}>• {err}</p>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportBackup}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap"
          >
            <Download className="w-4 h-4" aria-hidden="true" />
            <span>Export JSON Backup (v1)</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleFileUploadChange}
            className="hidden"
            id="backup-file-upload"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 whitespace-nowrap"
          >
            <Upload className="w-4 h-4" aria-hidden="true" />
            <span>Import JSON Backup</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setClearConfirmText('');
              setShowClearConfirmModal(true);
            }}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold text-red-600 dark:text-red-400 flex items-center gap-2 whitespace-nowrap"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>Clear All Local Data</span>
          </button>
        </div>
      </section>

      {/* 5. PWA Installation & About */}
      <section
        aria-labelledby="settings-about-heading"
        className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2
              id="settings-about-heading"
              className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"
            >
              <Smartphone className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
              <span>PWA Installation & About MyAI Hub</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
              Version 1.0.0 · Schema v1 · Zero Analytics / Zero Third-Party Tracking
            </p>
          </div>

          {!isInstalled && isInstallable && (
            <button
              type="button"
              onClick={install}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              <span>Install App Now</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-300">
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-teal-600" aria-hidden="true" />
              <span>Installing on Android & Desktop</span>
            </p>
            <p className="leading-relaxed">
              1. Open MyAI Hub over HTTPS (or localhost) in Chrome, Edge, or Brave.<br />
              2. On Android, tap the browser menu (<strong>⋮</strong>) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.<br />
              3. Once installed, the Service Worker precaches static UI assets so your tasks, notes, and offline assistant load instantly even in Airplane Mode.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1.5">
            <p className="font-semibold text-slate-900 dark:text-white">
              Offline vs. Local Model vs. Cloud Capabilities
            </p>
            <p className="leading-relaxed">
              • <strong>Works 100% Offline:</strong> Task CRUD, recurring tasks, Smart Notes Markdown editor, note search with citations, extractive summarization, action item extraction, and <code className="font-mono">plan my day</code>.<br />
              • <strong>Requires Local Model / Cloud:</strong> Open-ended conversational synthesis and generative rewriting.
            </p>
          </div>
        </div>
      </section>

      {/* Import Merge vs Overwrite Confirmation Modal */}
      {pendingImportSummary && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h2 id="import-confirm-title" className="text-base font-bold text-slate-900 dark:text-white">
              Import Validated Backup File
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Backup exported on <span className="font-mono">{new Date(pendingImportSummary.exportedAt).toLocaleString()}</span> contains:
            </p>
            <ul className="text-xs font-mono text-slate-700 dark:text-slate-200 space-y-1 pl-4 list-disc">
              <li>{pendingImportSummary.tasks} tasks</li>
              <li>{pendingImportSummary.notes} smart notes</li>
              <li>{pendingImportSummary.conversations} conversations</li>
            </ul>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choose whether to <strong>Merge</strong> these records with your current workspace or <strong>Overwrite</strong> all existing records:
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setPendingImportJson(null);
                  setPendingImportSummary(null);
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleConfirmImport('merge')}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
              >
                Merge with Existing
              </button>
              <button
                type="button"
                onClick={() => handleConfirmImport('overwrite')}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold"
              >
                Overwrite All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Data Strong Confirmation Modal */}
      {showClearConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-all-data-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h2 id="clear-all-data-title" className="text-base font-bold text-red-600 dark:text-red-400">
              Permanently Clear All Local Data?
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              This will permanently erase all <strong>{tasks.length} tasks</strong>, <strong>{notes.length} notes</strong>, and <strong>{conversations.length} chat conversations</strong> from IndexedDB. Type <code className="font-mono font-bold">DELETE</code> below to confirm:
            </p>
            <div>
              <label htmlFor="confirm-delete-input" className="sr-only">
                Type DELETE to confirm
              </label>
              <input
                id="confirm-delete-input"
                type="text"
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirmModal(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearConfirmText.trim() !== 'DELETE'}
                onClick={async () => {
                  await clearAllData();
                  setShowClearConfirmModal(false);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-semibold"
              >
                Erase All Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
