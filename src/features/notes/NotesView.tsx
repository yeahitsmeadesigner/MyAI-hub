import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Download,
  Eye,
  FileEdit,
  Pin,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { sendCloudNoteAssistRequest } from '../../lib/cloudAiClient';
import {
  extractActionItemsOffline,
  suggestNoteTitleOffline,
  summarizeTextOffline,
} from '../../lib/offlineAssistant';
import { computeNoteStats } from '../../lib/validation';
import type { NoteItem, TaskPriority } from '../../types';

type NoteSortBy = 'updatedAt' | 'createdAt' | 'title';

export const NotesView: React.FC = () => {
  const {
    notes,
    settings,
    selectedNoteId,
    setSelectedNoteId,
    createNote,
    updateNote,
    deleteNote,
    toggleNotePin,
    createTask,
    showToast,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [sortBy, setSortBy] = useState<NoteSortBy>('updatedAt');

  // Editor state
  const activeNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [draftTagsInput, setDraftTagsInput] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Unsaved change switch guard
  const [pendingSwitchNoteId, setPendingSwitchNoteId] = useState<string | null>(null);
  // Delete confirmation modal
  const [noteToDelete, setNoteToDelete] = useState<NoteItem | null>(null);

  // Smart AI Assist output panel
  const [aiSummaryResult, setAiSummaryResult] = useState<string | null>(null);
  const [extractedTasks, setExtractedTasks] = useState<
    { title: string; priority: TaskPriority; category: string; saved?: boolean }[]
  >([]);
  const [isRunningAiTool, setIsRunningAiTool] = useState(false);

  // Sync draft state when activeNote changes
  useEffect(() => {
    if (activeNote) {
      setDraftTitle(activeNote.title);
      setDraftContent(activeNote.content);
      setDraftTagsInput(activeNote.tags.join(', '));
      setIsDirty(false);
      setAiSummaryResult(null);
      setExtractedTasks([]);
    } else {
      setDraftTitle('');
      setDraftContent('');
      setDraftTagsInput('');
      setIsDirty(false);
    }
  }, [activeNote?.id]);

  // Autosave after 1.2s of inactivity when dirty
  useEffect(() => {
    if (!isDirty || !activeNote) return;
    const timer = setTimeout(async () => {
      const parsedTags = draftTagsInput
        .split(',')
        .map((t) => t.trim().replace(/^#/, '').toLowerCase())
        .filter(Boolean);
      await updateNote(activeNote.id, {
        title: draftTitle.trim() || 'Untitled Note',
        content: draftContent,
        tags: parsedTags,
      });
      setIsDirty(false);
    }, 1200);
    return () => clearTimeout(timer);
  }, [isDirty, draftTitle, draftContent, draftTagsInput, activeNote, updateNote]);

  const handleExplicitSave = async () => {
    if (!activeNote) return;
    const parsedTags = draftTagsInput
      .split(',')
      .map((t) => t.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean);
    const res = await updateNote(activeNote.id, {
      title: draftTitle.trim() || 'Untitled Note',
      content: draftContent,
      tags: parsedTags,
    });
    if (res.ok) {
      setIsDirty(false);
      showToast('Note saved to IndexedDB', 'success');
    } else {
      showToast(res.errors?.[0] || 'Could not save note', 'error');
    }
  };

  const handleSelectNote = (targetId: string) => {
    if (targetId === selectedNoteId) return;
    if (isDirty) {
      setPendingSwitchNoteId(targetId);
      return;
    }
    setSelectedNoteId(targetId);
  };

  const handleCreateNewNote = async () => {
    if (isDirty && activeNote) {
      await handleExplicitSave();
    }
    await createNote({
      title: 'New Smart Note',
      content: '# New Smart Note\n\nWrite your thoughts or action items here...',
      tags: ['notes'],
      pinned: false,
    });
    setIsPreviewMode(false);
  };

  const handleExportNote = (format: 'md' | 'txt') => {
    if (!activeNote) return;
    const filenameBase = (draftTitle || 'note')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const ext = format === 'md' ? 'md' : 'txt';
    const mime = format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
    const contentToExport =
      format === 'md'
        ? `# ${draftTitle}\n\n${draftContent}\n`
        : `${draftTitle}\n${'='.repeat(draftTitle.length)}\n\n${draftContent}\n`;

    const blob = new Blob([contentToExport], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenameBase || 'smart-note'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported note as .${ext}`, 'success');
  };

  // AI Note Tools (Offline or Cloud based on user's mode & consent)
  const handleSummarizeNote = async () => {
    if (!draftContent.trim()) {
      showToast('Add content to the note first', 'info');
      return;
    }
    setIsRunningAiTool(true);
    try {
      if (settings.aiMode === 'cloud' && settings.cloudConsentGiven) {
        const res = await sendCloudNoteAssistRequest({
          action: 'summarize',
          title: draftTitle,
          content: draftContent,
        });
        setAiSummaryResult(res.summary || 'No summary generated.');
      } else {
        const res = summarizeTextOffline(draftContent, 3);
        setAiSummaryResult(res.bulletPoints.map((b) => `• ${b}`).join('\n'));
      }
    } catch {
      const res = summarizeTextOffline(draftContent, 3);
      setAiSummaryResult(res.bulletPoints.map((b) => `• ${b}`).join('\n'));
    } finally {
      setIsRunningAiTool(false);
    }
  };

  const handleSuggestTitle = async () => {
    if (!draftContent.trim()) {
      showToast('Write some note body text first', 'info');
      return;
    }
    setIsRunningAiTool(true);
    try {
      let suggested = '';
      if (settings.aiMode === 'cloud' && settings.cloudConsentGiven) {
        const res = await sendCloudNoteAssistRequest({
          action: 'suggest_title',
          title: draftTitle,
          content: draftContent,
        });
        suggested = res.suggestedTitle || suggestNoteTitleOffline(draftContent);
      } else {
        suggested = suggestNoteTitleOffline(draftContent);
      }
      setDraftTitle(suggested);
      setIsDirty(true);
      showToast(`Suggested title applied: "${suggested}"`, 'success');
    } catch {
      const suggested = suggestNoteTitleOffline(draftContent);
      setDraftTitle(suggested);
      setIsDirty(true);
    } finally {
      setIsRunningAiTool(false);
    }
  };

  const handleExtractActionItems = async () => {
    if (!draftContent.trim()) {
      showToast('Add content to extract action items from', 'info');
      return;
    }
    setIsRunningAiTool(true);
    try {
      if (settings.aiMode === 'cloud' && settings.cloudConsentGiven) {
        const res = await sendCloudNoteAssistRequest({
          action: 'extract_tasks',
          title: draftTitle,
          content: draftContent,
        });
        setExtractedTasks(res.extractedTasks ?? extractActionItemsOffline(draftContent));
      } else {
        setExtractedTasks(extractActionItemsOffline(draftContent));
      }
    } catch {
      setExtractedTasks(extractActionItemsOffline(draftContent));
    } finally {
      setIsRunningAiTool(false);
    }
  };

  const allTags = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.tags.forEach((t) => set.add(t)));
    return Array.from(set);
  }, [notes]);

  const filteredNotes = useMemo(() => {
    return notes
      .filter((n) => {
        if (selectedTag !== 'all' && !n.tags.includes(selectedTag)) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          return (
            n.title.toLowerCase().includes(q) ||
            n.content.toLowerCase().includes(q) ||
            n.tags.some((t) => t.toLowerCase().includes(q))
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        if (sortBy === 'title') return a.title.localeCompare(b.title);
        if (sortBy === 'createdAt') return b.createdAt.localeCompare(a.createdAt);
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [notes, selectedTag, searchQuery, sortBy]);

  const stats = useMemo(() => computeNoteStats(draftContent), [draftContent]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Smart Notes</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Local Markdown knowledge base with autosave, tag filtering, export, and on-device AI extraction
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreateNewNote}
          className="self-start sm:self-auto min-h-[42px] px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shadow-xs"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>New Smart Note</span>
        </button>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar: Search, Filter & Note List (4 cols on desktop) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="relative">
            <label htmlFor="notes-search-input" className="sr-only">
              Search Smart Notes
            </label>
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              aria-hidden="true"
            />
            <input
              id="notes-search-input"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes by title, content, or #tag..."
              className="w-full min-h-[42px] pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-2 focus:outline-teal-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="notes-tag-filter" className="sr-only">
                Filter by tag
              </label>
              <select
                id="notes-tag-filter"
                value={selectedTag}
                onChange={(e) => setSelectedTag(e.target.value)}
                className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="all">All Tags</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    #{tag}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="notes-sort-select" className="sr-only">
                Sort notes
              </label>
              <select
                id="notes-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as NoteSortBy)}
                className="w-full min-h-[38px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-200"
              >
                <option value="updatedAt">Sort: Updated</option>
                <option value="createdAt">Sort: Created</option>
                <option value="title">Sort: Title</option>
              </select>
            </div>
          </div>

          {/* Notes List Container */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 max-h-[540px] overflow-y-auto">
            {filteredNotes.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No matching notes found.
                </p>
                <button
                  type="button"
                  onClick={handleCreateNewNote}
                  className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-teal-600 text-xs font-semibold"
                >
                  Create Note
                </button>
              </div>
            ) : (
              filteredNotes.map((note) => {
                const isSelected = note.id === selectedNoteId;
                const snippet = note.content
                  .replace(/^[#>*\-\s]+/gm, ' ')
                  .replace(/[*`_~]/g, '')
                  .replace(/\s+/g, ' ')
                  .trim()
                  .slice(0, 90);
                return (
                  <div
                    key={note.id}
                    className={`p-3.5 transition-colors ${
                      isSelected
                        ? 'bg-teal-50/70 dark:bg-teal-950/30'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectNote(note.id)}
                        className="flex-1 text-left min-w-0"
                      >
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                          {note.pinned && (
                            <Pin
                              className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0"
                              aria-label="Pinned"
                            />
                          )}
                          <span className="truncate">{note.title}</span>
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {snippet || 'Empty note'}
                        </p>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 font-mono tabular-nums">
                          {new Date(note.updatedAt).toLocaleDateString()}
                          {note.tags.length > 0 && ` · ${note.tags.map((t) => `#${t}`).join(' · ')}`}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleNotePin(note.id)}
                        aria-label={note.pinned ? `Unpin "${note.title}"` : `Pin "${note.title}"`}
                        className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg ${
                          note.pinned
                            ? 'text-teal-600 dark:text-teal-400'
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Workspace: Editor, Markdown Preview & Smart AI Tools (8 cols on desktop) */}
        <div className="lg:col-span-8">
          {!activeNote ? (
            <div className="p-12 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                Select a note from the list or create a new Smart Note
              </p>
              <button
                type="button"
                onClick={handleCreateNewNote}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700"
              >
                Create Smart Note
              </button>
            </div>
          ) : (
            <div className="p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-4">
              {/* Editor Top Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsPreviewMode(false)}
                    className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      !isPreviewMode
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <FileEdit className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Edit Markdown</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPreviewMode(true)}
                    className={`min-h-[34px] px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                      isPreviewMode
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Preview</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono tabular-nums">
                    {isDirty ? 'Unsaved changes...' : 'All changes saved'}
                  </span>

                  <button
                    type="button"
                    onClick={handleExplicitSave}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg bg-slate-900 text-white dark:bg-teal-600 text-xs font-semibold flex items-center gap-1.5 hover:opacity-90"
                  >
                    <Save className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Save</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportNote('md')}
                    aria-label="Export note as Markdown"
                    className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>.MD</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportNote('txt')}
                    aria-label="Export note as plain text"
                    className="min-h-[36px] px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>.TXT</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNoteToDelete(activeNote)}
                    aria-label={`Delete note "${activeNote.title}"`}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Title & Tags Inputs */}
              <div className="space-y-3">
                <div>
                  <label htmlFor="note-title-input" className="sr-only">
                    Note Title
                  </label>
                  <input
                    id="note-title-input"
                    type="text"
                    value={draftTitle}
                    onChange={(e) => {
                      setDraftTitle(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="Note Title..."
                    className="w-full text-lg sm:text-xl font-bold bg-transparent text-slate-900 dark:text-white border-b border-transparent focus:border-slate-300 dark:focus:border-slate-700 pb-1 focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor="note-tags-input"
                    className="text-xs font-medium text-slate-500 shrink-0"
                  >
                    Tags (comma-separated):
                  </label>
                  <input
                    id="note-tags-input"
                    type="text"
                    value={draftTagsInput}
                    onChange={(e) => {
                      setDraftTagsInput(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="python, architecture, meeting"
                    className="flex-1 min-h-[34px] px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-200 focus:outline-2 focus:outline-teal-600"
                  />
                </div>
              </div>

              {/* Body Editor or Preview */}
              {!isPreviewMode ? (
                <div>
                  <label htmlFor="note-content-textarea" className="sr-only">
                    Note Markdown Content
                  </label>
                  <textarea
                    id="note-content-textarea"
                    rows={14}
                    value={draftContent}
                    onChange={(e) => {
                      setDraftContent(e.target.value);
                      setIsDirty(true);
                    }}
                    placeholder="Write in Markdown (# Headings, - Lists, - [ ] Checkboxes, `code`)..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 p-4 text-sm font-mono leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-2 focus:outline-teal-600"
                  />
                </div>
              ) : (
                <div className="min-h-[320px] p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/50">
                  <MarkdownRenderer content={draftContent} />
                </div>
              )}

              {/* Smart AI Note Tools Bar */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                    <span>Smart Note Actions ({settings.aiMode === 'cloud' && settings.cloudConsentGiven ? 'Cloud AI' : 'Offline Extractive Engine'}):</span>
                  </span>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={isRunningAiTool}
                      onClick={handleSummarizeNote}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
                    >
                      Summarize Note
                    </button>
                    <button
                      type="button"
                      disabled={isRunningAiTool}
                      onClick={handleSuggestTitle}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
                    >
                      Suggest Title
                    </button>
                    <button
                      type="button"
                      disabled={isRunningAiTool}
                      onClick={handleExtractActionItems}
                      className="min-h-[34px] px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
                    >
                      Extract Action Items
                    </button>
                  </div>
                </div>

                {/* AI Summary Output Box */}
                {aiSummaryResult && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                        Generated Note Summary (Suggestion)
                      </p>
                      <button
                        type="button"
                        onClick={() => setAiSummaryResult(null)}
                        aria-label="Close summary"
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
                      {aiSummaryResult}
                    </p>
                  </div>
                )}

                {/* Extracted Action Items Box */}
                {extractedTasks.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
                        Extracted Action Items — Confirm to Add to Tasks ({extractedTasks.length})
                      </p>
                      <button
                        type="button"
                        onClick={() => setExtractedTasks([])}
                        aria-label="Close extracted tasks"
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
                      {extractedTasks.map((item, idx) => (
                        <div
                          key={idx}
                          className="py-2 flex items-center justify-between gap-3 text-xs"
                        >
                          <div>
                            <p className="font-medium text-slate-900 dark:text-white">
                              {item.title}
                            </p>
                            <p className="text-slate-500">
                              {item.priority} priority · {item.category}
                            </p>
                          </div>
                          {item.saved ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 shrink-0">
                              <Check className="w-3.5 h-3.5" />
                              <span>Saved</span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={async () => {
                                await createTask({
                                  title: item.title,
                                  description: `Extracted from note "${draftTitle}"`,
                                  priority: item.priority,
                                  category: item.category,
                                });
                                setExtractedTasks((prev) =>
                                  prev.map((t, i) => (i === idx ? { ...t, saved: true } : t))
                                );
                              }}
                              className="min-h-[32px] px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold shrink-0"
                            >
                              Add to Tasks
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Metadata & Word Counts (Unboxed Zero-Pill Text with Tabular Numerals) */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 dark:text-slate-500 font-mono tabular-nums">
                <div>
                  <span>{stats.words} words</span>
                  <span aria-hidden="true"> · </span>
                  <span>{stats.characters} chars</span>
                  <span aria-hidden="true"> · </span>
                  <span>{stats.readingTimeMinutes} min read</span>
                </div>
                <div>
                  <span>Updated {new Date(activeNote.updatedAt).toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Unsaved Changes Guard Modal */}
      {pendingSwitchNoteId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="unsaved-note-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h2 id="unsaved-note-title" className="text-base font-bold text-slate-900 dark:text-white">
              Unsaved Note Changes
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              You have unsaved edits in <strong>"{draftTitle}"</strong>. Would you like to save them before switching notes?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDirty(false);
                  setSelectedNoteId(pendingSwitchNoteId);
                  setPendingSwitchNoteId(null);
                }}
                className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleExplicitSave();
                  setSelectedNoteId(pendingSwitchNoteId);
                  setPendingSwitchNoteId(null);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold"
              >
                Save & Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Note Confirmation Modal */}
      {noteToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-note-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-xl">
            <h2 id="delete-note-title" className="text-base font-bold text-slate-900 dark:text-white">
              Delete Smart Note?
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete <strong>"{noteToDelete.title}"</strong> from IndexedDB? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNoteToDelete(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  await deleteNote(noteToDelete.id);
                  setNoteToDelete(null);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
