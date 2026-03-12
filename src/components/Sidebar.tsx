"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/lib/api";
import type { ProjectSummary } from "@/lib/types";

const PROJECT_COLORS = [
  "#9ca3af", "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#06b6d4",
];

interface SidebarProps {
  projects: ProjectSummary[];
  activeProjectId: string | null;
  onSelectProject: (id: string) => void;
  onProjectsChange: () => void;
  onReorderProjects: (reordered: ProjectSummary[]) => void;
  onGoHome: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

/* ──────────────────────── Delete‑confirm modal ──────────────────────── */

function DeleteConfirmModal({
  projectName,
  onConfirm,
  onCancel,
}: {
  projectName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Delete project</h3>
        <p className="text-sm text-gray-600 mb-1">
          This will permanently delete <strong>{projectName}</strong> and all its tasks.
        </p>
        <p className="text-sm text-gray-600 mb-3">
          Type <strong>{projectName}</strong> to confirm:
        </p>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && typed === projectName) onConfirm();
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-300 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={typed !== projectName}
            className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────── Context menu ──────────────────────── */

function ContextMenu({
  x,
  y,
  currentColor,
  sortDirection,
  onDelete,
  onChangeColor,
  onSortAlphabetically,
  onClose,
}: {
  x: number;
  y: number;
  currentColor: string;
  sortDirection: "asc" | "desc";
  onDelete: () => void;
  onChangeColor: (color: string) => void;
  onSortAlphabetically: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [onClose]);

  // Keep menu inside viewport
  const style: React.CSSProperties = {
    position: "fixed",
    top: y,
    left: x,
    zIndex: 150,
  };

  return (
    <div ref={ref} style={style} className="bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px]">
      <div className="px-3 py-2">
        <span className="text-xs font-medium text-gray-500">Color</span>
        <div className="flex gap-1 mt-1.5">
          {PROJECT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => onChangeColor(c)}
              className={`w-5 h-5 rounded-full border-2 transition-colors ${
                currentColor === c ? "border-gray-800" : "border-transparent hover:border-gray-400"
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <div className="border-t border-gray-100 mt-1 pt-1">
        <button
          onClick={onSortAlphabetically}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-300 transition-colors text-left"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
          </svg>
          Sort A–Z {sortDirection === "desc" ? "(next: Z–A)" : ""}
        </button>
        <button
          onClick={onDelete}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete project
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────── Sortable project item ──────────────────────── */

function SortableProjectItem({
  project,
  isActive,
  isRenaming,
  onSelect,
  onStartRename,
  onRename,
  onContextMenu,
}: {
  project: ProjectSummary;
  isActive: boolean;
  isRenaming: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onContextMenu: (e: React.MouseEvent | { clientX: number; clientY: number }) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: project.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      onContextMenu({ clientX: touch.clientX, clientY: touch.clientY });
    }, 600);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [isRenaming]);

  const handleClick = () => {
    if (isActive) {
      onStartRename();
    } else {
      onSelect();
    }
  };

  return (
    <li ref={setNodeRef} style={style}>
      <div
        {...attributes}
        {...listeners}
        role="button"
        tabIndex={0}
        onClick={isRenaming ? undefined : handleClick}
        onKeyDown={(e) => {
          if (e.key === "F2" && isActive && !isRenaming) {
            e.preventDefault();
            onStartRename();
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e);
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd}
        className={`
          w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left cursor-grab active:cursor-grabbing
          ${isActive
            ? "bg-indigo-50 text-indigo-700 font-medium"
            : "text-gray-700 hover:bg-gray-300"
          }
        `}
      >
        <div
          className="w-3 h-3 rounded-sm shrink-0"
          style={{ backgroundColor: project.color }}
        />
        {isRenaming ? (
          <input
            ref={renameInputRef}
            defaultValue={project.name}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                const val = (e.target as HTMLInputElement).value.trim();
                if (val) onRename(val);
              }
              if (e.key === "Escape") onRename(project.name);
            }}
            onBlur={(e) => {
              const val = e.target.value.trim();
              if (val) onRename(val);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 px-1 py-0 text-sm bg-white border border-indigo-400 rounded outline-none focus:ring-1 focus:ring-indigo-500"
          />
        ) : (
          <span className="truncate">{project.name}</span>
        )}
      </div>
    </li>
  );
}

/* ──────────────────────── Sidebar ──────────────────────── */

export function Sidebar({
  projects,
  activeProjectId,
  onSelectProject,
  onProjectsChange,
  onReorderProjects,
  onGoHome,
  isOpen,
  onToggle,
}: SidebarProps) {
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectColor, setNewProjectColor] = useState(PROJECT_COLORS[0]);

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(0);
  const sidebarResizing = useRef(false);
  const sidebarStartX = useRef(0);
  const sidebarStartWidth = useRef(0);
  const sidebarRef = useRef<HTMLElement>(null);

  // Restore saved width from localStorage after mount
  useEffect(() => {
    const saved = localStorage.getItem("sidebarWidth");
    if (saved) setSidebarWidth(parseInt(saved, 10));
  }, []);

  const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    sidebarResizing.current = true;
    sidebarStartX.current = e.clientX;
    sidebarStartWidth.current = sidebarRef.current?.offsetWidth ?? 256;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!sidebarResizing.current) return;
      const delta = ev.clientX - sidebarStartX.current;
      const newWidth = Math.max(200, Math.min(500, sidebarStartWidth.current + delta));
      setSidebarWidth(newWidth);
    };
    const onUp = () => {
      sidebarResizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const width = sidebarRef.current?.offsetWidth;
      if (width) localStorage.setItem("sidebarWidth", String(width));
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    await api.projects.create({ name: newProjectName.trim(), color: newProjectColor });
    setNewProjectName("");
    setShowNewProject(false);
    onProjectsChange();
  };

  const handleDeleteProject = async () => {
    if (!deleteTarget) return;
    await api.projects.delete(deleteTarget.id);
    setDeleteTarget(null);
    onProjectsChange();
  };

  // Drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = projects.findIndex((p) => p.id === active.id);
    const newIndex = projects.findIndex((p) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistically update the list immediately
    const reordered = [...projects];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    onReorderProjects(reordered);

    // Persist in background
    const items = reordered.map((p, i) => ({ id: p.id, order: i }));
    api.reorder(items, "project").catch(() => onProjectsChange());
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        ref={sidebarRef}
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          bg-gray-200 border-r border-gray-300
          flex flex-col relative
          transform transition-transform duration-200
          ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:min-w-0 lg:overflow-hidden lg:border-0"}
          ${sidebarWidth === 0 ? "w-64" : ""}
        `}
        style={sidebarWidth > 0 ? { width: sidebarWidth } : undefined}
      >
        {/* Resize handle */}
        <div
          onMouseDown={handleSidebarResizeStart}
          className="absolute right-0 top-0 bottom-0 w-2 -mr-1 cursor-col-resize hover:bg-indigo-400 active:bg-indigo-500 z-[60] transition-colors hidden lg:block"
        />
        <div className="h-14 flex items-center px-4 border-b border-gray-300">
          <button
            onClick={onToggle}
            className="p-2 hover:bg-gray-300 rounded mr-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <button onClick={onGoHome} className="font-bold text-lg text-gray-900 hover:text-indigo-600 transition-colors">
            Tasks
          </button>
        </div>

        <nav className="flex-1 overflow-auto py-3">
          <div className="px-4 mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Projects</span>
            <button
              onClick={() => setShowNewProject(true)}
              className="p-1 hover:bg-gray-300 rounded text-gray-500 hover:text-gray-700"
              title="New project"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {showNewProject && (
            <form className="px-3 mb-2" onSubmit={(e) => { e.preventDefault(); handleCreateProject(); }}>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setShowNewProject(false);
                }}
                placeholder="Project name"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                autoFocus
              />
              <div className="flex gap-1 mt-2">
                {PROJECT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewProjectColor(c)}
                    className={`w-5 h-5 rounded-full border-2 ${newProjectColor === c ? "border-gray-800" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewProject(false)}
                  className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-300 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-0.5 px-2">
                {projects.map((project) => (
                  <SortableProjectItem
                    key={project.id}
                    project={project}
                    isActive={activeProjectId === project.id}
                    isRenaming={renamingProjectId === project.id}
                    onSelect={() => {
                      onSelectProject(project.id);
                      if (window.innerWidth < 1024) onToggle();
                    }}
                    onStartRename={() => setRenamingProjectId(project.id)}
                    onRename={async (name) => {
                      setRenamingProjectId(null);
                      if (name !== project.name) {
                        await api.projects.update(project.id, { name });
                        onProjectsChange();
                      }
                    }}
                    onContextMenu={(e) => {
                      setContextMenu({ x: e.clientX, y: e.clientY, projectId: project.id });
                    }}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          {projects.length === 0 && !showNewProject && (
            <p className="px-4 text-sm text-gray-400 mt-4">
              No projects yet. Click + to create one.
            </p>
          )}
        </nav>

        <div className="border-t border-gray-200 p-3 space-y-1">
          <a
            href="/api/backup"
            download
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-300 rounded-lg transition-colors w-full"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export backup
          </a>
          <label
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-300 rounded-lg transition-colors w-full cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m4-8l-4-4m0 0l-4 4m4-4v12" />
            </svg>
            Import backup
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!confirm("This will replace ALL existing data. Are you sure?")) {
                  e.target.value = "";
                  return;
                }
                const text = await file.text();
                const data = JSON.parse(text);
                const res = await fetch("/api/backup", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(data),
                });
                e.target.value = "";
                if (res.ok) {
                  onProjectsChange();
                } else {
                  alert("Import failed. Check the file format.");
                }
              }}
            />
          </label>
        </div>
      </aside>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          currentColor={projects.find((p) => p.id === contextMenu.projectId)?.color || PROJECT_COLORS[0]}
          sortDirection={sortDirection}
          onChangeColor={async (color) => {
            await api.projects.update(contextMenu.projectId, { color });
            setContextMenu(null);
            onProjectsChange();
          }}
          onSortAlphabetically={async () => {
            const sorted = [...projects].sort((a, b) =>
              sortDirection === "asc"
                ? a.name.localeCompare(b.name)
                : b.name.localeCompare(a.name)
            );
            onReorderProjects(sorted);
            const items = sorted.map((p, i) => ({ id: p.id, order: i }));
            await api.reorder(items, "project");
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
            setContextMenu(null);
          }}
          onDelete={() => {
            const p = projects.find((p) => p.id === contextMenu.projectId);
            if (p) setDeleteTarget(p);
            setContextMenu(null);
          }}
          onClose={closeContextMenu}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <DeleteConfirmModal
          projectName={deleteTarget.name}
          onConfirm={handleDeleteProject}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
