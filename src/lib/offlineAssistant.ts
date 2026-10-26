import type {
  NoteCitation,
  NoteItem,
  TaskItem,
  TaskPriority,
  ToolActionProposal,
} from '../types';
import { isTaskDueToday, isTaskOverdue } from './validation';

export interface OfflineAssistantResult {
  reply: string;
  citations: NoteCitation[];
  toolProposals: ToolActionProposal[];
  matchedCommand:
    | 'help'
    | 'add_task'
    | 'list_tasks'
    | 'complete_task'
    | 'note'
    | 'search_notes'
    | 'summarize'
    | 'extract_tasks'
    | 'plan_day'
    | 'fallback';
}

function makeId(prefix = 'act'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Search stored notes strictly by query tokens and return matching notes with citations.
 * Never invents or hallucinates search results.
 */
export function searchStoredNotes(notes: NoteItem[], rawQuery: string): NoteCitation[] {
  const cleaned = rawQuery
    .replace(/[?.,!;:"]/g, ' ')
    .trim()
    .toLowerCase();
  if (!cleaned) return [];

  const stopWords = new Set(['the', 'and', 'for', 'about', 'with', 'from', 'that', 'this', 'notes', 'note', 'find', 'my']);
  const tokens = cleaned
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !stopWords.has(t));

  const searchTerms = tokens.length > 0 ? tokens : [cleaned];

  const scored: { note: NoteItem; score: number; excerpt: string }[] = [];

  for (const note of notes) {
    const titleLower = note.title.toLowerCase();
    const contentLower = note.content.toLowerCase();
    const tagsLower = note.tags.map((t) => t.toLowerCase());

    let score = 0;
    let firstMatchIndex = -1;

    if (titleLower.includes(cleaned)) score += 10;
    if (contentLower.includes(cleaned)) {
      score += 6;
      firstMatchIndex = contentLower.indexOf(cleaned);
    }

    for (const term of searchTerms) {
      if (titleLower.includes(term)) score += 5;
      if (tagsLower.some((tag) => tag.includes(term))) score += 4;
      const idx = contentLower.indexOf(term);
      if (idx !== -1) {
        score += 2;
        if (firstMatchIndex === -1) firstMatchIndex = idx;
      }
    }

    if (score > 0) {
      let excerpt = '';
      const plainContent = note.content.replace(/[#*`>_~-]/g, '').replace(/\s+/g, ' ').trim();
      if (firstMatchIndex !== -1 && plainContent.length > 140) {
        const start = Math.max(0, firstMatchIndex - 30);
        const slice = plainContent.slice(start, start + 140).trim();
        excerpt = `${start > 0 ? '...' : ''}${slice}${start + 140 < plainContent.length ? '...' : ''}`;
      } else {
        excerpt = plainContent.slice(0, 140) + (plainContent.length > 140 ? '...' : '');
      }
      scored.push({ note, score, excerpt: excerpt || '(Empty note body)' });
    }
  }

  scored.sort((a, b) => b.score - a.score || b.note.updatedAt.localeCompare(a.note.updatedAt));

  return scored.slice(0, 5).map((item) => ({
    noteId: item.note.id,
    title: item.note.title,
    excerpt: item.excerpt,
  }));
}

/**
 * Deterministic extractive text summarizer for offline mode & Smart Notes.
 */
export function summarizeTextOffline(text: string, maxSentences = 3): {
  summary: string;
  bulletPoints: string[];
  originalWordCount: number;
} {
  const cleaned = text.replace(/\r\n/g, '\n').trim();
  const words = cleaned ? cleaned.split(/\s+/) : [];
  const originalWordCount = words.length;

  if (!cleaned) {
    return {
      summary: 'No text provided to summarize.',
      bulletPoints: [],
      originalWordCount: 0,
    };
  }

  // Split by sentences or markdown lines
  const rawSegments = cleaned
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[-*•#\d.)+\s]+/, '').trim())
    .filter((s) => s.length > 12);

  if (rawSegments.length === 0) {
    return {
      summary: cleaned.slice(0, 240),
      bulletPoints: [cleaned.slice(0, 240)],
      originalWordCount,
    };
  }

  // Word frequency scoring
  const stopWords = new Set([
    'the', 'and', 'to', 'of', 'in', 'is', 'for', 'that', 'with', 'on', 'as', 'are', 'this', 'by', 'be', 'at', 'or', 'from', 'an', 'it', 'we', 'can', 'will',
  ]);
  const freq: Record<string, number> = {};
  for (const w of words) {
    const norm = w.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (norm.length > 2 && !stopWords.has(norm)) {
      freq[norm] = (freq[norm] || 0) + 1;
    }
  }

  const scored = rawSegments.map((seg, idx) => {
    const segWords = seg.toLowerCase().split(/\s+/);
    let score = idx === 0 ? 3 : 0; // Lead sentence bonus
    for (const sw of segWords) {
      const norm = sw.replace(/[^a-z0-9]/g, '');
      if (freq[norm]) score += freq[norm];
    }
    return { seg, idx, score: score / Math.max(4, segWords.length) };
  });

  const topSegments = [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.idx - b.idx)
    .map((s) => s.seg);

  return {
    summary: topSegments.join(' '),
    bulletPoints: topSegments,
    originalWordCount,
  };
}

/**
 * Deterministic title suggestion for a note body.
 */
export function suggestNoteTitleOffline(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.replace(/^[#\-*>\s]+/, '').trim())
    .filter(Boolean);

  if (lines.length === 0) return 'Untitled Note';
  const firstLine = lines[0];
  const firstSentence = firstLine.split(/[.!?]/)[0].trim();
  if (firstSentence.length <= 56) return firstSentence;
  return firstSentence.slice(0, 53).trim() + '...';
}

/**
 * Extracts actionable items from note content or freeform text.
 */
export function extractActionItemsOffline(text: string): {
  title: string;
  priority: TaskPriority;
  category: string;
}[] {
  const lines = text
    .split(/\r?\n|;|\.(?=\s+[A-Z])/)
    .map((l) => l.trim())
    .filter(Boolean);

  const actionVerbs = /^(review|prepare|send|call|email|schedule|fix|update|write|build|test|deploy|buy|check|complete|finish|draft|create|submit|organize|plan|follow up|research|audit|sync)\b/i;

  const extracted: { title: string; priority: TaskPriority; category: string }[] = [];

  for (const rawLine of lines) {
    const isCheckbox = /^[-*]\s*\[\s*\]\s+/.test(rawLine);
    const isTodoPrefix = /^(todo|action|task|next):\s*/i.test(rawLine);
    const cleaned = rawLine
      .replace(/^[-*•\d.)]+\s*(\[\s*\]\s*)?/, '')
      .replace(/^(todo|action|task|next):\s*/i, '')
      .trim();

    if (!cleaned || cleaned.length < 3 || cleaned.length > 160) continue;

    if (isCheckbox || isTodoPrefix || actionVerbs.test(cleaned) || lines.length <= 6) {
      let priority: TaskPriority = 'medium';
      if (/\b(urgent|asap|critical|high|important|today)\b/i.test(cleaned)) {
        priority = 'high';
      } else if (/\b(later|someday|low|optional)\b/i.test(cleaned)) {
        priority = 'low';
      }
      extracted.push({
        title: cleaned.replace(/\s*!(high|medium|low)\b/i, '').trim(),
        priority,
        category: 'Extracted',
      });
    }
  }

  return extracted.slice(0, 8);
}

function parseTaskMetadataFromCommand(rawTitle: string, now: Date): {
  title: string;
  priority: TaskPriority;
  category: string;
  dueDate: string | null;
} {
  let text = rawTitle.trim();
  let priority: TaskPriority = 'medium';
  let category = 'Personal';
  let dueDate: string | null = null;

  if (/(?:^|\s)!high\b|\b(urgent|high priority)\b/i.test(text)) {
    priority = 'high';
    text = text.replace(/(?:^|\s)!high\b/gi, ' ').trim();
  } else if (/(?:^|\s)!low\b|\b(low priority)\b/i.test(text)) {
    priority = 'low';
    text = text.replace(/(?:^|\s)!low\b/gi, ' ').trim();
  }

  const catMatch = text.match(/#([a-zA-Z0-9_-]+)/);
  if (catMatch) {
    category = catMatch[1].charAt(0).toUpperCase() + catMatch[1].slice(1);
    text = text.replace(catMatch[0], '').trim();
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  if (/\b(due\s+)?today\b/i.test(text)) {
    dueDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    text = text.replace(/\b(due\s+)?today\b/gi, '').trim();
  } else if (/\b(due\s+)?tomorrow\b/i.test(text)) {
    const tmr = new Date(now.getTime());
    tmr.setDate(tmr.getDate() + 1);
    dueDate = `${tmr.getFullYear()}-${pad(tmr.getMonth() + 1)}-${pad(tmr.getDate())}`;
    text = text.replace(/\b(due\s+)?tomorrow\b/gi, '').trim();
  }

  return {
    title: text || rawTitle.trim(),
    priority,
    category,
    dueDate,
  };
}

/**
 * Executes the offline deterministic command assistant.
 */
export function processOfflineCommand(
  input: string,
  context: {
    tasks: TaskItem[];
    notes: NoteItem[];
    dailyFocus?: string;
    now?: Date;
  }
): OfflineAssistantResult {
  const trimmed = input.trim();
  const lower = trimmed.toLowerCase();
  const now = context.now ?? new Date();

  // 1. HELP
  if (lower === 'help' || lower === '/help' || lower === 'commands' || lower === 'what can you do?') {
    return {
      matchedCommand: 'help',
      citations: [],
      toolProposals: [],
      reply: [
        '### Offline Command Assistant',
        'I operate 100% locally on your device without an internet connection. You can run these structured commands anytime:',
        '',
        '- **`help`** — Show available offline commands and syntax.',
        '- **`add task [title]`** — Propose or create a task (supports `#Category`, `!high`, `today`, `tomorrow`).',
        '- **`list tasks`** — View pending, today, and overdue tasks.',
        '- **`complete task [task reference]`** — Mark a matching task as completed.',
        '- **`note [content]`** — Save a new smart note to IndexedDB.',
        '- **`search notes [query]`** — Search your local notes with exact citations.',
        '- **`summarize [text]`** — Run deterministic key-sentence extraction on a passage.',
        '- **`turn this into tasks: [text]`** — Extract action items into structured tasks.',
        '- **`plan my day`** — Build a prioritized daily schedule from your real tasks and daily focus.',
      ].join('\n'),
    };
  }

  // 2. ADD TASK [title]
  const addTaskMatch = trimmed.match(/^(?:add\s+task|create\s+task|new\s+task|todo)\s*[:\-]?\s+(.+)$/i);
  if (addTaskMatch) {
    const rawTaskText = addTaskMatch[1].trim();
    const parsed = parseTaskMetadataFromCommand(rawTaskText, now);
    const proposal: ToolActionProposal = {
      id: makeId('task_prop'),
      type: 'create_task',
      status: 'pending',
      summary: `Create task "${parsed.title}" (${parsed.priority} priority, ${parsed.category}${
        parsed.dueDate ? `, due ${parsed.dueDate}` : ''
      })`,
      payload: {
        title: parsed.title,
        description: '',
        priority: parsed.priority,
        category: parsed.category,
        dueDate: parsed.dueDate,
      },
    };
    return {
      matchedCommand: 'add_task',
      citations: [],
      toolProposals: [proposal],
      reply: `I prepared a new task: **${parsed.title}** (${parsed.priority} priority · ${parsed.category}${
        parsed.dueDate ? ` · Due ${parsed.dueDate}` : ''
      }). Confirm below to save it to your task list.`,
    };
  }

  // 3. LIST TASKS
  if (/^(?:list\s+tasks|show\s+tasks|my\s+tasks|tasks)$/i.test(lower)) {
    const pending = context.tasks.filter((t) => !t.completed);
    const overdue = pending.filter((t) => isTaskOverdue(t, now));
    const dueToday = pending.filter((t) => isTaskDueToday(t, now) && !isTaskOverdue(t, now));

    if (pending.length === 0) {
      return {
        matchedCommand: 'list_tasks',
        citations: [],
        toolProposals: [],
        reply: 'You have **0 pending tasks** right now. Use `add task [title]` to create one.',
      };
    }

    const lines: string[] = [
      `### Active Tasks (${pending.length} pending · ${overdue.length} overdue · ${dueToday.length} due today)`,
      '',
    ];

    const sorted = [...pending].sort((a, b) => {
      const pWeight = { high: 0, medium: 1, low: 2 };
      return pWeight[a.priority] - pWeight[b.priority];
    });

    sorted.slice(0, 10).forEach((t, idx) => {
      const statusTag = isTaskOverdue(t, now)
        ? 'Overdue'
        : isTaskDueToday(t, now)
        ? 'Due Today'
        : t.dueDate
        ? `Due ${t.dueDate}`
        : 'No due date';
      lines.push(`${idx + 1}. **${t.title}** — ${t.priority} priority · ${t.category} · ${statusTag}`);
    });

    if (pending.length > 10) {
      lines.push('', `*...and ${pending.length - 10} more tasks in the Tasks view.*`);
    }

    return {
      matchedCommand: 'list_tasks',
      citations: [],
      toolProposals: [],
      reply: lines.join('\n'),
    };
  }

  // 4. COMPLETE TASK [reference]
  const completeMatch = trimmed.match(/^(?:complete\s+task|finish\s+task|done\s+task|check\s+task)\s*[:\-]?\s+(.+)$/i);
  if (completeMatch) {
    const ref = completeMatch[1].trim().toLowerCase();
    const pending = context.tasks.filter((t) => !t.completed);
    let matchedTask: TaskItem | undefined;

    const numericIdx = Number.parseInt(ref, 10);
    if (!Number.isNaN(numericIdx) && numericIdx >= 1 && numericIdx <= pending.length) {
      matchedTask = pending[numericIdx - 1];
    } else {
      matchedTask = pending.find((t) => t.title.toLowerCase().includes(ref));
    }

    if (!matchedTask) {
      return {
        matchedCommand: 'complete_task',
        citations: [],
        toolProposals: [],
        reply: `I could not find an open task matching **"${completeMatch[1].trim()}"**. Run \`list tasks\` to see your active task titles.`,
      };
    }

    const proposal: ToolActionProposal = {
      id: makeId('comp_prop'),
      type: 'complete_task',
      status: 'pending',
      summary: `Mark task "${matchedTask.title}" as completed`,
      payload: {
        taskId: matchedTask.id,
        title: matchedTask.title,
      },
    };

    return {
      matchedCommand: 'complete_task',
      citations: [],
      toolProposals: [proposal],
      reply: `Found matching open task: **${matchedTask.title}**. Confirm below to mark it as completed.`,
    };
  }

  // 5. NOTE [content]
  const noteMatch = trimmed.match(/^(?:note|add\s+note|create\s+note|save\s+note)\s*[:\-]?\s+([\s\S]+)$/i);
  if (noteMatch) {
    const content = noteMatch[1].trim();
    const title = suggestNoteTitleOffline(content);
    const tagMatches = Array.from(content.matchAll(/#([a-zA-Z0-9_-]+)/g)).map((m) =>
      m[1].toLowerCase()
    );
    const tags = tagMatches.length > 0 ? Array.from(new Set(tagMatches)) : ['quick-note'];

    const proposal: ToolActionProposal = {
      id: makeId('note_prop'),
      type: 'create_note',
      status: 'pending',
      summary: `Create note "${title}"`,
      payload: {
        title,
        content,
        tags,
      },
    };

    return {
      matchedCommand: 'note',
      citations: [],
      toolProposals: [proposal],
      reply: `I prepared a smart note titled **"${title}"**. Confirm below to store it in Smart Notes.`,
    };
  }

  // 6. SEARCH NOTES [query] or "Find my notes about ..."
  const searchMatch =
    trimmed.match(/^(?:search\s+notes|find\s+notes|find\s+my\s+notes\s+about|search\s+my\s+notes\s+for|notes\s+about)\s*[:\-]?\s+(.+)$/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    const citations = searchStoredNotes(context.notes, query);

    if (citations.length === 0) {
      return {
        matchedCommand: 'search_notes',
        citations: [],
        toolProposals: [],
        reply: `I searched your **${context.notes.length} stored notes** for **"${query}"**, but found no matching notes. No results were invented.`,
      };
    }

    const lines = [
      `### Note Search Results for "${query}"`,
      `Found **${citations.length}** matching ${citations.length === 1 ? 'note' : 'notes'} in your local database:`,
      '',
    ];
    for (const c of citations) {
      lines.push(`- **${c.title}**: "${c.excerpt}"`);
    }

    return {
      matchedCommand: 'search_notes',
      citations,
      toolProposals: [],
      reply: lines.join('\n'),
    };
  }

  // 7. SUMMARIZE [text]
  const summarizeMatch = trimmed.match(/^(?:summarize|summarize\s+this\s+text|tl;?dr)\s*[:\-]?\s*([\s\S]*)$/i);
  if (summarizeMatch) {
    const body = summarizeMatch[1].trim();
    if (!body) {
      return {
        matchedCommand: 'summarize',
        citations: [],
        toolProposals: [],
        reply:
          'Please provide the text you would like me to summarize after the command, for example:\n\n`summarize: Python 3.12 introduces improved error messages, f-string parsing enhancements, and per-interpreter GIL support for better concurrency.`',
      };
    }

    const result = summarizeTextOffline(body, 3);
    const lines = [
      `### Extractive Summary (${result.originalWordCount} words analyzed offline)`,
      '',
      ...result.bulletPoints.map((b) => `- ${b}`),
    ];
    return {
      matchedCommand: 'summarize',
      citations: [],
      toolProposals: [],
      reply: lines.join('\n'),
    };
  }

  // 8. TURN THIS INTO TASKS
  const extractMatch = trimmed.match(/^(?:turn\s+this\s+into\s+tasks|extract\s+tasks|create\s+tasks\s+from)\s*[:\-]?\s*([\s\S]*)$/i);
  if (extractMatch) {
    const body = extractMatch[1].trim();
    if (!body) {
      return {
        matchedCommand: 'extract_tasks',
        citations: [],
        toolProposals: [],
        reply:
          'Paste one or more lines or a paragraph after `Turn this into tasks:` and I will extract actionable tasks for your confirmation.\n\nExample:\n`Turn this into tasks: Review Q4 budget today !high; Email design specs to team; Schedule dentist appointment`',
      };
    }

    const items = extractActionItemsOffline(body);
    if (items.length === 0) {
      return {
        matchedCommand: 'extract_tasks',
        citations: [],
        toolProposals: [],
        reply: 'I could not identify distinct action items from that text. Try separating tasks with newlines or semicolons.',
      };
    }

    const proposals: ToolActionProposal[] = items.map((item) => ({
      id: makeId('ext_task'),
      type: 'create_task',
      status: 'pending',
      summary: `Create task "${item.title}" (${item.priority} priority)`,
      payload: {
        title: item.title,
        description: 'Extracted via AI Assistant',
        priority: item.priority,
        category: item.category,
        dueDate: null,
      },
    }));

    return {
      matchedCommand: 'extract_tasks',
      citations: [],
      toolProposals: proposals,
      reply: `I extracted **${proposals.length} actionable ${proposals.length === 1 ? 'task' : 'tasks'}** from your text. Review and confirm the ones you want to save below.`,
    };
  }

  // 9. PLAN MY DAY
  if (/^(?:plan\s+my\s+day|daily\s+plan|my\s+schedule|prioritize\s+my\s+day)/i.test(lower)) {
    const pending = context.tasks.filter((t) => !t.completed);
    const overdue = pending.filter((t) => isTaskOverdue(t, now));
    const todayTasks = pending.filter((t) => isTaskDueToday(t, now) && !isTaskOverdue(t, now));
    const highPriorityOther = pending.filter(
      (t) => t.priority === 'high' && !isTaskOverdue(t, now) && !isTaskDueToday(t, now)
    );
    const otherTasks = pending.filter(
      (t) => !isTaskOverdue(t, now) && !isTaskDueToday(t, now) && t.priority !== 'high'
    );

    const lines: string[] = ['### Your Actionable Daily Plan'];

    if (context.dailyFocus && context.dailyFocus.trim()) {
      lines.push('', `**Daily Primary Focus:** ${context.dailyFocus.trim()}`);
    }

    if (pending.length === 0) {
      lines.push(
        '',
        'You currently have **no open tasks** scheduled. Consider setting a Daily Focus on the Dashboard or adding 1–3 key priorities using `add task [title]`.'
      );
      return {
        matchedCommand: 'plan_day',
        citations: [],
        toolProposals: [],
        reply: lines.join('\n'),
      };
    }

    if (overdue.length > 0) {
      lines.push('', '#### 1. Resolve Overdue Items (Immediate Block)');
      overdue.forEach((t) => {
        lines.push(`- **${t.title}** (${t.priority} priority · Due ${t.dueDate})`);
      });
    }

    if (todayTasks.length > 0) {
      lines.push('', '#### 2. Scheduled for Today (Core Focus Block)');
      todayTasks.forEach((t) => {
        lines.push(`- **${t.title}** (${t.priority} priority · ${t.category})`);
      });
    }

    if (highPriorityOther.length > 0) {
      lines.push('', '#### 3. High-Priority Next Actions');
      highPriorityOther.slice(0, 4).forEach((t) => {
        lines.push(`- **${t.title}** (${t.category}${t.dueDate ? ` · Due ${t.dueDate}` : ''})`);
      });
    }

    if (overdue.length === 0 && todayTasks.length === 0 && highPriorityOther.length === 0 && otherTasks.length > 0) {
      lines.push('', '#### Recommended Tasks to Tackle Today');
      otherTasks.slice(0, 4).forEach((t) => {
        lines.push(`- **${t.title}** (${t.priority} priority · ${t.category})`);
      });
    }

    lines.push(
      '',
      `*Summary: ${overdue.length} overdue, ${todayTasks.length} due today, and ${pending.length} total open tasks in IndexedDB.*`
    );

    return {
      matchedCommand: 'plan_day',
      citations: [],
      toolProposals: [],
      reply: lines.join('\n'),
    };
  }

  // 10. Check if user is asking a question that matches stored notes
  const autoCitations = searchStoredNotes(context.notes, trimmed);
  if (autoCitations.length > 0 && (lower.includes('note') || lower.includes('what did i write') || lower.includes('python'))) {
    const lines = [
      `I found **${autoCitations.length}** relevant ${autoCitations.length === 1 ? 'note' : 'notes'} in your local storage:`,
      '',
      ...autoCitations.map((c) => `- **${c.title}**: "${c.excerpt}"`),
      '',
      '*Note: I am running in Offline Command Mode, so I only cite your stored notes without generative synthesis.*',
    ];
    return {
      matchedCommand: 'search_notes',
      citations: autoCitations,
      toolProposals: [],
      reply: lines.join('\n'),
    };
  }

  // 11. Honest Fallback when request exceeds deterministic offline capabilities
  return {
    matchedCommand: 'fallback',
    citations: [],
    toolProposals: [],
    reply: [
      '### Offline Command Mode Limitation',
      `Your request (*"${trimmed.slice(0, 80)}${trimmed.length > 80 ? '...' : ''}"*) requires open-ended generative reasoning, which exceeds the deterministic **Offline Command Assistant**.`,
      '',
      'Rather than guessing or hallucinating an answer, here is what you can do right now:',
      '1. **Use an Offline Command:** Type `help`, `plan my day`, `list tasks`, `add task [title]`, `note [content]`, `search notes [query]`, or `summarize [text]`.',
      '2. **Switch AI Mode in Settings:** Enable **Local Browser Model** (if your device browser supports WebGPU / built-in Prompt API) or **Optional Cloud Provider** (server-side Gemini API with explicit privacy consent).',
    ].join('\n'),
  };
}
