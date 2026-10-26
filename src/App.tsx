import React, { useState } from 'react';
import { AppProvider, useApp } from './app/AppContext';
import { Layout } from './components/Layout';
import { ChatView } from './features/chat/ChatView';
import { DashboardView } from './features/dashboard/DashboardView';
import { NotesView } from './features/notes/NotesView';
import { SettingsView } from './features/settings/SettingsView';
import { TasksView } from './features/tasks/TasksView';

const WorkspaceRouter: React.FC = () => {
  const { activeTab, setActiveTab, isLoadingDB } = useApp();
  const [newTaskTrigger, setNewTaskTrigger] = useState(0);

  const handleGlobalNewTask = () => {
    setActiveTab('tasks');
    setNewTaskTrigger((prev) => prev + 1);
  };

  return (
    <Layout onQuickNewTask={handleGlobalNewTask}>
      {isLoadingDB ? (
        <div
          role="status"
          aria-label="Loading workspace"
          className="space-y-4 py-6 animate-pulse"
        >
          <div className="h-8 w-56 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
          </div>
          <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
        </div>
      ) : (
        <>
          {activeTab === 'dashboard' && (
            <DashboardView onOpenNewTaskModal={handleGlobalNewTask} />
          )}
          {activeTab === 'assistant' && <ChatView />}
          {activeTab === 'tasks' && (
            <TasksView externalNewTaskTrigger={newTaskTrigger} />
          )}
          {activeTab === 'notes' && <NotesView />}
          {activeTab === 'settings' && <SettingsView />}
        </>
      )}
    </Layout>
  );
};

export default function App() {
  return (
    <AppProvider>
      <WorkspaceRouter />
    </AppProvider>
  );
}
