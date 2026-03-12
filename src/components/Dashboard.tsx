"use client";

import { Fragment, useState, useEffect, useCallback } from "react";

interface ProjectCard {
  id: string;
  name: string;
  color: string;
  icon: string;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
}

interface UrgentTask {
  id: string;
  title: string;
  priority: string | null;
  dueDate: string | null;
  completed: boolean;
  parentId: string | null;
  section?: {
    name: string;
    project?: { id: string; name: string; color: string };
  };
  parent?: {
    id: string;
    title: string;
    section?: {
      name: string;
      project?: { id: string; name: string; color: string };
    };
  } | null;
}

interface TaskGroup {
  parentTask: UrgentTask;
  childTasks: UrgentTask[];
  isVirtualParent?: boolean;
}

interface DashboardProps {
  onSelectProject: (id: string, taskId?: string) => void;
}

const STORAGE_KEY = "dashboard-task-order";

function formatDueLabel(dueDate: string | null): { text: string; className: string } | null {
  if (!dueDate) return null;
  const due = new Date(dueDate.toString().split("T")[0] + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - now.getTime()) / 86400000);

  if (diff < 0) return { text: `${Math.abs(diff)}d overdue`, className: "text-red-600 font-medium" };
  if (diff === 0) return { text: "Due today", className: "text-orange-600 font-medium" };
  if (diff === 1) return { text: "Due tomorrow", className: "text-amber-600" };
  return { text: `Due in ${diff}d`, className: "text-gray-500" };
}

function applyStoredOrder(tasks: UrgentTask[]): UrgentTask[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return tasks;
    const order: string[] = JSON.parse(stored);
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const ordered: UrgentTask[] = [];
    for (const id of order) {
      const t = taskMap.get(id);
      if (t) {
        ordered.push(t);
        taskMap.delete(id);
      }
    }
    for (const t of taskMap.values()) {
      ordered.push(t);
    }
    return ordered;
  } catch {
    return tasks;
  }
}

function buildGroups(tasks: UrgentTask[]): TaskGroup[] {
  const taskIds = new Set(tasks.map((t) => t.id));
  // Subtasks whose parent is also in the list → grouped under real parent
  const groupedChildIds = new Set<string>();
  for (const task of tasks) {
    if (task.parentId && taskIds.has(task.parentId)) {
      groupedChildIds.add(task.id);
    }
  }
  const groups: TaskGroup[] = [];
  for (const task of tasks) {
    if (groupedChildIds.has(task.id)) continue;
    // Subtask whose parent is NOT in the list → create virtual parent group
    if (task.parentId && task.parent && !taskIds.has(task.parentId)) {
      const virtualParent: UrgentTask = {
        id: task.parent.id,
        title: task.parent.title,
        priority: null,
        dueDate: null,
        completed: false,
        parentId: null,
        section: task.parent.section,
      };
      groups.push({ parentTask: virtualParent, childTasks: [task], isVirtualParent: true });
      continue;
    }
    const children = tasks.filter((t) => t.parentId === task.id && groupedChildIds.has(t.id));
    groups.push({ parentTask: task, childTasks: children });
  }
  return groups;
}

