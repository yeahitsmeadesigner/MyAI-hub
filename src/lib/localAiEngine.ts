import type { LocalModelStatus, NoteCitation, NoteItem, TaskItem, ToolActionProposal } from '../types';
import { processOfflineCommand, searchStoredNotes } from './offlineAssistant';

interface BrowserLanguageModelSession {
  prompt: (input: string, options?: { signal?: AbortSignal }) => Promise<string>;
  destroy?: () => void;
}

interface BrowserLanguageModelFactory {
  capabilities?: () => Promise<{ available: 'readily' | 'after-download' | 'no' }>;
  availability?: () => Promise<'readily' | 'after-download' | 'unavailable' | 'no'>;
  create: (options?: { systemPrompt?: string; signal?: AbortSignal }) => Promise<BrowserLanguageModelSession>;
}

function getBrowserLanguageModelFactory(): BrowserLanguageModelFactory | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    ai?: { languageModel?: BrowserLanguageModelFactory };
    LanguageModel?: BrowserLanguageModelFactory;
  };
  if (win.LanguageModel && typeof win.LanguageModel.create === 'function') {
    return win.LanguageModel;
  }
  if (win.ai?.languageModel && typeof win.ai.languageModel.create === 'function') {
    return win.ai.languageModel;
  }
  return null;
}

/**
 * Inspects the browser runtime honestly for on-device AI and WebGPU availability.
 * Never claims a local model is ready unless the browser genuinely exposes an active runtime.
 */
export async function checkLocalModelStatus(): Promise<LocalModelStatus> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      supported: false,
      provider: 'none',
      availability: 'unsupported',
      hasWebGPU: false,
      gpuAdapterName: null,
      deviceMemoryGB: null,
      estimatedDownloadSize: '1.5 GB – 2.2 GB (4-bit quantized weights)',
      minimumMemoryRequired: '4 GB VRAM / 8 GB Unified System RAM',
      reason: 'Browser window environment is not available.',
    };
  }

  const nav = navigator as Navigator & {
    deviceMemory?: number;
    gpu?: {
      requestAdapter: () => Promise<{
        info?: { vendor?: string; architecture?: string; description?: string };
      } | null>;
    };
  };

  const deviceMemoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  let hasWebGPU = false;
  let gpuAdapterName: string | null = null;

  if (nav.gpu && typeof nav.gpu.requestAdapter === 'function') {
    try {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) {
        hasWebGPU = true;
        const info = adapter.info;
        gpuAdapterName =
          info?.description ||
          [info?.vendor, info?.architecture].filter(Boolean).join(' ') ||
          'WebGPU Compatible Adapter';
      }
    } catch {
      hasWebGPU = false;
    }
  }

  const factory = getBrowserLanguageModelFactory();
  if (factory) {
    try {
      let avail: 'readily' | 'after-download' | 'no' = 'no';
      if (typeof factory.availability === 'function') {
        const res = await factory.availability();
        avail = res === 'unavailable' ? 'no' : res;
      } else if (typeof factory.capabilities === 'function') {
        const caps = await factory.capabilities();
        avail = caps.available;
      }

      if (avail === 'readily' || avail === 'after-download') {
        return {
          supported: true,
          provider: 'chrome-prompt-api',
          availability: avail,
          hasWebGPU,
          gpuAdapterName,
          deviceMemoryGB,
          estimatedDownloadSize: '1.5 GB – 2.2 GB (Gemini Nano / on-device weights)',
          minimumMemoryRequired: '4 GB VRAM / 8 GB System RAM',
          reason:
            avail === 'readily'
              ? 'Browser built-in on-device language model is ready.'
              : 'Browser supports on-device AI, but model weights require downloading first.',
        };
      }
    } catch {
      // Fall through to honest unavailability explanation
    }
  }

  return {
    supported: false,
    provider: hasWebGPU ? 'webgpu-only' : 'none',
    availability: 'unsupported',
    hasWebGPU,
    gpuAdapterName,
    deviceMemoryGB,
    estimatedDownloadSize: '1.5 GB – 2.2 GB (4-bit quantized weights)',
    minimumMemoryRequired: '4 GB VRAM / 8 GB System RAM',
    reason: hasWebGPU
      ? 'WebGPU hardware acceleration is present, but no browser built-in LanguageModel runtime (window.ai / Prompt API) is enabled in this browser. Offline Command Assistant remains fully active.'
      : 'Neither WebGPU nor the browser built-in on-device LanguageModel API is supported in this browser environment.',
  };
}

/**
 * Runs a prompt against the genuinely available browser local model if supported,
 * or returns a transparent diagnostic fallback coupled with the Offline Command Engine.
 */
export async function runLocalModelPrompt(
  prompt: string,
  context: {
    tasks: TaskItem[];
    notes: NoteItem[];
    dailyFocus?: string;
  },
  signal?: AbortSignal
): Promise<{
  reply: string;
  citations: NoteCitation[];
  toolProposals: ToolActionProposal[];
  usedFallbackCommandEngine: boolean;
}> {
  // Always check if it matches a structured local command first so tool actions work reliably
  const offlineCheck = processOfflineCommand(prompt, context);
  if (offlineCheck.matchedCommand !== 'fallback') {
    return {
      reply: offlineCheck.reply,
      citations: offlineCheck.citations,
      toolProposals: offlineCheck.toolProposals,
      usedFallbackCommandEngine: true,
    };
  }

  const factory = getBrowserLanguageModelFactory();
  if (!factory) {
    const status = await checkLocalModelStatus();
    return {
      reply: [
        '### Local On-Device Model Unavailable in Current Browser',
        status.reason,
        '',
        '**Hardware & Runtime Diagnostics:**',
        `- **WebGPU Support:** ${status.hasWebGPU ? `Detected (${status.gpuAdapterName})` : 'Not detected'}`,
        `- **Reported Device Memory:** ${status.deviceMemoryGB ? `~${status.deviceMemoryGB} GB` : 'Not disclosed by browser'}`,
        `- **Requirements:** ${status.minimumMemoryRequired} and a browser with the built-in Prompt API (\`window.ai.languageModel\`) enabled, or switch to **Offline Command Mode** / **Optional Cloud Mode** in Settings.`,
      ].join('\n'),
      citations: [],
      toolProposals: [],
      usedFallbackCommandEngine: true,
    };
  }

  const citations = searchStoredNotes(context.notes, prompt);
  const openTasks = context.tasks
    .filter((t) => !t.completed)
    .slice(0, 8)
    .map((t) => `- ${t.title} (${t.priority}, due ${t.dueDate || 'unscheduled'})`)
    .join('\n');
  const noteContext = citations
    .map((c) => `Note "${c.title}": ${c.excerpt}`)
    .join('\n');

  const systemPrompt = [
    'You are MyAI Hub running locally on the user device.',
    'Be concise, helpful, and accurate. Never invent notes or tasks.',
    openTasks ? `User Open Tasks:\n${openTasks}` : 'User has no open tasks.',
    noteContext ? `Matching User Notes:\n${noteContext}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const session = await factory.create({ systemPrompt, signal });
  try {
    const output = await session.prompt(prompt, { signal });
    return {
      reply: output.trim(),
      citations,
      toolProposals: [],
      usedFallbackCommandEngine: false,
    };
  } finally {
    if (typeof session.destroy === 'function') {
      session.destroy();
    }
  }
}
