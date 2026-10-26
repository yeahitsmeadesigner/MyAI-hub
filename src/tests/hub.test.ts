import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNextDueDate,
  computeNoteStats,
  isTaskDueToday,
  isTaskOverdue,
  validateBackupPayload,
  validateNoteInput,
  validateTaskInput,
} from '../lib/validation';
import {
  extractActionItemsOffline,
  processOfflineCommand,
  searchStoredNotes,
  suggestNoteTitleOffline,
  summarizeTextOffline,
} from '../lib/offlineAssistant';
import type { NoteItem, TaskItem } from '../types';

const SAMPLE_NOW = new Date('2026-10-26T12:00:00Z');

const SAMPLE_TASKS: TaskItem[] = [
  {
    id: 't1',
    title: 'Review Q4 budget',
    description: 'Check finance spreadsheet',
    priority: 'high',
    category: 'Work',
    dueDate: '2026-10-25T10:00',
    reminderAt: null,
    recurrence: 'none',
    completed: false,
    completedAt: null,
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
  },
  {
    id: 't2',
    title: 'Write Python unit tests',
    description: 'Cover asyncio pipelines',
    priority: 'medium',
    category: 'Engineering',
    dueDate: '2026-10-26',
    reminderAt: null,
    recurrence: 'weekly',
    completed: false,
    completedAt: null,
    createdAt: '2026-10-26T08:00:00Z',
    updatedAt: '2026-10-26T08:00:00Z',
  },
];

const SAMPLE_NOTES: NoteItem[] = [
  {
    id: 'n1',
    title: 'Python Asyncio Guide',
    content:
      '# Python Asyncio\nUse asyncio.TaskGroup in Python 3.12 for structured concurrency and clean cancellation.',
    tags: ['python', 'backend'],
    pinned: true,
    createdAt: '2026-10-24T10:00:00Z',
    updatedAt: '2026-10-25T10:00:00Z',
  },
  {
    id: 'n2',
    title: 'Grocery List',
    content: '- Apples\n- Olive oil\n- Sourdough bread',
    tags: ['personal'],
    pinned: false,
    createdAt: '2026-10-24T11:00:00Z',
    updatedAt: '2026-10-24T11:00:00Z',
  },
];

