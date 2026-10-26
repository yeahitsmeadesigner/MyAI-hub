import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { db, ensureInitialDataSeeded } from '../db/database';
import { findDueReminders, triggerBrowserNotification } from '../lib/reminders';
import {
  calculateNextDueDate,
  sanitizeText,
  validateBackupPayload,
  validateNoteInput,
  validateTaskInput,
} from '../lib/validation';
import type {
  AppSettings,
  BackupDataV1,
  ChatConversation,
  ChatMessage,
  NavTab,
  NoteItem,
  TaskItem,
  TaskPriority,
  TaskRecurrence,
  ToolActionProposal,
} from '../types';

const SETTINGS_STORAGE_KEY = 'myai_hub_settings_v1';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  aiMode: 'offline',
  cloudConsentGiven: false,
  includeContextInCloud: true,
  notificationsEnabled: false,
  dailyFocus: 'Ship mobile-first personal command center & verify local IndexedDB workflows',
  dailyFocusDate: new Date().toISOString().slice(0, 10),
  autoApplySafeOfflineCommands: false,
};

function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      theme:
        parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system'
          ? parsed.theme
          : 'system',
      aiMode:
        parsed.aiMode === 'offline' || parsed.aiMode === 'local' || parsed.aiMode === 'cloud'
          ? parsed.aiMode
          : 'offline',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AppContextValue {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  isLoadingDB: boolean;
  tasks: TaskItem[];
  notes: NoteItem[];
  conversations: ChatConversation[];
  messages: ChatMessage[];
  activeConversationId: string | null;
  setActiveConversationId: (id: string) => void;
  toasts: ToastMessage[];
  showToast: (text: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;
  // Task operations
  createTask: (input: {
    title: string;
    description?: string;
    priority?: TaskPriority;
    category?: string;
    dueDate?: string | null;
    reminderAt?: string | null;
    recurrence?: TaskRecurrence;
  }) => Promise<{ ok: boolean; errors?: string[]; task?: TaskItem }>;
  updateTask: (
    id: string,
    updates: Partial<Omit<TaskItem, 'id' | 'createdAt'>>
  ) => Promise<{ ok: boolean; errors?: string[] }>;
  toggleTaskCompletion: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  // Note operations
  createNote: (input: {
    title: string;
    content: string;
    tags?: string[];
    pinned?: boolean;
  }) => Promise<{ ok: boolean; errors?: string[]; note?: NoteItem }>;
  updateNote: (
    id: string,
    updates: Partial<Omit<NoteItem, 'id' | 'createdAt'>>
  ) => Promise<{ ok: boolean; errors?: string[] }>;
  deleteNote: (id: string) => Promise<void>;
  toggleNotePin: (id: string) => Promise<void>;
  // Chat operations
  createNewConversation: (title?: string) => Promise<ChatConversation>;
  clearConversationMessages: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  addChatMessage: (
    msg: Omit<ChatMessage, 'id' | 'createdAt'>
  ) => Promise<ChatMessage>;
  applyToolProposal: (
    messageId: string,
    proposal: ToolActionProposal
  ) => Promise<void>;
  dismissToolProposal: (messageId: string, proposalId: string) => Promise<void>;
  // Navigation & quick actions
  openNoteInView: (noteId: string) => void;
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  pendingAssistantPrompt: string | null;
  setPendingAssistantPrompt: (prompt: string | null) => void;
  // Backup & Restore
  exportBackupJson: () => BackupDataV1;
  importBackupJson: (
    rawJson: string,
    mode: 'merge' | 'overwrite'
  ) => Promise<{ ok: boolean; errors: string[]; importedCounts?: { tasks: number; notes: number } }>;
  clearAllData: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [isLoadingDB, setIsLoadingDB] = useState<boolean>(true);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [pendingAssistantPrompt, setPendingAssistantPrompt] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (text: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, text, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Apply theme class to documentElement
  useEffect(() => {
    const root = document.documentElement;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const isDark =
        settings.theme === 'dark' || (settings.theme === 'system' && mediaQuery.matches);
      if (isDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    applyTheme();
    mediaQuery.addEventListener('change', applyTheme);
    return () => mediaQuery.removeEventListener('change', applyTheme);
  }, [settings.theme]);

  const updateSettings = useCallback((partial: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore quota errors
      }
      return next;
    });
  }, []);

  const refreshAllFromDB = useCallback(async () => {
    try {
      const [allTasks, allNotes, allConvs, allMsgs] = await Promise.all([
        db.tasks.toArray(),
        db.notes.toArray(),
        db.conversations.toArray(),
        db.messages.toArray(),
      ]);

      allTasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      allNotes.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
      allConvs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      allMsgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      setTasks(allTasks);
      setNotes(allNotes);
      setConversations(allConvs);
      setMessages(allMsgs);

      setActiveConversationId((prev) => {
        if (prev && allConvs.some((c) => c.id === prev)) return prev;
        return allConvs[0]?.id ?? null;
      });
      setSelectedNoteId((prev) => {
        if (prev && allNotes.some((n) => n.id === prev)) return prev;
        return allNotes[0]?.id ?? null;
      });
    } finally {
      setIsLoadingDB(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await ensureInitialDataSeeded();
      if (mounted) {
        await refreshAllFromDB();
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshAllFromDB]);

  // Poll for due reminders while app is open
  useEffect(() => {
    if (!settings.notificationsEnabled) return;
    const interval = setInterval(async () => {
      const due = findDueReminders(tasks);
      for (const task of due) {
        await triggerBrowserNotification(
          `Reminder: ${task.title}`,
          `${task.category} · ${task.priority.toUpperCase()} priority`
        );
        await db.tasks.update(task.id, { reminderFired: true });
        showToast(`Reminder due: ${task.title}`, 'info');
      }
      if (due.length > 0) {
        await refreshAllFromDB();
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [settings.notificationsEnabled, tasks, refreshAllFromDB, showToast]);

  // Task CRUD
  const createTask = useCallback(
    async (input: {
      title: string;
      description?: string;
      priority?: TaskPriority;
      category?: string;
      dueDate?: string | null;
      reminderAt?: string | null;
      recurrence?: TaskRecurrence;
    }) => {
      const validation = validateTaskInput(input);
      if (!validation.valid) {
        return { ok: false, errors: validation.errors };
      }

      const now = new Date().toISOString();
      const newTask: TaskItem = {
        id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: sanitizeText(input.title, 200),
        description: sanitizeText(input.description ?? '', 2000),
        priority: input.priority ?? 'medium',
        category: sanitizeText(input.category ?? 'General', 60) || 'General',
        dueDate: input.dueDate && input.dueDate.trim() ? input.dueDate.trim() : null,
        reminderAt: input.reminderAt && input.reminderAt.trim() ? input.reminderAt.trim() : null,
        reminderFired: false,
        recurrence: input.recurrence ?? 'none',
        completed: false,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      await db.tasks.put(newTask);
      await refreshAllFromDB();
      showToast(`Task "${newTask.title}" saved`, 'success');
      return { ok: true, task: newTask };
    },
    [refreshAllFromDB, showToast]
  );

  const updateTask = useCallback(
    async (id: string, updates: Partial<Omit<TaskItem, 'id' | 'createdAt'>>) => {
      const existing = await db.tasks.get(id);
      if (!existing) {
        return { ok: false, errors: ['Task not found.'] };
      }
      const merged = { ...existing, ...updates };
      const validation = validateTaskInput(merged);
      if (!validation.valid) {
        return { ok: false, errors: validation.errors };
      }

      await db.tasks.update(id, {
        ...updates,
        title: sanitizeText(merged.title, 200),
        description: sanitizeText(merged.description, 2000),
        category: sanitizeText(merged.category, 60) || 'General',
        updatedAt: new Date().toISOString(),
      });
      await refreshAllFromDB();
      showToast('Task updated', 'success');
      return { ok: true };
    },
    [refreshAllFromDB, showToast]
  );

  const toggleTaskCompletion = useCallback(
    async (id: string) => {
      const existing = await db.tasks.get(id);
      if (!existing) return;

      const now = new Date().toISOString();
      const nextCompleted = !existing.completed;

      await db.tasks.update(id, {
        completed: nextCompleted,
        completedAt: nextCompleted ? now : null,
        updatedAt: now,
      });

      // If task has recurrence and was just completed, schedule next occurrence
      if (nextCompleted && existing.recurrence !== 'none') {
        const nextDue = calculateNextDueDate(existing.dueDate, existing.recurrence);
        const recurringClone: TaskItem = {
          ...existing,
          id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          dueDate: nextDue,
          reminderAt: null,
          reminderFired: false,
          completed: false,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        };
        await db.tasks.put(recurringClone);
        showToast(
          `Completed & scheduled next ${existing.recurrence} task for ${nextDue}`,
          'success'
        );
      } else {
        showToast(nextCompleted ? 'Task completed' : 'Task reopened', 'info');
      }

      await refreshAllFromDB();
    },
    [refreshAllFromDB, showToast]
  );

  const deleteTask = useCallback(
    async (id: string) => {
      await db.tasks.delete(id);
      await refreshAllFromDB();
      showToast('Task deleted', 'info');
    },
    [refreshAllFromDB, showToast]
  );

  // Note CRUD
  const createNote = useCallback(
    async (input: { title: string; content: string; tags?: string[]; pinned?: boolean }) => {
      const validation = validateNoteInput(input);
      if (!validation.valid) {
        return { ok: false, errors: validation.errors };
      }
      const now = new Date().toISOString();
      const cleanTags = Array.from(
        new Set(
          (input.tags ?? [])
            .map((t) => sanitizeText(t.replace(/^#/, '').toLowerCase(), 40))
            .filter(Boolean)
        )
      );

      const newNote: NoteItem = {
        id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: sanitizeText(input.title, 200) || 'Untitled Note',
        content: sanitizeText(input.content, 50000),
        tags: cleanTags,
        pinned: Boolean(input.pinned),
        createdAt: now,
        updatedAt: now,
      };

      await db.notes.put(newNote);
      setSelectedNoteId(newNote.id);
      await refreshAllFromDB();
      showToast(`Note "${newNote.title}" created`, 'success');
      return { ok: true, note: newNote };
    },
    [refreshAllFromDB, showToast]
  );

  const updateNote = useCallback(
    async (id: string, updates: Partial<Omit<NoteItem, 'id' | 'createdAt'>>) => {
      const existing = await db.notes.get(id);
      if (!existing) return { ok: false, errors: ['Note not found.'] };

      const merged = { ...existing, ...updates };
      const validation = validateNoteInput(merged);
      if (!validation.valid) {
        return { ok: false, errors: validation.errors };
      }

      const cleanTags = updates.tags
        ? Array.from(
            new Set(
              updates.tags
                .map((t) => sanitizeText(t.replace(/^#/, '').toLowerCase(), 40))
                .filter(Boolean)
            )
          )
        : existing.tags;

      await db.notes.update(id, {
        ...updates,
        title: sanitizeText(merged.title, 200) || 'Untitled Note',
        content: typeof merged.content === 'string' ? merged.content.slice(0, 50000) : existing.content,
        tags: cleanTags,
        updatedAt: new Date().toISOString(),
      });
      await refreshAllFromDB();
      return { ok: true };
    },
    [refreshAllFromDB]
  );

  const deleteNote = useCallback(
    async (id: string) => {
      await db.notes.delete(id);
      await refreshAllFromDB();
      showToast('Note permanently deleted', 'info');
    },
    [refreshAllFromDB, showToast]
  );

  const toggleNotePin = useCallback(
    async (id: string) => {
      const existing = await db.notes.get(id);
      if (!existing) return;
      const nextPinned = !existing.pinned;
      await db.notes.update(id, {
        pinned: nextPinned,
        updatedAt: new Date().toISOString(),
      });
      await refreshAllFromDB();
      showToast(nextPinned ? 'Note pinned to top' : 'Note unpinned', 'info');
    },
    [refreshAllFromDB, showToast]
  );

  // Chat operations
  const createNewConversation = useCallback(
    async (title = 'New Conversation') => {
      const now = new Date().toISOString();
      const conv: ChatConversation = {
        id: `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: sanitizeText(title, 120) || 'New Conversation',
        createdAt: now,
        updatedAt: now,
      };
      await db.conversations.put(conv);
      setActiveConversationId(conv.id);
      await refreshAllFromDB();
      return conv;
    },
    [refreshAllFromDB]
  );

  const clearConversationMessages = useCallback(
    async (conversationId: string) => {
      await db.messages.where('conversationId').equals(conversationId).delete();
      await refreshAllFromDB();
      showToast('Conversation cleared', 'info');
    },
    [refreshAllFromDB, showToast]
  );

  const deleteConversation = useCallback(
    async (conversationId: string) => {
      await db.transaction('rw', db.conversations, db.messages, async () => {
        await db.messages.where('conversationId').equals(conversationId).delete();
        await db.conversations.delete(conversationId);
      });
      await refreshAllFromDB();
      showToast('Conversation deleted', 'info');
    },
    [refreshAllFromDB, showToast]
  );

  const addChatMessage = useCallback(
    async (msg: Omit<ChatMessage, 'id' | 'createdAt'>) => {
      const now = new Date().toISOString();
      const record: ChatMessage = {
        ...msg,
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        createdAt: now,
      };
      await db.messages.put(record);

      // Update conversation timestamp & auto-title if first user message
      const conv = await db.conversations.get(msg.conversationId);
      if (conv) {
        const shouldRetitle =
          msg.role === 'user' &&
          (conv.title === 'New Conversation' || conv.title === 'Daily Command Session');
        await db.conversations.update(conv.id, {
          updatedAt: now,
          ...(shouldRetitle ? { title: sanitizeText(msg.content, 48) } : {}),
        });
      }

      await refreshAllFromDB();
      return record;
    },
    [refreshAllFromDB]
  );

  const applyToolProposal = useCallback(
    async (messageId: string, proposal: ToolActionProposal) => {
      if (proposal.status !== 'pending') return;

      if (proposal.type === 'create_task') {
        await createTask({
          title: proposal.payload.title || 'Untitled Task',
          description: proposal.payload.description || '',
          priority: proposal.payload.priority || 'medium',
          category: proposal.payload.category || 'Personal',
          dueDate: proposal.payload.dueDate ?? null,
        });
      } else if (proposal.type === 'complete_task' && proposal.payload.taskId) {
        await toggleTaskCompletion(proposal.payload.taskId);
      } else if (proposal.type === 'create_note') {
        await createNote({
          title: proposal.payload.title || 'Note from Assistant',
          content: proposal.payload.content || '',
          tags: proposal.payload.tags || ['assistant'],
        });
      }

      const msg = await db.messages.get(messageId);
      if (msg && msg.toolProposals) {
        const updatedProposals = msg.toolProposals.map((p) =>
          p.id === proposal.id ? { ...p, status: 'applied' as const } : p
        );
        await db.messages.update(messageId, { toolProposals: updatedProposals });
        await refreshAllFromDB();
      }
    },
    [createNote, createTask, refreshAllFromDB, toggleTaskCompletion]
  );

  const dismissToolProposal = useCallback(
    async (messageId: string, proposalId: string) => {
      const msg = await db.messages.get(messageId);
      if (msg && msg.toolProposals) {
        const updatedProposals = msg.toolProposals.map((p) =>
          p.id === proposalId ? { ...p, status: 'dismissed' as const } : p
        );
        await db.messages.update(messageId, { toolProposals: updatedProposals });
        await refreshAllFromDB();
      }
    },
    [refreshAllFromDB]
  );

  const openNoteInView = useCallback((noteId: string) => {
    setSelectedNoteId(noteId);
    setActiveTab('notes');
  }, []);

  const exportBackupJson = useCallback((): BackupDataV1 => {
    return {
      app: 'MyAI Hub',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      settings,
      data: {
        tasks,
        notes,
        conversations,
        messages,
      },
    };
  }, [conversations, messages, notes, settings, tasks]);

  const importBackupJson = useCallback(
    async (rawJson: string, mode: 'merge' | 'overwrite') => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        return { ok: false, errors: ['File is not valid JSON.'] };
      }

      const validation = validateBackupPayload(parsed);
      if (!validation.valid || !validation.payload) {
        return { ok: false, errors: validation.errors };
      }

      const { data, settings: importedSettings } = validation.payload;

      await db.transaction('rw', db.tasks, db.notes, db.conversations, db.messages, async () => {
        if (mode === 'overwrite') {
          await Promise.all([
            db.tasks.clear(),
            db.notes.clear(),
            db.conversations.clear(),
            db.messages.clear(),
          ]);
        }
        await db.tasks.bulkPut(data.tasks);
        await db.notes.bulkPut(data.notes);
        await db.conversations.bulkPut(data.conversations);
        await db.messages.bulkPut(data.messages);
      });

      if (importedSettings) {
        updateSettings(importedSettings);
      }

      await refreshAllFromDB();
      showToast(
        `Backup ${mode === 'overwrite' ? 'restored' : 'merged'}: ${data.tasks.length} tasks, ${
          data.notes.length
        } notes`,
        'success'
      );

      return {
        ok: true,
        errors: [],
        importedCounts: {
          tasks: data.tasks.length,
          notes: data.notes.length,
        },
      };
    },
    [refreshAllFromDB, showToast, updateSettings]
  );

  const clearAllData = useCallback(async () => {
    await db.transaction('rw', db.tasks, db.notes, db.conversations, db.messages, async () => {
      await Promise.all([
        db.tasks.clear(),
        db.notes.clear(),
        db.conversations.clear(),
        db.messages.clear(),
      ]);
    });
    localStorage.setItem('myai_hub_seeded_v1', 'true');
    setSelectedNoteId(null);
    setActiveConversationId(null);
    await refreshAllFromDB();
    showToast('All local IndexedDB data has been cleared', 'info');
  }, [refreshAllFromDB, showToast]);

  return (
    <AppContext.Provider
      value={{
        activeTab,
        setActiveTab,
        settings,
        updateSettings,
        isLoadingDB,
        tasks,
        notes,
        conversations,
        messages,
        activeConversationId,
        setActiveConversationId,
        toasts,
        showToast,
        dismissToast,
        createTask,
        updateTask,
        toggleTaskCompletion,
        deleteTask,
        createNote,
        updateNote,
        deleteNote,
        toggleNotePin,
        createNewConversation,
        clearConversationMessages,
        deleteConversation,
        addChatMessage,
        applyToolProposal,
        dismissToolProposal,
        openNoteInView,
        selectedNoteId,
        setSelectedNoteId,
        pendingAssistantPrompt,
        setPendingAssistantPrompt,
        exportBackupJson,
        importBackupJson,
        clearAllData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used inside AppProvider');
  }
  return ctx;
}
