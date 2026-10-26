import Dexie, { type Table } from 'dexie';
import type { ChatConversation, ChatMessage, NoteItem, TaskItem } from '../types';

export class MyAIHubDatabase extends Dexie {
  tasks!: Table<TaskItem, string>;
  notes!: Table<NoteItem, string>;
  conversations!: Table<ChatConversation, string>;
  messages!: Table<ChatMessage, string>;

  constructor() {
    super('MyAIHubDB');
    this.version(1).stores({
      tasks: 'id, priority, category, dueDate, completed, updatedAt',
      notes: 'id, pinned, updatedAt, *tags',
      conversations: 'id, updatedAt',
      messages: 'id, conversationId, createdAt',
    });
  }
}

export const db = new MyAIHubDatabase();

const SEED_FLAG_KEY = 'myai_hub_seeded_v1';

function formatLocalDate(offsetDays = 0, timeStr?: string): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return timeStr ? `${datePart}T${timeStr}` : datePart;
}

export async function ensureInitialDataSeeded(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(SEED_FLAG_KEY) === 'true') return;

  const existingTaskCount = await db.tasks.count();
  const existingNoteCount = await db.notes.count();
  if (existingTaskCount > 0 || existingNoteCount > 0) {
    localStorage.setItem(SEED_FLAG_KEY, 'true');
    return;
  }

  const nowIso = new Date().toISOString();

  const starterTasks: TaskItem[] = [
    {
      id: 'task_seed_1',
      title: 'Review quarterly product roadmap & key milestones',
      description: 'Verify Q4 engineering deliverables and confirm mobile PWA readiness.',
      priority: 'high',
      category: 'Work',
      dueDate: formatLocalDate(0, '16:00'),
      reminderAt: formatLocalDate(0, '15:45'),
      reminderFired: false,
      recurrence: 'none',
      completed: false,
      completedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'task_seed_2',
      title: 'Audit local IndexedDB backup export before weekly sync',
      description: 'Export a versioned JSON snapshot from Settings to local storage.',
      priority: 'medium',
      category: 'System',
      dueDate: formatLocalDate(-1, '18:00'),
      reminderAt: null,
      reminderFired: false,
      recurrence: 'weekly',
      completed: false,
      completedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'task_seed_3',
      title: 'Prepare Python data pipeline benchmark notes',
      description: 'Compare asyncio task groups and SQLite WAL concurrency settings.',
      priority: 'medium',
      category: 'Research',
      dueDate: formatLocalDate(1, '11:00'),
      reminderAt: formatLocalDate(1, '10:30'),
      reminderFired: false,
      recurrence: 'none',
      completed: false,
      completedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'task_seed_4',
      title: 'Configure personal privacy and theme preferences',
      description: 'Verify offline-first AI assistant mode and dark/light theme preference.',
      priority: 'low',
      category: 'Personal',
      dueDate: formatLocalDate(0),
      reminderAt: null,
      reminderFired: false,
      recurrence: 'none',
      completed: true,
      completedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const starterNotes: NoteItem[] = [
    {
      id: 'note_seed_python',
      title: 'Python Asyncio & Concurrency Patterns',
      content: [
        '# Python Concurrency Notes',
        '',
        'When building local data pipelines in **Python 3.12+**, prefer structured concurrency using `asyncio.TaskGroup` over gather calls so unhandled exceptions cancel sibling tasks cleanly.',
        '',
        '## Key Recommendations',
        '- Use `uv` or standard virtual environments for deterministic dependency locking.',
        '- Enable SQLite `PRAGMA journal_mode=WAL;` when reading and writing from concurrent worker threads.',
        '- Profile CPU-bound workloads before reaching for multiprocessing.',
        '',
        '## Action Items',
        '- [ ] Benchmark Python `TaskGroup` throughput on 10k local records',
        '- [ ] Document retry backoff decorator for network workers',
      ].join('\n'),
      tags: ['python', 'engineering', 'architecture'],
      pinned: true,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'note_seed_privacy',
      title: 'MyAI Hub Privacy & Offline Architecture',
      content: [
        '# Local-First Command Center Guide',
        '',
        'MyAI Hub stores your tasks, reminders, smart notes, and conversation history locally in **IndexedDB** via Dexie.',
        '',
        '## AI Operating Modes',
        '1. **Offline Command Mode (Default):** Works 100% offline with zero network calls. Supports `plan my day`, `add task`, `list tasks`, `complete task`, `note`, `search notes`, and `summarize`.',
        '2. **Local Browser Model Mode:** Uses on-device browser AI (`window.ai` / WebGPU) when supported by your device and browser runtime.',
        '3. **Optional Cloud Mode:** Connects to a server-side Gemini API route only when explicitly enabled and confirmed by you.',
      ].join('\n'),
      tags: ['privacy', 'guide', 'local-first'],
      pinned: false,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const defaultConvId = 'conv_welcome_1';
  const starterConversation: ChatConversation = {
    id: defaultConvId,
    title: 'Daily Command Session',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const starterMessages: ChatMessage[] = [
    {
      id: 'msg_welcome_1',
      conversationId: defaultConvId,
      role: 'assistant',
      content: [
        'Welcome to **MyAI Hub**. I am running in **Offline Command Mode** by default—your notes, tasks, and chats stay in your browser’s IndexedDB and are never sent to the cloud unless you explicitly switch modes.',
        '',
        'Try clicking a quick prompt below or typing:',
        '- `Plan my day`',
        '- `Find my notes about Python`',
        '- `add task Prepare weekly sprint review tomorrow !high #Work`',
        '- `help`',
      ].join('\n'),
      modeUsed: 'offline',
      createdAt: nowIso,
    },
  ];

  await db.transaction('rw', db.tasks, db.notes, db.conversations, db.messages, async () => {
    await db.tasks.bulkPut(starterTasks);
    await db.notes.bulkPut(starterNotes);
    await db.conversations.put(starterConversation);
    await db.messages.bulkPut(starterMessages);
  });

  localStorage.setItem(SEED_FLAG_KEY, 'true');
}
