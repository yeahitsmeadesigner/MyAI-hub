import type {
  CloudServerStatus,
  NoteCitation,
  NoteItem,
  TaskItem,
  ToolActionProposal,
} from '../types';
import { searchStoredNotes } from './offlineAssistant';

export async function checkCloudServerStatus(): Promise<CloudServerStatus> {
  try {
    const res = await fetch('/api/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      return {
        checked: true,
        available: false,
        model: 'gemini-3.8-flash',
        message: `Server returned status ${res.status}.`,
      };
    }
    const data = (await res.json()) as {
      configured?: boolean;
      model?: string;
      message?: string;
    };
    return {
      checked: true,
      available: Boolean(data.configured),
      model: data.model || 'gemini-3.8-flash',
      message: data.message || (data.configured ? 'Server-side Gemini API is configured.' : 'Server API key not configured.'),
    };
  } catch {
    return {
      checked: true,
      available: false,
      model: 'gemini-3.8-flash',
      message: 'Offline or backend server unreachable.',
    };
  }
}

export async function sendCloudChatRequest(params: {
  prompt: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  includeContext: boolean;
  tasks: TaskItem[];
  notes: NoteItem[];
  dailyFocus?: string;
  signal?: AbortSignal;
}): Promise<{
  reply: string;
  citations: NoteCitation[];
  toolProposals: ToolActionProposal[];
}> {
  const citations = params.includeContext ? searchStoredNotes(params.notes, params.prompt) : [];

  const contextPayload = params.includeContext
    ? {
        dailyFocus: params.dailyFocus || '',
        tasks: params.tasks.slice(0, 15).map((t) => ({
          id: t.id,
          title: t.title,
          priority: t.priority,
          category: t.category,
          dueDate: t.dueDate,
          completed: t.completed,
        })),
        matchingNotes: citations.map((c) => ({
          title: c.title,
          excerpt: c.excerpt,
        })),
      }
    : undefined;

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt,
      history: params.history.slice(-8),
      context: contextPayload,
    }),
    signal: params.signal,
  });

  const data = (await response.json()) as {
    error?: string;
    reply?: string;
    toolProposals?: ToolActionProposal[];
  };

  if (!response.ok || data.error) {
    throw new Error(data.error || `Cloud AI request failed (HTTP ${response.status}).`);
  }

  return {
    reply: data.reply || 'No response generated.',
    citations,
    toolProposals: Array.isArray(data.toolProposals) ? data.toolProposals : [],
  };
}

export async function sendCloudNoteAssistRequest(params: {
  action: 'summarize' | 'suggest_title' | 'extract_tasks';
  title: string;
  content: string;
  signal?: AbortSignal;
}): Promise<{
  summary?: string;
  suggestedTitle?: string;
  extractedTasks?: { title: string; priority: 'low' | 'medium' | 'high'; category: string }[];
}> {
  const response = await fetch('/api/ai/note-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: params.action,
      title: params.title,
      content: params.content,
    }),
    signal: params.signal,
  });

  const data = (await response.json()) as {
    error?: string;
    summary?: string;
    suggestedTitle?: string;
    extractedTasks?: { title: string; priority: 'low' | 'medium' | 'high'; category: string }[];
  };

  if (!response.ok || data.error) {
    throw new Error(data.error || `Note AI assist failed (HTTP ${response.status}).`);
  }

  return data;
}
