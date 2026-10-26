export type ThemeMode = 'system' | 'light' | 'dark';

export type AIMode = 'offline' | 'local' | 'cloud';

export type TaskPriority = 'low' | 'medium' | 'high';

export type TaskRecurrence = 'none' | 'daily' | 'weekly' | 'monthly';

export type NavTab = 'dashboard' | 'assistant' | 'tasks' | 'notes' | 'settings';

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  category: string;
  dueDate: string | null; // ISO date or datetime string (YYYY-MM-DD or YYYY-MM-DDTHH:mm)
  reminderAt: string | null; // ISO datetime string
  reminderFired?: boolean;
  recurrence: TaskRecurrence;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ToolActionProposal {
  id: string;
  type: 'create_task' | 'complete_task' | 'create_note';
  status: 'pending' | 'applied' | 'dismissed';
  summary: string;
  payload: {
    title?: string;
    description?: string;
    priority?: TaskPriority;
    category?: string;
    dueDate?: string | null;
    taskId?: string;
    content?: string;
    tags?: string[];
  };
}

export interface NoteCitation {
  noteId: string;
  title: string;
  excerpt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  modeUsed: AIMode;
  createdAt: string;
  isError?: boolean;
  citations?: NoteCitation[];
  toolProposals?: ToolActionProposal[];
}

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  theme: ThemeMode;
  aiMode: AIMode;
  cloudConsentGiven: boolean;
  includeContextInCloud: boolean;
  notificationsEnabled: boolean;
  dailyFocus: string;
  dailyFocusDate: string;
  autoApplySafeOfflineCommands: boolean;
}

export interface LocalModelStatus {
  supported: boolean;
  provider: 'chrome-prompt-api' | 'webgpu-only' | 'none';
  availability: 'readily' | 'after-download' | 'no' | 'unsupported';
  hasWebGPU: boolean;
  gpuAdapterName: string | null;
  deviceMemoryGB: number | null;
  estimatedDownloadSize: string;
  minimumMemoryRequired: string;
  reason: string;
}

export interface CloudServerStatus {
  checked: boolean;
  available: boolean;
  model: string;
  message: string;
}

export interface BackupDataV1 {
  app: 'MyAI Hub';
  schemaVersion: 1;
  exportedAt: string;
  settings?: Partial<AppSettings>;
  data: {
    tasks: TaskItem[];
    notes: NoteItem[];
    conversations: ChatConversation[];
    messages: ChatMessage[];
  };
}
