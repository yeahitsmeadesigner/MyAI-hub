# MyAI Hub — Private Personal Command Center

MyAI Hub is a privacy-first, mobile-first Progressive Web App (PWA) combining an **AI Assistant**, **Tasks & Reminders**, **Smart Markdown Notes**, and **Personal Productivity Tools**. All personal data (tasks, notes, and chat history) is stored locally on your device in **IndexedDB** via Dexie.

---

## Project Directory Structure

```text
/
├── .env.example                           # Server-side environment variable template
├── index.html                             # App entry HTML with PWA & mobile viewport metadata
├── metadata.json                          # Application capability metadata
├── package.json                           # Scripts and dependencies
├── public/
│   ├── apple-touch-icon.png               # 180x180 iOS home screen icon
│   ├── icon.svg                           # Scalable vector app icon
│   ├── offline.html                       # Standalone offline fallback page
│   ├── pwa-192x192.png                    # 192x192 Android/Chromium PWA icon
│   ├── pwa-512x512.png                    # 512x512 high-res PWA icon
│   └── pwa-maskable-512x512.png           # 512x512 Android adaptive maskable icon
├── server.ts                              # Express server + server-side Gemini API proxy
├── src/
│   ├── App.tsx                            # Root application & tab router
│   ├── index.css                          # Tailwind CSS v4 & typography rules
│   ├── main.tsx                           # React DOM mount
│   ├── app/
│   │   └── AppContext.tsx                 # Central state, IndexedDB sync, backup/restore
│   ├── components/
│   │   ├── Layout.tsx                     # Responsive shell (Top bar, Sidebar, Bottom Nav)
│   │   └── MarkdownRenderer.tsx           # Safe Markdown parser & renderer
│   ├── db/
│   │   └── database.ts                    # Dexie IndexedDB schema & initial starter seed
│   ├── features/
│   │   ├── chat/
│   │   │   └── ChatView.tsx               # AI Assistant chat, quick prompts, tool cards
│   │   ├── dashboard/
│   │   │   └── DashboardView.tsx          # Greeting, daily focus, metrics, overdue/recent
│   │   ├── notes/
│   │   │   └── NotesView.tsx              # Smart Notes editor, preview, export, AI tools
│   │   ├── settings/
│   │   │   └── SettingsView.tsx           # Theme, AI modes, notifications, JSON backup
│   │   └── tasks/
│   │       └── TasksView.tsx              # Tasks CRUD, filters, recurrence, reminders
│   ├── lib/
│   │   ├── cloudAiClient.ts               # Client wrapper for /api/ai/* endpoints
│   │   ├── localAiEngine.ts               # Browser WebGPU & Prompt API runtime detector
│   │   ├── offlineAssistant.ts            # Deterministic offline command & search engine
│   │   ├── pwa.ts                         # PWA install & online connectivity hooks
│   │   ├── reminders.ts                   # Browser notification permission & scheduler
│   │   └── validation.ts                  # Input & versioned JSON backup validators
│   ├── tests/
│   │   └── hub.test.ts                    # Automated Node unit test suite
│   └── types/
│       └── index.ts                       # TypeScript interfaces and domain models
├── tsconfig.json                          # TypeScript configuration
└── vite.config.ts                         # Vite + Tailwind + VitePWA configuration
```

---

## Prerequisites & Installation

- **Node.js**: v20+ (v22 recommended)
- **npm**: v10+

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Copy environment variables for server-side Cloud AI mode
cp .env.example .env
```

---

## Development, Build & Testing Commands

```bash
# Start full-stack development server on http://localhost:3000
npm run dev

# Run automated unit tests (Task CRUD validation, Note search/citation, Offline assistant, Backup schema)
npm test

# Type-check the codebase
npm run lint

# Build production client bundle and PWA service worker into dist/
npm run build

# Start production server
npm start
```

---

## AI Operating Modes & Privacy Matrix

MyAI Hub defaults to **Offline Command Mode**. Private notes and tasks are never transmitted off-device unless you explicitly switch to Cloud Mode and accept the privacy disclosure.

| Capability / Feature | Offline Command Mode (Default) | Local Browser Model (`window.ai` / WebGPU) | Optional Cloud Mode (`server.ts` Gemini API) |
| :--- | :---: | :---: | :---: |
| **Works without Internet** | Yes (100%) | Yes (after model weights cached) | No (requires HTTPS server) |
| **Commands (`help`, `add task`, `list tasks`, `complete task`, `note`)** | Yes | Yes | Yes |
| **`plan my day` Daily Schedule Builder** | Yes | Yes | Yes |
| **`search notes [query]` with Exact Citations** | Yes | Yes | Yes |
| **Extractive Note Summarization & Title Suggestion** | Yes | Yes | Yes |
| **Extract Action Items into Tasks** | Yes | Yes | Yes |
| **Open-Ended Generative Q&A & Rewriting** | Honest fallback notice | Yes (when browser runtime supported) | Yes |

---

## Installing the PWA on Android, iOS & Desktop

1. **Android (Chrome / Edge / Brave)**:
   - Open the deployed HTTPS URL (or `http://localhost:3000` during local testing).
   - Tap the **Install MyAI Hub App** button in the sidebar/settings, or open the browser menu (**⋮**) and select **Install app** / **Add to Home screen**.
2. **iOS / iPadOS (Safari)**:
   - Tap the **Share** icon in the bottom toolbar and choose **Add to Home Screen**.
3. **Offline Behavior**:
   - The Service Worker caches static application shell assets (`HTML`, `JS`, `CSS`, icons, fonts) and never caches `/api/*` responses or private conversations.

---

## Deployment Instructions

- **Full-Stack Deployment (Cloud Run / Render / Fly.io / Railway)**:
  1. Set `NODE_ENV=production` and optionally `GEMINI_API_KEY` in your host’s secret manager.
  2. Run `npm run build` during the build step.
  3. Run `npm start` (`tsx server.ts`) to serve both the static PWA bundle from `dist/` and the optional `/api/*` routes over HTTPS.
- **Static HTTPS Hosting (Vercel / Netlify / Cloudflare Pages)**:
  1. Build command: `npm run build`, publish directory: `dist`.
  2. In static-only hosting without `server.ts`, MyAI Hub automatically operates in **Offline Command Mode** and **Local Browser Model Mode**.

---

## Privacy Limitations & Troubleshooting

- **Local Storage Lifecycle**: Because data lives in your browser’s `IndexedDB` (`MyAIHubDB`), clearing browser site data or uninstalling the browser will erase local records. Use **Settings → Export JSON Backup (v1)** regularly to save portable snapshots.
- **Browser Reminders**: Scheduled task notifications fire reliably while MyAI Hub is open in a tab or installed PWA window. If the operating system terminates the browser background process, native push delivery requires a remote Web Push server (`PushManager` + VAPID).