function saveGroupOrder(groups: TaskGroup[]) {
  try {
    const ids: string[] = [];
    for (const g of groups) {
      ids.push(g.parentTask.id);
      for (const c of g.childTasks) ids.push(c.id);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export function Dashboard({ onSelectProject }: DashboardProps) {
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropLineIdx, setDropLineIdx] = useState<number | null>(null);

  const handleToggleComplete = useCallback(async (taskId: string) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: true }),
    });
    setGroups((prev) => {
      const next = prev
        .map((g) => {
          if (g.parentTask.id === taskId && g.childTasks.length === 0) return null;
          return {
            ...g,
            childTasks: g.childTasks.filter((c) => c.id !== taskId),
          };
        })
        .filter(Boolean) as TaskGroup[];
      saveGroupOrder(next);
      return next;
    });
  }, []);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((data) => {
        const ordered = applyStoredOrder(data.urgentTasks || []);
        setGroups(buildGroups(ordered));
        setProjects(data.projectCards || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDropLineIdx(e.clientY < midY ? idx : idx + 1);
  }, []);

  const handleDrop = useCallback(() => {
    if (dragIdx === null || dropLineIdx === null) {
      setDragIdx(null);
      setDropLineIdx(null);
      return;
    }
    let targetIdx = dropLineIdx > dragIdx ? dropLineIdx - 1 : dropLineIdx;
    if (targetIdx === dragIdx) {
      setDragIdx(null);
      setDropLineIdx(null);
      return;
    }
    setGroups((prev) => {
      const next = [...prev];
      const [removed] = next.splice(dragIdx, 1);
      next.splice(targetIdx, 0, removed);
      saveGroupOrder(next);
      return next;
    });
    setDragIdx(null);
    setDropLineIdx(null);
  }, [dragIdx, dropLineIdx]);

  const handleDragEnd = useCallback(() => {
    setDragIdx(null);
    setDropLineIdx(null);
  }, []);

  const navigateToTask = useCallback(
    (task: UrgentTask) => {
      const section = task.section ?? task.parent?.section;
      const projectId = section?.project?.id;
      if (projectId) onSelectProject(projectId, task.id);
    },
    [onSelectProject]
  );

  if (loading) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading…</div>;
  }

  if (projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Welcome to Tasks</h2>
          <p className="text-gray-500">Create your first project from the sidebar to get started.</p>
        </div>
      </div>
    );
  }

  // Don't show insertion line at the dragged item's current position
  const effectiveLineIdx =
    dropLineIdx !== null && dragIdx !== null && dropLineIdx !== dragIdx && dropLineIdx !== dragIdx + 1
      ? dropLineIdx
      : null;

  return (
    <div className="max-w-4xl mx-auto py-8 px-6">
      {/* Urgent / upcoming tasks */}
      {groups.length > 0 && (
        <section className="mb-8">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Needs attention
          </h3>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            {groups.map((group, idx) => {
              const isDragging = dragIdx === idx;
              const parentDue = formatDueLabel(group.parentTask.dueDate);
              const parentSection = group.parentTask.section ?? group.parentTask.parent?.section;
              return (
                <Fragment key={group.parentTask.id}>
                  {/* Insertion line before this group */}
                  {effectiveLineIdx === idx && (
                    <div className="h-0.5 bg-indigo-500" />
                  )}
                  {/* Divider between groups */}
                  {idx > 0 && effectiveLineIdx !== idx && (
                    <div className="h-px bg-gray-100" />
                  )}
                  {/* Draggable group */}
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDrop={handleDrop}
                    onDragEnd={handleDragEnd}
                    className={isDragging ? "opacity-30" : ""}
                  >
                    {/* Parent / standalone task */}
                    <div className="flex items-center">
                      {!group.isVirtualParent && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleToggleComplete(group.parentTask.id); }}
                          className="w-[18px] h-[18px] rounded-full border-2 border-gray-300 hover:border-green-400 shrink-0 ml-4 flex items-center justify-center transition-colors"
                        />
                      )}
                      <button
                        onClick={() => navigateToTask(group.parentTask)}
                        className={`flex-1 flex items-center gap-3 ${group.isVirtualParent ? 'px-4' : 'pl-3 pr-4'} py-3 text-left ${group.isVirtualParent ? "cursor-default" : "hover:bg-gray-50 cursor-pointer"}`}
                      >
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${group.isVirtualParent ? "text-gray-400" : "text-gray-900"}`}>
                          {group.parentTask.title}
                        </p>
                        {!group.isVirtualParent && parentSection?.project && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <div
                              className="w-2 h-2 rounded-sm shrink-0"
                              style={{ backgroundColor: parentSection.project.color }}
                            />
                            <span className="text-xs text-gray-400 truncate">
                              {parentSection.project.name} · {parentSection.name}
                            </span>
                          </div>
                        )}
                      </div>
                      {parentDue && <span className={`text-xs shrink-0 ${parentDue.className}`}>{parentDue.text}</span>}
                      </button>
                    </div>
                    {/* Grouped subtasks */}
                    {group.childTasks.map((child) => {
                      const childDue = formatDueLabel(child.dueDate);
                      const childSection = child.section ?? child.parent?.section;
                      return (
                        <div
                          key={child.id}
                          className="flex items-center pl-8 pr-4 py-2.5 hover:bg-gray-50 border-t border-gray-50"
                        >
                          <span className="text-gray-300 text-xs mr-1">└</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleToggleComplete(child.id); }}
                            className="w-[16px] h-[16px] rounded-full border-2 border-gray-300 hover:border-green-400 shrink-0 flex items-center justify-center transition-colors"
                          />
                          <button
                            onClick={() => navigateToTask(child)}
                            className="flex-1 flex items-center gap-3 pl-3 text-left cursor-pointer"
                          >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 truncate">{child.title}</p>
                            {childSection?.project && (
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <div
                                  className="w-2 h-2 rounded-sm shrink-0"
                                  style={{ backgroundColor: childSection.project.color }}
                                />
                                <span className="text-xs text-gray-400 truncate">
                                  {childSection.project.name} · {childSection.name}
                                </span>
                              </div>
                            )}
                          </div>
                          {childDue && <span className={`text-xs shrink-0 ${childDue.className}`}>{childDue.text}</span>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </Fragment>
              );
            })}
            {/* Insertion line after last group */}
            {effectiveLineIdx === groups.length && (
              <div className="h-0.5 bg-indigo-500" />
            )}
          </div>
        </section>
      )}

      {/* Project cards */}
      <section>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Projects</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => onSelectProject(project.id)}
              className="flex flex-col bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-gray-300 transition-all text-left group"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div
                  className="w-4 h-4 rounded-md shrink-0"
                  style={{ backgroundColor: project.color }}
                />
                <span className="font-medium text-gray-900 truncate group-hover:text-indigo-700 transition-colors">
                  {project.name}
                </span>
              </div>
              {project.totalTasks > 0 ? (
                <div className="w-full">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                    <span>{project.openTasks} open</span>
                    <span>{Math.round((project.completedTasks / project.totalTasks) * 100)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(project.completedTasks / project.totalTasks) * 100}%`,
                        backgroundColor: project.color,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <span className="text-xs text-gray-400">No tasks yet</span>
              )}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
