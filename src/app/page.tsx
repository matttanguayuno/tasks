"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { ProjectView } from "@/components/ProjectView";
import { SearchResults } from "@/components/SearchResults";
import { Dashboard } from "@/components/Dashboard";
import { api } from "@/lib/api";
import { useUndoRedo } from "@/hooks/useUndoRedo";
import type { ProjectSummary, ProjectWithSections } from "@/lib/types";

export default function Home() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectWithSections | null>(null);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const collapseAllRef = useRef<(() => void) | null>(null);
  const [filterHighPriority, setFilterHighPriority] = useState(false);
  const [loading, setLoading] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (activeProjectId) {
      loadProject(activeProjectId);
    } else {
      setActiveProject(null);
    }
  }, [activeProjectId, loadProject]);

  const refreshProject = useCallback(() => {
    if (activeProjectId) {
      loadProject(activeProjectId);
    }
    loadProjects();
  }, [activeProjectId, loadProject, loadProjects]);

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

  return (
    <div className="flex h-screen bg-white">
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={(id) => {
          setActiveProjectId(id);
          setSearchQuery("");
        }}
        onProjectsChange={loadProjects}
        onReorderProjects={setProjects}
        onGoHome={() => { setActiveProjectId(null); setSearchQuery(""); }}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      <main className="flex-1 overflow-hidden flex flex-col">
        <header className="h-14 border-b border-gray-300 flex items-center px-4 gap-3 shrink-0 bg-gray-200">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-2 hover:bg-gray-300 rounded-lg ${sidebarOpen ? "lg:hidden" : ""}`}
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
                <button
                  onClick={() => collapseAllRef.current?.()}
                  className="p-1 rounded hover:bg-gray-300 text-gray-500 transition-colors"
                  title="Collapse all sections"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h16M8 10l4 4 4-4M4 20h16M8 14l4-4 4 4" />
                  </svg>
                </button>
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
              </div>
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
          ) : (
            <ProjectView project={activeProject} onRefresh={refreshProject} pushAction={pushAction} initialTaskId={pendingTaskId} onInitialTaskConsumed={() => setPendingTaskId(null)} collapseAllRef={collapseAllRef} filterHighPriority={filterHighPriority} />
          )}
        </div>
      </main>
    </div>
  );
}
