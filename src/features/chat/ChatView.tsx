import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  ShieldAlert,
  Square,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { sendCloudChatRequest } from '../../lib/cloudAiClient';
import { checkLocalModelStatus, runLocalModelPrompt } from '../../lib/localAiEngine';
import { processOfflineCommand } from '../../lib/offlineAssistant';
import type { AIMode, LocalModelStatus } from '../../types';

const QUICK_PROMPTS = [
  { label: 'Plan my day', text: 'Plan my day', fillOnly: false },
  {
    label: 'Summarize this text',
    text: 'summarize: Python 3.12 introduces improved error messages, f-string parsing enhancements, and per-interpreter GIL support so concurrent applications can utilize multiple CPU cores cleanly.',
    fillOnly: false,
  },
  {
    label: 'Turn this into tasks',
    text: 'Turn this into tasks: Audit API rate limits today !high; Prepare release changelog; Schedule security review',
    fillOnly: false,
  },
  { label: 'Find my notes about Python', text: 'Find my notes about Python', fillOnly: false },
  { label: 'Show commands (help)', text: 'help', fillOnly: false },
];

export const ChatView: React.FC = () => {
  const {
    settings,
    updateSettings,
    tasks,
    notes,
    conversations,
    messages,
    activeConversationId,
    setActiveConversationId,
    createNewConversation,
    clearConversationMessages,
    addChatMessage,
    applyToolProposal,
    dismissToolProposal,
    openNoteInView,
    pendingAssistantPrompt,
    setPendingAssistantPrompt,
    showToast,
  } = useApp();

  const [input, setInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmClearChat, setConfirmClearChat] = useState(false);
  const [showCloudConsentModal, setShowCloudConsentModal] = useState(false);
  const [pendingCloudPrompt, setPendingCloudPrompt] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<LocalModelStatus | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const currentMessages = messages.filter((m) => m.conversationId === activeConversationId);

  useEffect(() => {
    checkLocalModelStatus().then(setLocalStatus);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages.length, isGenerating]);

  const executePrompt = useCallback(
    async (rawPrompt: string, forceMode?: AIMode) => {
      const promptText = rawPrompt.trim();
      if (!promptText || isGenerating) return;

      const modeToUse = forceMode ?? settings.aiMode;

      // Enforce explicit privacy disclosure before sending anything to Cloud provider
      if (modeToUse === 'cloud' && !settings.cloudConsentGiven) {
        setPendingCloudPrompt(promptText);
        setShowCloudConsentModal(true);
        return;
      }

      let convId = activeConversationId;
      if (!convId) {
        const created = await createNewConversation(promptText.slice(0, 44));
        convId = created.id;
      }

      setInput('');
      await addChatMessage({
        conversationId: convId,
        role: 'user',
        content: promptText,
        modeUsed: modeToUse,
      });

      setIsGenerating(true);
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        if (modeToUse === 'offline') {
          const result = processOfflineCommand(promptText, {
            tasks,
            notes,
            dailyFocus: settings.dailyFocus,
          });
          await addChatMessage({
            conversationId: convId,
            role: 'assistant',
            content: result.reply,
            modeUsed: 'offline',
            citations: result.citations,
            toolProposals: result.toolProposals,
          });
        } else if (modeToUse === 'local') {
          const result = await runLocalModelPrompt(
            promptText,
            {
              tasks,
              notes,
              dailyFocus: settings.dailyFocus,
            },
            controller.signal
          );
          await addChatMessage({
            conversationId: convId,
            role: 'assistant',
            content: result.reply,
            modeUsed: 'local',
            citations: result.citations,
            toolProposals: result.toolProposals,
          });
        } else {
          // Cloud mode (explicitly opted-in)
          const historyForCloud = currentMessages.map((m) => ({
            role: m.role,
            content: m.content,
          }));
          const result = await sendCloudChatRequest({
            prompt: promptText,
            history: historyForCloud,
            includeContext: settings.includeContextInCloud,
            tasks,
            notes,
            dailyFocus: settings.dailyFocus,
            signal: controller.signal,
          });
          await addChatMessage({
            conversationId: convId,
            role: 'assistant',
            content: result.reply,
            modeUsed: 'cloud',
            citations: result.citations,
            toolProposals: result.toolProposals,
          });
        }
      } catch (err) {
        const isAborted = err instanceof Error && err.name === 'AbortError';
        await addChatMessage({
          conversationId: convId,
          role: 'assistant',
          content: isAborted
            ? '*Generation stopped by user.*'
            : `**Error:** ${
                err instanceof Error ? err.message : 'Unable to complete request.'
              }\n\nTip: You can switch to **Offline Command Mode** anytime to manage tasks and search notes without network dependencies.`,
          modeUsed: modeToUse,
          isError: !isAborted,
        });
      } finally {
        setIsGenerating(false);
        abortControllerRef.current = null;
      }
    },
    [
      activeConversationId,
      addChatMessage,
      createNewConversation,
      currentMessages,
      isGenerating,
      notes,
      settings.aiMode,
      settings.cloudConsentGiven,
      settings.dailyFocus,
      settings.includeContextInCloud,
      tasks,
    ]
  );

  // Run pending prompt triggered from Dashboard
  useEffect(() => {
    if (pendingAssistantPrompt) {
      const p = pendingAssistantPrompt;
      setPendingAssistantPrompt(null);
      executePrompt(p);
    }
  }, [pendingAssistantPrompt, setPendingAssistantPrompt, executePrompt]);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsGenerating(false);
      showToast('Generation stopped', 'info');
    }
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      showToast('Response copied to clipboard', 'success');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      showToast('Could not access clipboard', 'error');
    }
  };

  const handleRetryLastUserMessage = () => {
    const lastUser = [...currentMessages].reverse().find((m) => m.role === 'user');
    if (lastUser) {
      executePrompt(lastUser.content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      executePrompt(input);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100dvh-9.25rem)] lg:h-[calc(100dvh-5.75rem)]">
      {/* Assistant Header & Mode Selector Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">AI Assistant</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {settings.aiMode === 'offline'
                ? '100% On-Device Deterministic Command Engine · Zero Network Traffic'
                : settings.aiMode === 'local'
                ? localStatus?.supported
                  ? `On-Device Browser Model (${localStatus.provider})`
                  : 'Local Model Unavailable in Browser · Using Offline Command Fallback'
                : 'Optional Server-Side Gemini API · Explicit Privacy Consent Active'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Conversation Selector */}
          <label htmlFor="conversation-select" className="sr-only">
            Select Conversation
          </label>
          <select
            id="conversation-select"
            value={activeConversationId ?? ''}
            onChange={(e) => setActiveConversationId(e.target.value)}
            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[180px] truncate"
          >
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>

          {/* AI Mode Segmented Control */}
          <div
            role="group"
            aria-label="AI Operating Mode"
            className="flex items-center p-1 rounded-lg bg-slate-200/70 dark:bg-slate-800"
          >
            {(['offline', 'local', 'cloud'] as AIMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (mode === 'cloud' && !settings.cloudConsentGiven) {
                    setShowCloudConsentModal(true);
                  } else {
                    updateSettings({ aiMode: mode });
                  }
                }}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  settings.aiMode === mode
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {mode === 'offline' ? 'Offline' : mode === 'local' ? 'Local AI' : 'Cloud AI'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => createNewConversation('New Conversation')}
            aria-label="Start new conversation"
            className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>New Chat</span>
          </button>

          {activeConversationId && currentMessages.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClearChat(true)}
              aria-label="Clear current conversation"
              className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 flex items-center gap-1 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Quick Prompts Bar */}
      <div className="py-2.5 flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-200/70 dark:border-slate-800/70 shrink-0">
        <span className="text-xs font-medium text-slate-400 shrink-0">Quick Prompts:</span>
        {QUICK_PROMPTS.map((qp) => (
          <button
            key={qp.label}
            type="button"
            disabled={isGenerating}
            onClick={() => {
              if (qp.fillOnly) {
                setInput(qp.text);
              } else {
                executePrompt(qp.text);
              }
            }}
            className="min-h-[34px] px-3 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-teal-500 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors whitespace-nowrap shrink-0"
          >
            {qp.label}
          </button>
        ))}
      </div>

      {/* Chat Messages Stream */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
        {currentMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 max-w-md mx-auto space-y-3">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Start a Private Command or Conversation
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Ask me to plan your day, add tasks, create smart notes, summarize passages, or search your stored notes with exact citations.
            </p>
          </div>
        ) : (
          currentMessages.map((msg) => {
            const isUser = msg.role === 'user';
            const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-2xl w-full sm:w-auto rounded-2xl px-4 py-3 ${
                    isUser
                      ? 'bg-slate-900 text-white dark:bg-teal-700'
                      : msg.isError
                      ? 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-slate-900 dark:text-slate-100'
                      : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {isUser ? (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}

                  {/* Note Citations (if any) */}
                  {!isUser && msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Cited Local Notes ({msg.citations.length}):
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {msg.citations.map((cit) => (
                          <button
                            key={cit.noteId}
                            type="button"
                            onClick={() => openNoteInView(cit.noteId)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-teal-50 dark:hover:bg-teal-950/50 text-xs font-medium text-teal-700 dark:text-teal-300 flex items-center gap-1.5 transition-colors"
                          >
                            <FileText className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>{cit.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Proposed Structured Tool Actions */}
                  {!isUser && msg.toolProposals && msg.toolProposals.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        Suggested Workspace Actions (Requires Confirmation):
                      </p>
                      {msg.toolProposals.map((prop) => (
                        <div
                          key={prop.id}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="text-xs">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {prop.summary}
                            </p>
                            <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                              {prop.status === 'pending'
                                ? 'Unsaved suggestion — confirm to write to IndexedDB'
                                : prop.status === 'applied'
                                ? 'Saved to IndexedDB'
                                : 'Suggestion dismissed'}
                            </p>
                          </div>

                          {prop.status === 'pending' ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => applyToolProposal(msg.id, prop)}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold whitespace-nowrap"
                              >
                                Confirm & Save
                              </button>
                              <button
                                type="button"
                                onClick={() => dismissToolProposal(msg.id, prop.id)}
                                className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                Dismiss
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 shrink-0">
                              {prop.status === 'applied' ? '✓ Saved' : 'Dismissed'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Message Metadata Footer & Actions */}
                <div className="flex items-center gap-2 mt-1 px-1 text-[11px] text-slate-400 dark:text-slate-500">
                  <span className="font-mono tabular-nums">{timeStr}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {msg.modeUsed === 'offline'
                      ? 'Offline Engine'
                      : msg.modeUsed === 'local'
                      ? 'Local Model'
                      : 'Cloud Gemini'}
                  </span>
                  {!isUser && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        aria-label="Copy response"
                        className="hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={handleRetryLastUserMessage}
                        disabled={isGenerating}
                        aria-label="Retry response"
                        className="hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1 disabled:opacity-40"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}

        {isGenerating && (
          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-w-md">
            <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600" aria-hidden="true" />
              <span>Generating response...</span>
            </div>
            <button
              type="button"
              onClick={handleStopGeneration}
              className="min-h-[34px] px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Square className="w-3 h-3 fill-current" aria-hidden="true" />
              <span>Stop</span>
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Multiline Composer Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          executePrompt(input);
        }}
        className="pt-3 border-t border-slate-200 dark:border-slate-800 shrink-0"
      >
        <div className="flex items-end gap-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl p-2 focus-within:border-teal-600">
          <label htmlFor="assistant-chat-input" className="sr-only">
            Message AI Assistant
          </label>
          <textarea
            id="assistant-chat-input"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command (e.g., 'Plan my day', 'add task Buy groceries tomorrow', 'search notes Python')... Press Enter to send, Shift+Enter for new line."
            className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          {isGenerating ? (
            <button
              type="button"
              onClick={handleStopGeneration}
              aria-label="Stop generation"
              className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center gap-1"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="min-h-[44px] min-w-[44px] px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              <span className="hidden sm:inline">Send</span>
            </button>
          )}
        </div>
      </form>

      {/* Clear Chat Confirmation Modal */}
      {confirmClearChat && activeConversationId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-chat-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h2 id="clear-chat-title" className="text-base font-bold text-slate-900 dark:text-white">
              Clear Conversation History?
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              This will permanently remove all messages in the current conversation from your local IndexedDB storage. Your saved Tasks and Smart Notes will not be affected.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmClearChat(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await clearConversationMessages(activeConversationId);
                  setConfirmClearChat(false);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                Clear Messages
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Explicit Cloud Privacy Disclosure Modal */}
      {showCloudConsentModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cloud-consent-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="w-5 h-5 shrink-0" aria-hidden="true" />
              <h2 id="cloud-consent-title" className="text-base font-bold text-slate-900 dark:text-white">
                Cloud AI Mode Privacy Disclosure
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              By enabling <strong>Optional Cloud AI Mode</strong>, your chat prompts (and, if enabled, matching task titles and note excerpts for context) are sent over HTTPS to this application’s server-side Gemini API endpoint (<code className="font-mono">/api/ai/chat</code>) for processing.
            </p>
            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-disc pl-4">
              <li>No API keys are ever stored in your browser.</li>
              <li>You can switch back to <strong>Offline Command Mode</strong> at any time.</li>
              <li>You can toggle whether task/note context is included below.</li>
            </ul>
            <label className="flex items-center gap-2.5 pt-1 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.includeContextInCloud}
                onChange={(e) => updateSettings({ includeContextInCloud: e.target.checked })}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span>Include matching local tasks & note excerpts when answering in Cloud Mode</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowCloudConsentModal(false);
                  setPendingCloudPrompt(null);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Stay Offline
              </button>
              <button
                type="button"
                onClick={() => {
                  updateSettings({ aiMode: 'cloud', cloudConsentGiven: true });
                  setShowCloudConsentModal(false);
                  if (pendingCloudPrompt) {
                    const p = pendingCloudPrompt;
                    setPendingCloudPrompt(null);
                    executePrompt(p, 'cloud');
                  }
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
              >
                Acknowledge & Enable Cloud AI
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
