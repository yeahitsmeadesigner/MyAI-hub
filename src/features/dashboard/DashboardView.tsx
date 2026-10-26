import React, { useState } from 'react';
import {
  ArrowRight,
  Bell,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  MessageSquare,
  Pin,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { isTaskDueToday, isTaskOverdue } from '../../lib/validation';

export const DashboardView: React.FC<{
  onOpenNewTaskModal: () => void;
}> = ({ onOpenNewTaskModal }) => {
  const {
    tasks,
    notes,
    settings,
    updateSettings,
    toggleTaskCompletion,
    setActiveTab,
    openNoteInView,
    createNote,
    setPendingAssistantPrompt,
    showToast,
  } = useApp();

  const [focusInput, setFocusInput] = useState(settings.dailyFocus);
  const [isEditingFocus, setIsEditingFocus] = useState(false);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [showQuickNoteInput, setShowQuickNoteInput] = useState(false);

  const now = new Date();
  const hour = now.getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const pendingTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);
  const overdueTasks = pendingTasks.filter((t) => isTaskOverdue(t, now));
  const dueTodayTasks = pendingTasks.filter(
    (t) => isTaskDueToday(t, now) && !isTaskOverdue(t, now)
  );
  const upcomingReminders = pendingTasks
    .filter((t) => !isTaskOverdue(t, now))
    .slice(0, 4);
  const recentNotes = notes.slice(0, 4);

  const handleSaveFocus = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      dailyFocus: focusInput.trim(),
      dailyFocusDate: now.toISOString().slice(0, 10),
    });
    setIsEditingFocus(false);
    showToast('Daily focus updated', 'success');
  };

  const handleQuickCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickNoteText.trim()) return;
    const firstLine = quickNoteText.trim().split('\n')[0].slice(0, 60);
    const res = await createNote({
      title: firstLine || 'Quick Dashboard Note',
      content: quickNoteText.trim(),
      tags: ['quick-note'],
    });
    if (res.ok) {
      setQuickNoteText('');
      setShowQuickNoteInput(false);
    }
  };

  const triggerAssistantQuickPrompt = (promptText: string) => {
    setPendingAssistantPrompt(promptText);
    setActiveTab('assistant');
  };

  return (
    <div className="space-y-8">
      {/* Greeting & Quick Actions Header */}
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {formattedDate} · Local-First Personal Command Center
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white mt-1">
            {greeting}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenNewTaskModal}
            className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-teal-600 text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>Create Task</span>
          </button>
          <button
            type="button"
            onClick={() => setShowQuickNoteInput((prev) => !prev)}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <span>Quick Note</span>
          </button>
          <button
            type="button"
            onClick={() => triggerAssistantQuickPrompt('Plan my day')}
            className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <span>Plan My Day</span>
          </button>
        </div>
      </section>

      {/* Optional Quick Note Drawer on Dashboard */}
      {showQuickNoteInput && (
        <section
          aria-label="Quick Note Creator"
          className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
        >
          <form onSubmit={handleQuickCreateNote} className="space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="dashboard-quick-note"
                className="text-sm font-semibold text-slate-900 dark:text-white"
              >
                Capture a Quick Smart Note
              </label>
              <button
                type="button"
                onClick={() => setShowQuickNoteInput(false)}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
            <textarea
              id="dashboard-quick-note"
              rows={3}
              value={quickNoteText}
              onChange={(e) => setQuickNoteText(e.target.value)}
              placeholder="Write a thought, meeting snippet, or Markdown note..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 text-sm text-slate-900 dark:text-slate-100 focus:outline-2 focus:outline-teal-600"
            />
            <div className="flex justify-end gap-2">
              <button
                type="submit"
                disabled={!quickNoteText.trim()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 disabled:opacity-50"
              >
                Save to Smart Notes
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Daily Focus Area */}
      <section
        aria-labelledby="daily-focus-heading"
        className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 flex-1">
            <h2
              id="daily-focus-heading"
              className="text-xs font-semibold text-teal-700 dark:text-teal-400"
            >
              Daily Primary Focus
            </h2>
            {!isEditingFocus ? (
              <p className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                {settings.dailyFocus || 'No focus set for today — define your #1 outcome.'}
              </p>
            ) : (
              <form onSubmit={handleSaveFocus} className="flex flex-col sm:flex-row gap-2 pt-1">
                <label htmlFor="daily-focus-input" className="sr-only">
                  Daily Primary Focus
                </label>
                <input
                  id="daily-focus-input"
                  type="text"
                  value={focusInput}
                  onChange={(e) => setFocusInput(e.target.value)}
                  placeholder="What is the single most important outcome for today?"
                  className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 whitespace-nowrap"
                  >
                    Save Focus
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFocusInput(settings.dailyFocus);
                      setIsEditingFocus(false);
                    }}
                    className="min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
          {!isEditingFocus && (
            <button
              type="button"
              onClick={() => {
                setFocusInput(settings.dailyFocus);
                setIsEditingFocus(true);
              }}
              className="self-start sm:self-center min-h-[40px] px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Edit Focus
            </button>
          )}
        </div>
      </section>

      {/* Task & Workspace Metric Strip (Tabular Numerals, Single Elevation) */}
      <section aria-label="Workspace Summary Metrics" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Open Tasks</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {pendingTasks.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {dueTodayTasks.length} scheduled today
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Overdue Tasks</p>
          <p
            className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums mt-1 ${
              overdueTasks.length > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {overdueTasks.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {overdueTasks.length > 0 ? 'Requires immediate attention' : 'All deadlines on track'}
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Completed</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
            {completedTasks.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {tasks.length > 0
              ? `${Math.round((completedTasks.length / tasks.length) * 100)}% completion rate`
              : 'No tasks logged yet'}
          </p>
        </div>

        <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Smart Notes</p>
          <p className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
            {notes.length}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
            {notes.filter((n) => n.pinned).length} pinned in library
          </p>
        </div>
      </section>

      {/* Two-Column Split: Overdue & Upcoming Tasks vs. Recent Smart Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* Left Column: Overdue & Upcoming Reminders */}
        <section
          aria-labelledby="dashboard-tasks-heading"
          className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between"
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2
                  id="dashboard-tasks-heading"
                  className="text-base font-bold text-slate-900 dark:text-white"
                >
                  Priority Tasks & Reminders
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Overdue items and upcoming scheduled reminders
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('tasks')}
                className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-600 dark:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
              >
                <span>All Tasks</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {overdueTasks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400">
                  Overdue ({overdueTasks.length})
                </p>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {overdueTasks.slice(0, 3).map((task) => (
                    <div
                      key={task.id}
                      className="py-2.5 flex items-start justify-between gap-3"
                    >
                      <button
                        type="button"
                        onClick={() => toggleTaskCompletion(task.id)}
                        aria-label={`Complete overdue task "${task.title}"`}
                        className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-slate-400 hover:text-teal-600 shrink-0"
                      >
                        <Circle className="w-5 h-5" />
                      </button>
                      <div className="flex-1 min-w-0 pt-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {task.title}
                        </p>
                        <p className="text-xs text-red-600 dark:text-red-400 font-mono tabular-nums mt-0.5">
                          Overdue · Due {task.dueDate?.replace('T', ' ')} · {task.category} ·{' '}
                          {task.priority} priority
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                Upcoming & Active ({upcomingReminders.length})
              </p>
              {upcomingReminders.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No active tasks or reminders scheduled.
                  </p>
                  <button
                    type="button"
                    onClick={onOpenNewTaskModal}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-teal-600 text-xs font-semibold"
                  >
                    Schedule First Task
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {upcomingReminders.map((task) => {
                    const overdue = isTaskOverdue(task, now);
                    return (
                      <div
                        key={task.id}
                        className="py-2.5 flex items-start justify-between gap-3"
                      >
                        <button
                          type="button"
                          onClick={() => toggleTaskCompletion(task.id)}
                          aria-label={`Mark "${task.title}" as completed`}
                          className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center text-slate-400 hover:text-teal-600 shrink-0"
                        >
                          {task.completed ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          ) : (
                            <Circle className="w-5 h-5" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0 pt-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {task.title}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            <span>{task.category}</span>
                            <span aria-hidden="true">·</span>
                            <span>{task.priority} priority</span>
                            {task.dueDate && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={`font-mono tabular-nums flex items-center gap-1 ${
                                    overdue ? 'text-red-600 dark:text-red-400 font-medium' : ''
                                  }`}
                                >
                                  <Clock className="w-3 h-3" aria-hidden="true" />
                                  {task.dueDate.replace('T', ' ')}
                                </span>
                              </>
                            )}
                            {task.reminderAt && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums flex items-center gap-1 text-teal-600 dark:text-teal-400">
                                  <Bell className="w-3 h-3" aria-hidden="true" />
                                  Reminder set
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Stored locally in IndexedDB</span>
            <button
              type="button"
              onClick={onOpenNewTaskModal}
              className="font-semibold text-teal-600 dark:text-teal-400 hover:underline"
            >
              + Add new task
            </button>
          </div>
        </section>

        {/* Right Column: Recent Smart Notes & Quick AI Prompts */}
        <section
          aria-labelledby="dashboard-notes-heading"
          className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between"
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2
                  id="dashboard-notes-heading"
                  className="text-base font-bold text-slate-900 dark:text-white"
                >
                  Recent Smart Notes
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Pinned and recently modified Markdown notes
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('notes')}
                className="min-h-[40px] px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-600 dark:text-teal-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 whitespace-nowrap"
              >
                <span>Open Notes</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            {recentNotes.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Your Smart Notes library is empty.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('notes')}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 text-white dark:bg-teal-600 text-xs font-semibold"
                >
                  Create First Note
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {recentNotes.map((note) => {
                  const preview = note.content
                    .replace(/^[#>*\-\s]+/gm, ' ')
                    .replace(/[*`_~]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 110);
                  return (
                    <div key={note.id} className="py-3">
                      <button
                        type="button"
                        onClick={() => openNoteInView(note.id)}
                        className="w-full text-left group focus-visible:outline-2 focus-visible:outline-teal-600 rounded-lg"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors flex items-center gap-1.5 truncate">
                            {note.pinned && (
                              <Pin
                                className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0"
                                aria-label="Pinned"
                              />
                            )}
                            <span className="truncate">{note.title}</span>
                          </span>
                          <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                            {new Date(note.updatedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {preview || 'Empty note'}
                        </p>
                        {note.tags.length > 0 && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            {note.tags.map((t) => `#${t}`).join(' · ')}
                          </p>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Assistant Quick Command Bar on Dashboard */}
          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                <span>Ask AI Assistant</span>
              </span>
              <span className="text-xs text-slate-400">Works offline</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Plan my day', prompt: 'Plan my day' },
                { label: 'Find Python notes', prompt: 'Find my notes about Python' },
                { label: 'List open tasks', prompt: 'list tasks' },
              ].map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => triggerAssistantQuickPrompt(q.prompt)}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
