"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ProjectView } from "@/components/ProjectView";
import { SearchResults } from "@/components/SearchResults";
import { Dashboard } from "@/components/Dashboard";
import BoardView from "@/components/BoardView";
import LineageView from "@/components/LineageView";
import TeamMembersPanel from "@/components/TeamMembersPanel";
import { api } from "@/lib/api";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import type { ProjectSummary, ProjectWithSections, Sprint, TaskWithRelations } from "@/lib/types";
import { TaskDetail } from "@/components/TaskDetail";
import UserManagement from "@/components/UserManagement";

export default function Home() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectWithSections | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const collapseAllRef = useRef<(() => void) | null>(null);
  const [filterHighPriority, setFilterHighPriority] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<"list" | "board" | "lineage">("list");
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [boardSelectedTaskId, setBoardSelectedTaskId] = useState<string | null>(null);
  const [boardSelectedTask, setBoardSelectedTask] = useState<TaskWithRelations | null>(null);
  const [boardRefreshKey, setBoardRefreshKey] = useState(0);
  const [boardPanelCollapsed, setBoardPanelCollapsed] = useState(false);
  const [boardSidePanelHidden, setBoardSidePanelHidden] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; role: string; projectId: string | null } | null>(null);
  const [showUserMgmt, setShowUserMgmt] = useState(false);

  const isViewer = currentUser?.role === "VIEWER";

  // Load current user on mount
  useEffect(() => {
    api.auth.me().then((res) => {
      setCurrentUser(res.user);
      // Auto-select the viewer's scoped project
      if (res.user?.role === "VIEWER" && res.user.projectId) {
        setActiveProjectId(res.user.projectId);
      }
    }).catch(() => {
      window.location.href = "/login";
    });
  }, []);

  const loadProjects = useCallback(async () => {
    const data = await api.projects.list();
    setProjects(data as ProjectSummary[]);
    setLoading(false);
  }, []);

  const loadProject = useCallback(async (id: string) => {
    const data = await api.projects.get(id);
    setActiveProject(data as ProjectWithSections);
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Auto-collapse sidebar when window shrinks below lg breakpoint
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => {
      if (!e.matches) setSidebarOpen(false);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (activeProjectId) {
      loadProject(activeProjectId);
      // Load sprints for the active project
      api.sprints.list(activeProjectId).then((data) => setSprints(data as Sprint[])).catch(() => setSprints([]));
    } else {
      setActiveProject(null);
      setSprints([]);
      setViewMode("list");
    }
  }, [activeProjectId, loadProject]);

  // Load full task for board detail panel
  useEffect(() => {
    if (boardSelectedTaskId) {
      api.tasks.get(boardSelectedTaskId).then((t) => setBoardSelectedTask(t as TaskWithRelations)).catch(() => setBoardSelectedTask(null));
    } else {
      setBoardSelectedTask(null);
    }
  }, [boardSelectedTaskId]);

  const refreshProject = useCallback(() => {
    if (activeProjectId) {
      loadProject(activeProjectId);
      api.sprints.list(activeProjectId).then((data) => setSprints(data as Sprint[])).catch(() => setSprints([]));
    }
    loadProjects();
  }, [activeProjectId, loadProject, loadProjects]);

  // Poll Trello for changes on any synced sprint every 15s (works in both list and board view)
  useEffect(() => {
    const syncedSprint = sprints.find((s) => s.trelloBoardId);
    if (!syncedSprint) return;
    const interval = setInterval(async () => {
      try {
        const result = await api.trello.poll(syncedSprint.id);
        if (result?.changes && result.changes.length > 0) {
          refreshProject();
          // Also refresh the board task detail if open
          if (boardSelectedTaskId) {
            api.tasks.get(boardSelectedTaskId).then((t) => setBoardSelectedTask(t as TaskWithRelations)).catch(() => {});
          }
        }
      } catch {
        // Silently ignore poll errors
      }
    }, 15_000);
    return () => clearInterval(interval);
  }, [sprints, refreshProject, boardSelectedTaskId]);

  const { pushAction, undo, redo, canUndo, canRedo, clear: clearUndoHistory } = useUndoRedo(refreshProject);

  // Clear undo history on project switch
  useEffect(() => {
    clearUndoHistory();
  }, [activeProjectId, clearUndoHistory]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearchQuery("");
        searchRef.current?.blur();
      }
      // Undo/Redo (only when not typing in an input)
      const el = document.activeElement;
      const isEditing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable;
      if (!isEditing && (e.metaKey || e.ctrlKey)) {
        const key = e.key.toLowerCase();
        if (key === "z" && !e.shiftKey) {
          e.preventDefault();
          undo();
        } else if (key === "y" || (key === "z" && e.shiftKey)) {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  // Mobile shake gesture for undo
  useEffect(() => {
    if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return;
    let lastX = 0, lastY = 0, lastZ = 0;
    let lastShakeTime = 0;
    const handleMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      const dx = Math.abs(acc.x - lastX);
      const dy = Math.abs(acc.y - lastY);
      const dz = Math.abs(acc.z - lastZ);
      if (dx + dy + dz > 30) {
        const now = Date.now();
        if (now - lastShakeTime > 1500) {
          lastShakeTime = now;
          undo();
        }
      }
      lastX = acc.x; lastY = acc.y; lastZ = acc.z;
    };
    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [undo]);

  // Warn on tab close if any creation inputs have unsaved content
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        '[data-unsaved-check]'
      );
      const hasUnsaved = Array.from(inputs).some((el) => el.value.trim());
      if (hasUnsaved) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const isSearching = searchQuery.trim().length > 0;

  const projectProgress = useMemo(() => {
    if (!activeProject) return null;
    let total = 0;
    let completed = 0;
    const countTasks = (tasks: { completed: boolean; subtasks: { completed: boolean; subtasks: any[] }[] }[]) => {
      for (const t of tasks) {
        total++;
        if (t.completed) completed++;
        if (t.subtasks?.length) countTasks(t.subtasks);
      }
    };
    for (const s of activeProject.sections) countTasks(s.tasks);
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pct };
  }, [activeProject]);

  return (
    <div className="flex h-screen bg-white">
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={(id) => {
          setActiveProjectId(id);
          setSearchQuery("");
          setViewMode("list");
        }}
        onProjectsChange={loadProjects}
        onReorderProjects={setProjects}
        onGoHome={isViewer ? undefined : () => { setActiveProjectId(null); setSearchQuery(""); }}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        readOnly={isViewer}
        currentUser={currentUser}
        onShowUserMgmt={() => setShowUserMgmt(true)}
        onLogout={async () => {
          await api.auth.logout();
          window.location.href = "/login";
        }}
      />

      <main className="flex-1 overflow-hidden flex flex-col">
        <header className="h-14 border-b border-gray-300 flex items-center px-4 gap-3 shrink-0 bg-gray-200">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-2 hover:bg-gray-300 rounded-lg lg:hidden`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {!isSearching && activeProject && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: activeProject.color }} />
              <h1 className="font-semibold text-gray-900">{activeProject.name}</h1>
              <div className="flex items-center gap-0.5 ml-1">
                {!isViewer && (
                <>
                <button
                  onClick={undo}
                  disabled={!canUndo}
                  className="p-1 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-default text-gray-500 transition-colors"
                  title="Undo (Ctrl+Z)"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10l5-5M3 10l5 5M3 10h13a5 5 0 010 10h-3" />
                  </svg>
                </button>
                <button
                  onClick={redo}
                  disabled={!canRedo}
                  className="p-1 rounded hover:bg-gray-300 disabled:opacity-30 disabled:cursor-default text-gray-500 transition-colors"
                  title="Redo (Ctrl+Y)"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10l-5-5M21 10l-5 5M21 10H8a5 5 0 000 10h3" />
                  </svg>
                </button>
                </>
                )}

                <div className="w-px h-4 bg-gray-400/50 mx-1.5" />

                <button
                  onClick={() => collapseAllRef.current?.()}
                  className="p-1 rounded hover:bg-gray-300 text-gray-500 transition-colors"
                  title="Collapse all sections"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16M8 10l4 4 4-4M4 20h16M8 14l4-4 4 4" />
                  </svg>
                </button>

                <div className="w-px h-4 bg-gray-400/50 mx-1.5" />

                <button
                  onClick={() => setFilterHighPriority((v) => !v)}
                  className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
                    filterHighPriority
                      ? "bg-red-100 text-red-600 hover:bg-red-200"
                      : "text-gray-500 hover:bg-gray-300"
                  }`}
                  title="Filter high priority tasks"
                >
                  High
                </button>
                <button
                  onClick={() => setHideCompleted((v) => !v)}
                  className={`p-1 rounded transition-colors ${hideCompleted ? "bg-green-100 text-green-600 hover:bg-green-200" : "text-gray-500 hover:bg-gray-300"}`}
                  title={hideCompleted ? "Show completed tasks" : "Hide completed tasks"}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    {hideCompleted && <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4l16 16" />}
                  </svg>
                </button>

                {projectProgress && projectProgress.total > 0 && (
                  <>
                  <div className="w-px h-4 bg-gray-400/50 mx-1.5" />
                  <div className="flex items-center gap-2" title={`${projectProgress.completed} of ${projectProgress.total} tasks completed`}>
                    <div className="w-24 h-2 bg-gray-300 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all duration-300"
                        style={{ width: `${projectProgress.pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums">{projectProgress.pct}%</span>
                  </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* View toggle buttons */}
          {!isSearching && activeProject && (
            <div className="flex items-center gap-1 ml-2">
              <div className="w-px h-4 bg-gray-400/50 mx-1" />
              <button
                onClick={() => setViewMode("list")}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === "list" ? "bg-gray-300 text-gray-700" : "text-gray-500 hover:bg-gray-300"}`}
                title="Switch to list view"
              >
                ☰ Tasks
              </button>
              {sprints.length > 0 ? (
                <button
                  onClick={() => setViewMode("board")}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === "board" ? "bg-gray-300 text-gray-700" : "text-gray-500 hover:bg-gray-300"}`}
                  title="Switch to board view"
                >
                  ▦ Sprints
                </button>
              ) : !isViewer ? (
                <button
                  onClick={async () => {
                    if (activeProjectId) {
                      await api.sprints.create(activeProjectId);
                      const data = await api.sprints.list(activeProjectId);
                      setSprints(data as Sprint[]);
                      setViewMode("board");
                    }
                  }}
                  className="px-2 py-1 rounded text-xs font-medium text-gray-500 hover:bg-gray-300 transition-colors"
                  title="Create first sprint and open board view"
                >
                  + Add Sprint
                </button>
              ) : null}
              <button
                onClick={() => setViewMode("lineage")}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${viewMode === "lineage" ? "bg-gray-300 text-gray-700" : "text-gray-500 hover:bg-gray-300"}`}
                title="Switch to lineage view"
              >
                ◈ Lineage
              </button>
            </div>
          )}

          <div className={`${isSearching ? "flex-1" : "ml-auto w-80"}`}>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks…"
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-gray-300 hover:bg-gray-400/50 focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-lg outline-none transition-colors"
              />
            </div>
          </div>

        </header>

        <div className="flex-1 overflow-auto">
          {isSearching ? (
            <SearchResults
              query={searchQuery}
              onSelectTask={(task) => {
                setActiveProjectId(task.section?.project?.id || null);
                setPendingTaskId(task.id);
                setSearchQuery("");
              }}
            />
          ) : loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">Loading...</div>
          ) : !activeProject ? (
            <Dashboard onSelectProject={(id, taskId) => { setActiveProjectId(id); setPendingTaskId(taskId ?? null); setSearchQuery(""); }} />
          ) : viewMode === "board" ? (
            <div className="flex h-full overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <BoardView
                  projectId={activeProject.id}
                  projectName={activeProject.name}
                  sprintDuration={activeProject.sprintDuration}
                  sprintStartDay={activeProject.sprintStartDay}
                  sprintStartDate={activeProject.sprintStartDate}
                  onSelectTask={(task) => {
                    if (task.id === boardSelectedTaskId && !boardPanelCollapsed) {
                      setBoardPanelCollapsed(true);
                    } else {
                      setBoardSelectedTaskId(task.id);
                      setBoardPanelCollapsed(false);
                    }
                  }}
                  onDeselect={() => { setBoardSelectedTaskId(null); setBoardSelectedTask(null); setBoardPanelCollapsed(false); }}
                  selectedTaskId={boardSelectedTaskId}
                  onRefresh={refreshProject}
                  refreshKey={boardRefreshKey}
                  readOnly={isViewer}
                />
              </div>
              {boardSelectedTask && !boardPanelCollapsed ? (
                <div className="relative h-full overflow-hidden">
                  <TaskDetail
                    task={boardSelectedTask}
                    projectId={activeProject.id}
                    onClose={() => setBoardPanelCollapsed(true)}
                    onRefresh={() => {
                      if (boardSelectedTaskId) {
                        api.tasks.get(boardSelectedTaskId).then((t) => setBoardSelectedTask(t as TaskWithRelations)).catch(() => {});
                      }
                      setBoardRefreshKey((k) => k + 1);
                      refreshProject();
                    }}
                    onSelectTask={async (taskId) => {
                      setBoardSelectedTaskId(taskId);
                      const full = await api.tasks.get(taskId);
                      setBoardSelectedTask(full as TaskWithRelations);
                    }}
                    storageKey="boardDetailPanelWidth"
                    defaultWidth="md:w-[380px] lg:w-[420px] xl:w-[480px]"
                    readOnly={isViewer}
                  />
                </div>
              ) : boardSelectedTask && boardPanelCollapsed ? (
                <div className="border-l border-gray-200 bg-gray-50 flex flex-col items-center py-3 px-1">
                  <button
                    onClick={() => setBoardPanelCollapsed(false)}
                    className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600 transition-colors"
                    title="Expand task panel"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>
              ) : !boardSidePanelHidden ? (
                <TeamMembersPanel onClose={() => setBoardSidePanelHidden(true)} />
              ) : (
                <div className="border-l border-gray-200 bg-gray-50 flex flex-col items-center py-3 px-1">
                  <button
                    onClick={() => setBoardSidePanelHidden(false)}
                    className="p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-gray-600 transition-colors"
                    title="Show team panel"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ) : viewMode === "lineage" ? (
            <div className="flex h-full overflow-hidden">
              <div className="flex-1 overflow-hidden">
                <LineageView
                  projectId={activeProject.id}
                  selectedTaskId={boardSelectedTaskId}
                  onSelectTask={async (taskId) => {
                    setBoardSelectedTaskId(taskId);
                    setBoardPanelCollapsed(false);
                    const full = await api.tasks.get(taskId);
                    setBoardSelectedTask(full as TaskWithRelations);
                  }}
                  onDeselectTask={() => {
                    setBoardSelectedTaskId(null);
                    setBoardSelectedTask(null);
                    setBoardPanelCollapsed(true);
                  }}
                  readOnly={isViewer}
                />
              </div>
              {boardSelectedTask && !boardPanelCollapsed && (
                <div className="relative h-full overflow-hidden">
                  <TaskDetail
                    task={boardSelectedTask}
                    projectId={activeProject.id}
                    onClose={() => { setBoardPanelCollapsed(true); setBoardSelectedTaskId(null); setBoardSelectedTask(null); }}
                    onRefresh={async () => {
                      if (boardSelectedTaskId) {
                        api.tasks.get(boardSelectedTaskId).then((t) => setBoardSelectedTask(t as TaskWithRelations)).catch(() => {});
                      }
                      refreshProject();
                    }}
                    onSelectTask={async (taskId) => {
                      setBoardSelectedTaskId(taskId);
                      const full = await api.tasks.get(taskId);
                      setBoardSelectedTask(full as TaskWithRelations);
                    }}
                    storageKey="lineageDetailPanelWidth"
                    defaultWidth="md:w-[380px] lg:w-[420px] xl:w-[480px]"
                    readOnly={isViewer}
                  />
                </div>
              )}
            </div>
          ) : (
            <ProjectView project={activeProject} onRefresh={refreshProject} pushAction={pushAction} initialTaskId={pendingTaskId} onInitialTaskConsumed={() => setPendingTaskId(null)} collapseAllRef={collapseAllRef} filterHighPriority={filterHighPriority} hideCompleted={hideCompleted} readOnly={isViewer} />
          )}
        </div>
      </main>
      {showUserMgmt && <UserManagement onClose={() => setShowUserMgmt(false)} projects={projects} />}
    </div>
  );
}