test('Task input validation rejects empty or too-short titles and accepts valid tasks', () => {
  const emptyRes = validateTaskInput({ title: '   ' });
  assert.equal(emptyRes.valid, false);
  assert.ok(emptyRes.errors.some((e) => e.includes('required')));

  const invalidPriority = validateTaskInput({ title: 'Buy milk', priority: 'urgent' });
  assert.equal(invalidPriority.valid, false);

  const validRes = validateTaskInput({
    title: 'Prepare deployment checklist',
    priority: 'high',
    recurrence: 'weekly',
    dueDate: '2026-10-30',
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.errors.length, 0);
});

test('Overdue, due-today, and recurring due date calculations work accurately', () => {
  assert.equal(isTaskOverdue(SAMPLE_TASKS[0], SAMPLE_NOW), true);
  assert.equal(isTaskDueToday(SAMPLE_TASKS[1], SAMPLE_NOW), true);

  const nextDaily = calculateNextDueDate('2026-10-26', 'daily');
  assert.equal(nextDaily, '2026-10-27');

  const nextWeekly = calculateNextDueDate('2026-10-26', 'weekly');
  assert.equal(nextWeekly, '2026-11-02');
});

test('Note validation and word count computation work accurately', () => {
  const invalidNote = validateNoteInput({ title: '', content: '   ' });
  assert.equal(invalidNote.valid, false);

  const validNote = validateNoteInput({
    title: 'Architecture Note',
    content: 'Local IndexedDB storage via Dexie provides fast offline access.',
    tags: ['architecture'],
  });
  assert.equal(validNote.valid, true);

  const stats = computeNoteStats('One two three four five.');
  assert.equal(stats.words, 5);
  assert.equal(stats.readingTimeMinutes, 1);
});

test('Search stored notes returns accurate citations and never invents results', () => {
  const pythonHits = searchStoredNotes(SAMPLE_NOTES, 'Python');
  assert.equal(pythonHits.length, 1);
  assert.equal(pythonHits[0].title, 'Python Asyncio Guide');
  assert.ok(pythonHits[0].excerpt.includes('TaskGroup'));

  const nonexistentHits = searchStoredNotes(SAMPLE_NOTES, 'Rust Borrow Checker');
  assert.equal(nonexistentHits.length, 0);
});

test('Offline Command Assistant parses help, add task, list tasks, complete task, note, search, summarize, and plan my day', () => {
  const ctx = { tasks: SAMPLE_TASKS, notes: SAMPLE_NOTES, dailyFocus: 'Ship release', now: SAMPLE_NOW };

  // help
  const helpRes = processOfflineCommand('help', ctx);
  assert.equal(helpRes.matchedCommand, 'help');
  assert.ok(helpRes.reply.includes('add task'));

  // add task
  const addRes = processOfflineCommand('add task Audit security headers today !high #Security', ctx);
  assert.equal(addRes.matchedCommand, 'add_task');
  assert.equal(addRes.toolProposals.length, 1);
  assert.equal(addRes.toolProposals[0].payload.priority, 'high');
  assert.equal(addRes.toolProposals[0].payload.category, 'Security');

  // list tasks
  const listRes = processOfflineCommand('list tasks', ctx);
  assert.equal(listRes.matchedCommand, 'list_tasks');
  assert.ok(listRes.reply.includes('Review Q4 budget'));

  // complete task
  const compRes = processOfflineCommand('complete task Review Q4', ctx);
  assert.equal(compRes.matchedCommand, 'complete_task');
  assert.equal(compRes.toolProposals.length, 1);
  assert.equal(compRes.toolProposals[0].payload.taskId, 't1');

  // note
  const noteRes = processOfflineCommand('note Remember to test service worker offline fallback #pwa', ctx);
  assert.equal(noteRes.matchedCommand, 'note');
  assert.equal(noteRes.toolProposals.length, 1);
  assert.ok(noteRes.toolProposals[0].payload.tags?.includes('pwa'));

  // search notes
  const searchRes = processOfflineCommand('Find my notes about Python', ctx);
  assert.equal(searchRes.matchedCommand, 'search_notes');
  assert.equal(searchRes.citations.length, 1);
  assert.equal(searchRes.citations[0].noteId, 'n1');

  // summarize
  const sumRes = processOfflineCommand(
    'summarize: IndexedDB stores structured records locally. Service workers cache static assets for offline reliability. Users can export versioned JSON backups anytime.',
    ctx
  );
  assert.equal(sumRes.matchedCommand, 'summarize');
  assert.ok(sumRes.reply.includes('Extractive Summary'));

  // plan my day
  const planRes = processOfflineCommand('Plan my day', ctx);
  assert.equal(planRes.matchedCommand, 'plan_day');
  assert.ok(planRes.reply.includes('Ship release'));
  assert.ok(planRes.reply.includes('Review Q4 budget'));
});

test('Offline summarizer, title suggestion, and action item extractor work deterministically', () => {
  const sum = summarizeTextOffline(
    'First key architectural decision is using IndexedDB. Second decision is zero cloud leakage by default. Third point is mobile ergonomics.',
    2
  );
  assert.equal(sum.bulletPoints.length, 2);

  const title = suggestNoteTitleOffline('# Sprint Retrospective\nWe completed all offline tests.');
  assert.equal(title, 'Sprint Retrospective');

  const extracted = extractActionItemsOffline(
    '- [ ] Review pull request !high\n- [ ] Update README documentation'
  );
  assert.equal(extracted.length, 2);
  assert.equal(extracted[0].priority, 'high');
});

test('Versioned JSON backup validator accepts valid v1 payloads and rejects malformed data', () => {
  const badBackup = validateBackupPayload({ app: 'OtherApp', schemaVersion: 99 });
  assert.equal(badBackup.valid, false);
  assert.ok(badBackup.errors.length >= 2);

  const goodBackup = validateBackupPayload({
    app: 'MyAI Hub',
    schemaVersion: 1,
    exportedAt: '2026-10-26T12:00:00Z',
    data: {
      tasks: SAMPLE_TASKS,
      notes: SAMPLE_NOTES,
      conversations: [],
      messages: [],
    },
  });
  assert.equal(goodBackup.valid, true);
  assert.equal(goodBackup.payload?.data.tasks.length, 2);
  assert.equal(goodBackup.payload?.data.notes.length, 2);
});
