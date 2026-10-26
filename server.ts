import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX_PER_MINUTE) || 30;
const MODEL_NAME = 'gemini-3.8-flash';

// Simple in-memory IP rate limiter for /api/ai/* routes
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket.remoteAddress || 'local';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > 60_000) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    next();
    return;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    res.status(429).json({
      error: `Rate limit exceeded (${RATE_LIMIT_MAX} requests/minute). Please wait a moment or use Offline Command Mode.`,
    });
    return;
  }

  entry.count += 1;
  next();
}

function getGenAIClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'MY_GEMINI_API_KEY' || !key.trim()) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '256kb' }));

  // 1. Health & Cloud AI configuration check (Never exposes the API key)
  app.get('/api/health', (_req: Request, res: Response) => {
    const client = getGenAIClient();
    res.json({
      ok: true,
      configured: Boolean(client),
      model: MODEL_NAME,
      message: client
        ? 'Server-side Gemini API is configured and ready.'
        : 'Server GEMINI_API_KEY is not configured. Offline Command Mode remains available.',
    });
  });

  // 2. Optional Cloud AI Chat Route with Structured Tool Proposals
  app.post('/api/ai/chat', rateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { prompt, history, context } = req.body as {
        prompt?: unknown;
        history?: unknown;
        context?: unknown;
      };

      if (typeof prompt !== 'string' || !prompt.trim()) {
        res.status(400).json({ error: 'Prompt must be a non-empty string.' });
        return;
      }
      if (prompt.length > 8000) {
        res.status(400).json({ error: 'Prompt exceeds maximum length of 8,000 characters.' });
        return;
      }

      const ai = getGenAIClient();
      if (!ai) {
        res.status(503).json({
          error:
            'Cloud AI is not configured on the server (GEMINI_API_KEY missing). Switch to Offline Command Mode in Settings.',
        });
        return;
      }

      const contextBlock = context
        ? `\nUser Workspace Context (from local IndexedDB):\n${JSON.stringify(context, null, 2)}`
        : '\n(User chose not to attach local workspace context.)';

      const historyText = Array.isArray(history)
        ? history
            .slice(-6)
            .map((h: { role?: string; content?: string }) => `${h.role || 'user'}: ${String(h.content || '').slice(0, 600)}`)
            .join('\n')
        : '';

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `${historyText ? `Recent History:\n${historyText}\n\n` : ''}User Request: ${prompt}${contextBlock}`,
        config: {
          systemInstruction: [
            'You are the MyAI Hub personal command center assistant.',
            'Provide clear, helpful Markdown responses. Never invent notes that are not in the provided context.',
            'If the user asks to create a task, complete a task, or save a note, populate toolProposals so the user can confirm and save them locally.',
          ].join(' '),
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              reply: {
                type: Type.STRING,
                description: 'Markdown response to display to the user.',
              },
              toolProposals: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    type: {
                      type: Type.STRING,
                      description: 'One of: create_task, complete_task, create_note',
                    },
                    summary: {
                      type: Type.STRING,
                      description: 'Human-readable description of the proposed action.',
                    },
                    title: {
                      type: Type.STRING,
                      description: 'Title of the task or note.',
                    },
                    description: {
                      type: Type.STRING,
                      description: 'Task description or note content.',
                    },
                    priority: {
                      type: Type.STRING,
                      description: 'low, medium, or high',
                    },
                    category: {
                      type: Type.STRING,
                      description: 'Task category name',
                    },
                    dueDate: {
                      type: Type.STRING,
                      description: 'Optional ISO date YYYY-MM-DD',
                    },
                  },
                  required: ['type', 'summary', 'title'],
                },
              },
            },
            required: ['reply'],
          },
        },
      });

      const rawText = response.text || '{}';
      let parsed: {
        reply?: string;
        toolProposals?: Array<{
          type: string;
          summary: string;
          title: string;
          description?: string;
          priority?: string;
          category?: string;
          dueDate?: string;
        }>;
      } = {};

      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { reply: rawText };
      }

      const formattedProposals = (parsed.toolProposals || [])
        .filter((p) => ['create_task', 'complete_task', 'create_note'].includes(p.type))
        .map((p, idx) => ({
          id: `cloud_prop_${Date.now()}_${idx}`,
          type: p.type,
          status: 'pending',
          summary: p.summary || `Create ${p.title}`,
          payload: {
            title: p.title,
            description: p.description || '',
            content: p.description || '',
            priority:
              p.priority === 'high' || p.priority === 'low' || p.priority === 'medium'
                ? p.priority
                : 'medium',
            category: p.category || 'Personal',
            dueDate: p.dueDate || null,
            tags: ['cloud-ai'],
          },
        }));

      res.json({
        reply: parsed.reply || 'Done.',
        toolProposals: formattedProposals,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unexpected server error';
      res.status(500).json({ error: `Cloud AI error: ${msg}` });
    }
  });

  // 3. Optional Cloud AI Smart Note Assist Route
  app.post('/api/ai/note-assist', rateLimitMiddleware, async (req: Request, res: Response) => {
    try {
      const { action, title, content } = req.body as {
        action?: string;
        title?: string;
        content?: string;
      };

      if (!content || typeof content !== 'string' || !content.trim()) {
        res.status(400).json({ error: 'Note content is required.' });
        return;
      }

      const ai = getGenAIClient();
      if (!ai) {
        res.status(503).json({
          error: 'Server GEMINI_API_KEY is not configured.',
        });
        return;
      }

      const safeContent = content.slice(0, 12000);

      if (action === 'summarize') {
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Summarize the following note titled "${title || 'Untitled'}" into 3 concise bullet points:\n\n${safeContent}`,
        });
        res.json({ summary: response.text || '' });
        return;
      }

      if (action === 'suggest_title') {
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Suggest a concise, descriptive title (under 8 words, plain text without quotes) for this note:\n\n${safeContent}`,
        });
        res.json({ suggestedTitle: (response.text || 'Untitled Note').trim().replace(/^["']|["']$/g, '') });
        return;
      }

      if (action === 'extract_tasks') {
        const response = await ai.models.generateContent({
          model: MODEL_NAME,
          contents: `Extract actionable tasks from this note:\n\n${safeContent}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                extractedTasks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      priority: { type: Type.STRING },
                      category: { type: Type.STRING },
                    },
                    required: ['title', 'priority', 'category'],
                  },
                },
              },
              required: ['extractedTasks'],
            },
          },
        });
        const data = JSON.parse(response.text || '{"extractedTasks":[]}');
        res.json(data);
        return;
      }

      res.status(400).json({ error: 'Invalid note-assist action.' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unexpected server error';
      res.status(500).json({ error: `Note assist failed: ${msg}` });
    }
  });

  const httpServer = createHttpServer(app);

  // Mount Vite dev server in development or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MyAI Hub server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
