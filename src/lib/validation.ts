import type {
  BackupDataV1,
  ChatConversation,
  ChatMessage,
  NoteItem,
  TaskItem,
  TaskPriority,
  TaskRecurrence,
} from '../types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high'];
const VALID_RECURRENCES: TaskRecurrence[] = ['none', 'daily', 'weekly', 'monthly'];

export function sanitizeText(input: unknown, maxLength = 10000): string {
  if (typeof input !== 'string') return '';
  return input.replace(/\0/g, '').trim().slice(0, maxLength);
}

export function validateTaskInput(input: {
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  category?: unknown;
  dueDate?: unknown;
  recurrence?: unknown;
}): ValidationResult {
  const errors: string[] = [];
  const title = sanitizeText(input.title, 200);

  if (!title) {
    errors.push('Task title is required.');
  } else if (title.length < 2) {
    errors.push('Task title must be at least 2 characters.');
  }

  if (input.priority !== undefined && !VALID_PRIORITIES.includes(input.priority as TaskPriority)) {
    errors.push('Priority must be low, medium, or high.');
  }

  if (
    input.recurrence !== undefined &&
    !VALID_RECURRENCES.includes(input.recurrence as TaskRecurrence)
  ) {
    errors.push('Recurrence must be none, daily, weekly, or monthly.');
  }

  if (input.dueDate && typeof input.dueDate === 'string' && input.dueDate.trim() !== '') {
    const parsed = Date.parse(input.dueDate);
    if (Number.isNaN(parsed)) {
      errors.push('Due date is not a valid date format.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateNoteInput(input: {
  title?: unknown;
  content?: unknown;
  tags?: unknown;
}): ValidationResult {
  const errors: string[] = [];
  const title = sanitizeText(input.title, 200);
  const content = typeof input.content === 'string' ? input.content.trim() : '';

  if (!title && !content) {
    errors.push('A note requires either a title or body content.');
  }

  if (title.length > 200) {
    errors.push('Note title cannot exceed 200 characters.');
  }

  if (input.tags !== undefined && !Array.isArray(input.tags)) {
    errors.push('Tags must be an array of strings.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function calculateNextDueDate(
  currentDueDate: string | null,
  recurrence: TaskRecurrence
): string | null {
  if (recurrence === 'none') return null;

  const baseDate = currentDueDate ? new Date(currentDueDate) : new Date();
  if (Number.isNaN(baseDate.getTime())) return null;

  const next = new Date(baseDate.getTime());
  if (recurrence === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (recurrence === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (recurrence === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  }

  const hasTime = currentDueDate ? currentDueDate.includes('T') : false;
  if (hasTime) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}T${pad(
      next.getHours()
    )}:${pad(next.getMinutes())}`;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

export function isTaskOverdue(task: TaskItem, now: Date = new Date()): boolean {
  if (task.completed || !task.dueDate) return false;
  const dueStr = task.dueDate.includes('T') ? task.dueDate : `${task.dueDate}T23:59:59`;
  const dueTime = new Date(dueStr).getTime();
  if (Number.isNaN(dueTime)) return false;
  return dueTime < now.getTime();
}

export function isTaskDueToday(task: TaskItem, now: Date = new Date()): boolean {
  if (!task.dueDate) return false;
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayPrefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return task.dueDate.startsWith(todayPrefix);
}

export function computeNoteStats(content: string): {
  words: number;
  characters: number;
  readingTimeMinutes: number;
  lines: number;
} {
  const trimmed = content.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  const characters = content.length;
  const readingTimeMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));
  const lines = content ? content.split(/\r?\n/).length : 0;
  return { words, characters, readingTimeMinutes, lines };
}

export function validateBackupPayload(raw: unknown): {
  valid: boolean;
  errors: string[];
  payload?: BackupDataV1;
} {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Backup file must be a valid JSON object.'] };
  }

  const obj = raw as Record<string, unknown>;
  if (obj.app !== 'MyAI Hub') {
    errors.push('Invalid backup header: expected app "MyAI Hub".');
  }
  if (obj.schemaVersion !== 1) {
    errors.push(`Unsupported backup schemaVersion "${String(obj.schemaVersion)}". Expected version 1.`);
  }
  if (!obj.data || typeof obj.data !== 'object') {
    errors.push('Missing "data" section in backup file.');
    return { valid: false, errors };
  }

  const data = obj.data as Record<string, unknown>;
  if (!Array.isArray(data.tasks)) {
    errors.push('Backup data.tasks must be an array.');
  }
  if (!Array.isArray(data.notes)) {
    errors.push('Backup data.notes must be an array.');
  }
  if (!Array.isArray(data.conversations)) {
    errors.push('Backup data.conversations must be an array.');
  }
  if (!Array.isArray(data.messages)) {
    errors.push('Backup data.messages must be an array.');
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const sanitizedTasks: TaskItem[] = [];
  for (const item of data.tasks as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    if (typeof t.id !== 'string' || typeof t.title !== 'string' || !t.title.trim()) {
      errors.push('Every task in backup must have a valid string id and non-empty title.');
      break;
    }
    sanitizedTasks.push({
      id: t.id,
      title: sanitizeText(t.title, 200),
      description: sanitizeText(t.description ?? '', 2000),
      priority: VALID_PRIORITIES.includes(t.priority as TaskPriority)
        ? (t.priority as TaskPriority)
        : 'medium',
      category: sanitizeText(t.category ?? 'General', 60) || 'General',
      dueDate: typeof t.dueDate === 'string' ? t.dueDate : null,
      reminderAt: typeof t.reminderAt === 'string' ? t.reminderAt : null,
      reminderFired: Boolean(t.reminderFired),
      recurrence: VALID_RECURRENCES.includes(t.recurrence as TaskRecurrence)
        ? (t.recurrence as TaskRecurrence)
        : 'none',
      completed: Boolean(t.completed),
      completedAt: typeof t.completedAt === 'string' ? t.completedAt : null,
      createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
      updatedAt: typeof t.updatedAt === 'string' ? t.updatedAt : new Date().toISOString(),
    });
  }

  const sanitizedNotes: NoteItem[] = [];
  for (const item of data.notes as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const n = item as Record<string, unknown>;
    if (typeof n.id !== 'string' || (typeof n.title !== 'string' && typeof n.content !== 'string')) {
      errors.push('Every note in backup must have a valid string id and title or content.');
      break;
    }
    sanitizedNotes.push({
      id: n.id,
      title: sanitizeText(n.title ?? 'Untitled Note', 200) || 'Untitled Note',
      content: sanitizeText(n.content ?? '', 50000),
      tags: Array.isArray(n.tags)
        ? n.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => sanitizeText(tag, 40))
        : [],
      pinned: Boolean(n.pinned),
      createdAt: typeof n.createdAt === 'string' ? n.createdAt : new Date().toISOString(),
      updatedAt: typeof n.updatedAt === 'string' ? n.updatedAt : new Date().toISOString(),
    });
  }

  const sanitizedConversations: ChatConversation[] = (data.conversations as unknown[])
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object' && typeof (c as Record<string, unknown>).id === 'string'))
    .map((c) => ({
      id: String(c.id),
      title: sanitizeText(c.title ?? 'Conversation', 120) || 'Conversation',
      createdAt: typeof c.createdAt === 'string' ? c.createdAt : new Date().toISOString(),
      updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : new Date().toISOString(),
    }));

  const sanitizedMessages: ChatMessage[] = (data.messages as unknown[])
    .filter((m): m is Record<string, unknown> => Boolean(m && typeof m === 'object' && typeof (m as Record<string, unknown>).id === 'string'))
    .map((m) => ({
      id: String(m.id),
      conversationId: String(m.conversationId ?? ''),
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: sanitizeText(m.content ?? '', 25000),
      modeUsed: m.modeUsed === 'local' || m.modeUsed === 'cloud' ? m.modeUsed : 'offline',
      createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
      isError: Boolean(m.isError),
      citations: Array.isArray(m.citations) ? (m.citations as ChatMessage['citations']) : undefined,
      toolProposals: Array.isArray(m.toolProposals) ? (m.toolProposals as ChatMessage['toolProposals']) : undefined,
    }));

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    payload: {
      app: 'MyAI Hub',
      schemaVersion: 1,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      settings: obj.settings && typeof obj.settings === 'object' ? (obj.settings as BackupDataV1['settings']) : undefined,
      data: {
        tasks: sanitizedTasks,
        notes: sanitizedNotes,
        conversations: sanitizedConversations,
        messages: sanitizedMessages,
      },
    },
  };
}
