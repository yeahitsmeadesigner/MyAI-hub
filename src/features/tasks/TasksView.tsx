import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Circle,
  Clock,
  Edit3,
  Plus,
  Repeat,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import {
  getNotificationPermissionState,
  requestBrowserNotificationPermission,
  triggerBrowserNotification,
  type NotificationPermissionState,
} from '../../lib/reminders';
import { isTaskDueToday, isTaskOverdue } from '../../lib/validation';
import type { TaskItem, TaskPriority, TaskRecurrence } from '../../types';

type TaskFilterView = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';
type TaskSortBy = 'dueDate' | 'priority' | 'createdAt' | 'title';

export const TasksView: React.FC<{
  externalNewTaskTrigger?: number;
}> = ({ externalNewTaskTrigger }) => {
  const {
    tasks,
    settings,
    updateSettings,
    createTask,
    updateTask,
    toggleTaskCompletion,
    deleteTask,
    showToast,
  } = useApp();

  const [view, setView] = useState<TaskFilterView>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [sortBy, setSortBy] = useState<TaskSortBy>('dueDate');

  // Modal state for Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [category, setCategory] = useState('Work');
  const [dueDate, setDueDate] = useState('');
  const [reminderAt, setReminderAt] = useState('');
  const [recurrence, setRecurrence] = useState<TaskRecurrence>('none');
  const [formErrors, setFormErrors] = useState<string[]>([]);

  // Delete confirmation state
  const [taskToDelete, setTaskToDelete] = useState<TaskItem | null>(null);

  // Notification permission state
  const [notifPermission, setNotifPermission] = useState<NotificationPermissionState>(() =>
    getNotificationPermissionState()
  );

  useEffect(() => {
    if (externalNewTaskTrigger && externalNewTaskTrigger > 0) {
      openCreateModal();
    }
  }, [externalNewTaskTrigger]);

  const openCreateModal = () => {
    setEditingTask(null);
    setTitle('');
    setDescription('');
    setPriority('medium');
    setCategory('Work');
    setDueDate('');
    setReminderAt('');
    setRecurrence('none');
    setFormErrors([]);
    setIsModalOpen(true);
  };

  const openEditModal = (task: TaskItem) => {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setCategory(task.category);
    setDueDate(task.dueDate ?? '');
    setReminderAt(task.reminderAt ?? '');
    setRecurrence(task.recurrence);
    setFormErrors([]);
    setIsModalOpen(true);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors([]);

    if (editingTask) {
      const res = await updateTask(editingTask.id, {
        title,
        description,
        priority,
        category,
        dueDate: dueDate.trim() || null,
        reminderAt: reminderAt.trim() || null,
        recurrence,
      });
      if (!res.ok) {
        setFormErrors(res.errors ?? ['Invalid task data']);
        return;
      }
      setIsModalOpen(false);
    } else {
      const res = await createTask({
        title,
        description,
        priority,
        category,
        dueDate: dueDate.trim() || null,
        reminderAt: reminderAt.trim() || null,
        recurrence,
      });
      if (!res.ok) {
        setFormErrors(res.errors ?? ['Invalid task data']);
        return;
      }
      setIsModalOpen(false);
    }
  };

  const handleEnableNotifications = async () => {
    const perm = await requestBrowserNotificationPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      updateSettings({ notificationsEnabled: true });
      await triggerBrowserNotification(
        'MyAI Hub Reminders Active',
        'Foreground browser notifications are now enabled for your scheduled tasks.'
      );
      showToast('Browser notifications enabled', 'success');
    } else if (perm === 'denied') {
      updateSettings({ notificationsEnabled: false });
      showToast('Notification permission denied by browser settings', 'error');
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>(['Work', 'Personal', 'Research', 'System']);
    tasks.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return Array.from(set);
  }, [tasks]);

  const now = useMemo(() => new Date(), [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        if (view === 'today') return !t.completed && isTaskDueToday(t, now);
        if (view === 'overdue') return !t.completed && isTaskOverdue(t, now);
        if (view === 'upcoming')
          return !t.completed && Boolean(t.dueDate) && !isTaskOverdue(t, now);
        if (view === 'completed') return t.completed;
        return true;
      })
      .filter((t) => {
        if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
        if (selectedPriority !== 'all' && t.priority !== selectedPriority) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            t.title.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.category.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (sortBy === 'priority') {
          const weights = { high: 0, medium: 1, low: 2 };
          return weights[a.priority] - weights[b.priority];
        }
        if (sortBy === 'dueDate') {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        }
        if (sortBy === 'title') {
          return a.title.localeCompare(b.title);
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [tasks, view, selectedCategory, selectedPriority, searchQuery, sortBy, now]);

  const counts = useMemo(() => {
    return {
      all: tasks.length,
      today: tasks.filter((t) => !t.completed && isTaskDueToday(t, now)).length,
      upcoming: tasks.filter((t) => !t.completed && Boolean(t.dueDate) && !isTaskOverdue(t, now))
        .length,
      overdue: tasks.filter((t) => !t.completed && isTaskOverdue(t, now)).length,
      completed: tasks.filter((t) => t.completed).length,
    };
  }, [tasks, now]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Tasks & Reminders</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Local IndexedDB task planner with priorities, recurring schedules, and honest browser reminders
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="self-start sm:self-auto min-h-[42px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shadow-xs"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>New Task</span>
        </button>
      </div>

      {/* Honest Browser Reminder Banner */}
      <section
        aria-label="Browser Reminder Configuration"
        className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col md:flex-row md:items-center justify-between gap-3"
      >
        <div className="space-y-1">
          <p className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Bell className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <span>
              Browser Reminder Status:{' '}
              {notifPermission === 'granted' && settings.notificationsEnabled
                ? 'Active (Foreground & Open Tab)'
                : notifPermission === 'denied'
                ? 'Blocked by Browser Permission'
                : notifPermission === 'unsupported'
                ? 'Unsupported in this Browser'
                : 'Not Yet Enabled'}
            </span>
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            Reminders trigger cleanly while MyAI Hub is open in a browser tab or installed PWA window. Reliable background notifications when the browser process is closed require a server Web Push service or native Android wrapper.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {notifPermission !== 'unsupported' && (
            <button
              type="button"
              onClick={handleEnableNotifications}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
            >
              {notifPermission === 'granted' ? 'Send Test Notification' : 'Request Notification Permission'}
            </button>
          )}
        </div>
      </section>

      {/* View Tabs & Filter Controls */}
      <div className="space-y-3">
        <div
          role="tablist"
          aria-label="Task Views"
          className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/80 overflow-x-auto no-scrollbar"
        >
          {(
            [
              { id: 'all', label: 'All Tasks', count: counts.all },
              { id: 'today', label: 'Today', count: counts.today },
              { id: 'upcoming', label: 'Upcoming', count: counts.upcoming },
              { id: 'overdue', label: 'Overdue', count: counts.overdue },
              { id: 'completed', label: 'Completed', count: counts.completed },
            ] as { id: TaskFilterView; label: string; count: number }[]
          ).map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={view === tab.id}
              type="button"
              onClick={() => setView(tab.id)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                view === tab.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              <span className="font-mono tabular-nums opacity-75">({tab.count})</span>
            </button>
          ))}
        </div>

        {/* Search, Category, Priority, Sort Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <label htmlFor="task-search-input" className="sr-only">
              Search tasks
            </label>
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="task-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks by title or category..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
            />
          </div>

          <div>
            <label htmlFor="task-category-filter" className="sr-only">
              Filter by category
            </label>
            <select
              id="task-category-filter"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  Category: {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="task-priority-filter" className="sr-only">
              Filter by priority
            </label>
            <select
              id="task-priority-filter"
              value={selectedPriority}
              onChange={(e) => setSelectedPriority(e.target.value)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Priorities</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>

          <div>
            <label htmlFor="task-sort-select" className="sr-only">
              Sort tasks by
            </label>
            <select
              id="task-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as TaskSortBy)}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200"
            >
              <option value="dueDate">Sort by: Due Date</option>
              <option value="priority">Sort by: Priority</option>
              <option value="createdAt">Sort by: Recently Created</option>
              <option value="title">Sort by: Alphabetical</option>
            </select>
          </div>
        </div>
      </div>

      {/* Task List */}
      <section
        aria-label="Tasks List"
        className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800"
      >
        {filteredTasks.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No tasks match the current view or filter.
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create a new task or clear your active search filters.
            </p>
            <button
              type="button"
              onClick={openCreateModal}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
            >
              Create Task
            </button>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const overdue = isTaskOverdue(task, now);
            const dueToday = isTaskDueToday(task, now);
            return (
              <div
                key={task.id}
                className="p-4 sm:px-5 flex items-start justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => toggleTaskCompletion(task.id)}
                    aria-label={
                      task.completed
                        ? `Mark "${task.title}" as incomplete`
                        : `Mark "${task.title}" as completed`
                    }
                    className="min-h-[44px] min-w-[44px] -ml-2 -mt-1 flex items-center justify-center text-slate-400 hover:text-teal-600 shrink-0"
                  >
                    {task.completed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Circle className="w-5 h-5" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0 space-y-1">
                    <p
                      className={`text-sm font-semibold ${
                        task.completed
                          ? 'line-through text-slate-400 dark:text-slate-500'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {task.title}
                    </p>

                    {task.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {task.description}
                      </p>
                    )}

                    {/* Clean Unboxed Metadata Line (Zero-Pill Rule) */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                      <span
                        className={
                          task.priority === 'high' && !task.completed
                            ? 'font-semibold text-amber-700 dark:text-amber-400'
                            : ''
                        }
                      >
                        {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} priority
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{task.category}</span>

                      {task.dueDate && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-mono tabular-nums flex items-center gap-1 ${
                              overdue
                                ? 'text-red-600 dark:text-red-400 font-semibold'
                                : dueToday && !task.completed
                                ? 'text-teal-700 dark:text-teal-400 font-medium'
                                : ''
                            }`}
                          >
                            <Clock className="w-3 h-3" aria-hidden="true" />
                            <span>
                              {overdue ? 'Overdue: ' : dueToday ? 'Today: ' : 'Due: '}
                              {task.dueDate.replace('T', ' ')}
                            </span>
                          </span>
                        </>
                      )}

                      {task.recurrence !== 'none' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="flex items-center gap-1">
                            <Repeat className="w-3 h-3" aria-hidden="true" />
                            <span>Repeats {task.recurrence}</span>
                          </span>
                        </>
                      )}

                      {task.reminderAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums flex items-center gap-1">
                            <Bell className="w-3 h-3" aria-hidden="true" />
                            <span>Reminder {task.reminderAt.replace('T', ' ')}</span>
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Row Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(task)}
                    aria-label={`Edit task "${task.title}"`}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskToDelete(task)}
                    aria-label={`Delete task "${task.title}"`}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* Create / Edit Task Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 id="task-modal-title" className="text-lg font-bold text-slate-900 dark:text-white">
                {editingTask ? 'Edit Task' : 'Create New Task'}
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close modal"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formErrors.length > 0 && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300 space-y-1"
              >
                {formErrors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div>
                <label
                  htmlFor="task-title-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Task Title *
                </label>
                <input
                  id="task-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Finalize Q4 architecture review"
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
                />
              </div>

              <div>
                <label
                  htmlFor="task-desc-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Description / Context
                </label>
                <textarea
                  id="task-desc-input"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional details, links, or acceptance criteria..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="task-priority-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Priority
                  </label>
                  <select
                    id="task-priority-input"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="task-category-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Category
                  </label>
                  <input
                    id="task-category-input"
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Work, Personal, Research..."
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="task-due-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Due Date & Time (Optional)
                  </label>
                  <input
                    id="task-due-input"
                    type="datetime-local"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label
                    htmlFor="task-reminder-input"
                    className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Reminder Alert Time (Optional)
                  </label>
                  <input
                    id="task-reminder-input"
                    type="datetime-local"
                    value={reminderAt}
                    onChange={(e) => setReminderAt(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="task-recurrence-input"
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1"
                >
                  Recurrence Schedule
                </label>
                <select
                  id="task-recurrence-input"
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)}
                  className="w-full min-h-[42px] px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-white"
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[42px] px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
                >
                  {editingTask ? 'Save Changes' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Task Confirmation Modal */}
      {taskToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-task-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h2 id="delete-task-title" className="text-base font-bold text-slate-900 dark:text-white">
              Delete Task?
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete <strong>"{taskToDelete.title}"</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setTaskToDelete(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteTask(taskToDelete.id);
                  setTaskToDelete(null);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                Delete Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
