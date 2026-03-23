"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/lib/api";
import type {
  BoardColumn,
  ProjectWithSections,
  Sprint,
  SprintTask,
  SprintWithTasks,
  TaskWithRelations,
} from "@/lib/types";
import BoardCard from "./BoardCard";
import SprintSettingsModal from "./SprintSettingsModal";

interface BoardViewProps {
  projectId: string;
  projectName: string;
  sprintDuration: number;
  sprintStartDay: number;
  sprintStartDate: string | null;
  onSelectTask: (task: TaskWithRelations) => void;
  onDeselect?: () => void;
  selectedTaskId: string | null;
  onRefresh: () => void;
  refreshKey?: number;
}

function DraggableTaskItem({ task, depth = 0 }: { task: TaskWithRelations; depth?: number }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `panel-${task.id}`,
    data: { type: "projectTask", task },
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-2 py-1.5 text-sm rounded cursor-grab hover:bg-gray-700/50 ${
        isDragging ? "opacity-50 z-50" : ""
      } ${task.completed ? "text-gray-500 line-through" : "text-gray-300"}`}
      title={task.title}
    >
      <span className="text-gray-500 text-xs" style={{ paddingLeft: `${12 + depth * 16}px` }}>⠿</span>
      <span className="truncate">{task.title}</span>
      {(task.sprintTasks ?? []).filter((st) => st.sprint.status === "ACTIVE").map((st) => (
        <span key={st.sprint.number} className="shrink-0 text-[10px] font-medium text-indigo-400 bg-indigo-900/50 px-1 py-0.5 rounded">
          S{st.sprint.number}
        </span>
      ))}
    </div>
  );
}

function flattenTasks(tasks: TaskWithRelations[], depth = 0): { task: TaskWithRelations; depth: number }[] {
  const result: { task: TaskWithRelations; depth: number }[] = [];
  for (const task of tasks) {
    result.push({ task, depth });
    if (task.subtasks && task.subtasks.length > 0) {
      result.push(...flattenTasks(task.subtasks, depth + 1));
    }
  }
  return result;
}

function DroppableColumn({
  column,
  sprintTasks,
  selectedTaskId,
  onSelectTask,
}: {
  column: BoardColumn;
  sprintTasks: SprintTask[];
  selectedTaskId: string | null;
  onSelectTask: (task: TaskWithRelations, e: React.MouseEvent) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${column.id}`,
    data: { type: "column", column },
  });

  return (
    <div
      className={`flex flex-col min-w-[280px] max-w-[320px] px-3 ${
        isOver ? "bg-indigo-50/40" : ""
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-white uppercase tracking-wide">{column.name}</h3>
        </div>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px]"
      >
        <SortableContext
          items={sprintTasks.map((st) => st.id)}
          strategy={verticalListSortingStrategy}
        >
          {sprintTasks.map((st) => (
            <BoardCard
              key={st.id}
              sprintTask={st}
              isSelected={selectedTaskId === st.taskId}
              onClick={(e) => onSelectTask(st.task, e)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const sMonth = s.toLocaleDateString("en-US", { month: "short" });
  const eMonth = e.toLocaleDateString("en-US", { month: "short" });
  if (sMonth === eMonth) {
    return `${sMonth} ${s.getDate()}\u2013${e.getDate()}`;
  }
  return `${sMonth} ${s.getDate()} \u2013 ${eMonth} ${e.getDate()}`;
}

function findCurrentSprint(sprints: Sprint[]): Sprint | undefined {
  const now = new Date();
  const active = sprints.find(
    (s) => s.status === "ACTIVE" && new Date(s.startDate) <= now && new Date(s.endDate) >= now
  );
  if (active) return active;
  // If no sprint covers today, pick the nearest upcoming active sprint
  const activeSprints = sprints.filter((s) => s.status === "ACTIVE");
  if (activeSprints.length > 0) {
    const upcoming = activeSprints
      .filter((s) => new Date(s.startDate) > now)
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    if (upcoming.length > 0) return upcoming[0];
    // All active sprints are in the past — pick the most recent one
    return activeSprints.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
  }
  // Fall back to latest sprint overall
  return sprints.sort((a, b) => b.number - a.number)[0];
}

export default function BoardView({
  projectId,
  projectName,
  sprintDuration,
  sprintStartDay,
  sprintStartDate,
  onSelectTask,
  onDeselect,
  selectedTaskId,
  onRefresh,
  refreshKey,
}: BoardViewProps) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [currentSprint, setCurrentSprint] = useState<SprintWithTasks | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string | null>(null);
  const [showSprintSettings, setShowSprintSettings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showTaskPanel, setShowTaskPanel] = useState(false);
  const [trelloAuthError, setTrelloAuthError] = useState(false);
  const [projectTasks, setProjectTasks] = useState<ProjectWithSections | null>(null);
  const [panelWidth, setPanelWidth] = useState(288);
  const resizingRef = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const [trelloConfigured, setTrelloConfigured] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const loadSprints = useCallback(async () => {
    const sprintList = (await api.sprints.list(projectId)) as Sprint[];
    setSprints(sprintList);
    return sprintList;
  }, [projectId]);

  const loadColumns = useCallback(async () => {
    const cols = (await api.boardColumns.list(projectId)) as BoardColumn[];
    setColumns(cols);
    return cols;
  }, [projectId]);

  const loadSprint = useCallback(
    async (sprintId: string) => {
      const sprint = (await api.sprints.get(projectId, sprintId)) as SprintWithTasks;
      setCurrentSprint(sprint);
    },
    [projectId]
  );

  // Initial load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [sprintList] = await Promise.all([loadSprints(), loadColumns()]);
      if (cancelled) return;
      if (sprintList.length > 0) {
        const target = findCurrentSprint(sprintList);
        if (target) {
          setSelectedSprintId(target.id);
          await loadSprint(target.id);
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [loadSprints, loadColumns, loadSprint]);

  // Load sprint data when selection changes
  useEffect(() => {
    if (selectedSprintId) {
      loadSprint(selectedSprintId);
    }
  }, [selectedSprintId, loadSprint]);

  // Reload sprint data when refreshKey changes (e.g. after editing task details)
  useEffect(() => {
    if (selectedSprintId && refreshKey !== undefined) {
      loadSprint(selectedSprintId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Check Trello config on mount
  useEffect(() => {
    api.trello.status().then((res) => {
      if (res?.configured) setTrelloConfigured(true);
    }).catch(() => {});
  }, []);

  // Poll Trello for changes (renames, moves, completions) every 60s — only for synced sprints
  useEffect(() => {
    if (!trelloConfigured || !selectedSprintId || !currentSprint?.trelloBoardId) return;
    const interval = setInterval(async () => {
      try {
        const result = await api.trello.poll(selectedSprintId);
        if ((result as { authError?: boolean })?.authError) {
          setTrelloAuthError(true);
          return;
        }
        setTrelloAuthError(false);
        if (result?.changes && result.changes.length > 0) {
          // Reload sprint data to reflect pulled changes
          await loadSprint(selectedSprintId);
          onRefresh();
        }
      } catch {
        // Silently ignore poll errors
      }
    }, 15_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trelloConfigured, selectedSprintId, currentSprint?.trelloBoardId, loadSprint, onRefresh]);

  // Load project tasks when panel is opened
  useEffect(() => {
    if (showTaskPanel) {
      (async () => {
        const project = (await api.projects.get(projectId)) as ProjectWithSections;
        setProjectTasks(project);
      })();
    }
  }, [showTaskPanel, projectId]);

  const [taskPanelSearch, setTaskPanelSearch] = useState("");

  // Task IDs already in the current sprint
  const sprintTaskIds = new Set(
    currentSprint?.sprintTasks.map((st) => st.taskId) ?? []
  );

  // Flatten tasks including subtasks for the panel
  const panelSections = projectTasks
    ? projectTasks.sections.map((s) => {
        const query = taskPanelSearch.trim().toLowerCase();
        return {
          ...s,
          flatTasks: flattenTasks(s.tasks)
            .filter((ft) => !sprintTaskIds.has(ft.task.id))
            .filter((ft) => !query || ft.task.title.toLowerCase().includes(query)),
        };
      })
    : [];

  const panelTaskCount = panelSections.reduce((sum, s) => sum + s.flatTasks.length, 0);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const newWidth = Math.min(600, Math.max(200, startWidth + ev.clientX - startX));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [panelWidth]);

  // Custom collision detection: only detect collisions when pointer is within a droppable
  const collisionDetection: CollisionDetection = useCallback((args) => {
    return pointerWithin(args);
  }, []);

  const handleCreateSprint = async () => {
    const sprint = (await api.sprints.create(projectId)) as Sprint;
    const sprintList = await loadSprints();
    await loadColumns();
    setSelectedSprintId(sprint.id);
    // If this is the first sprint, sprintList now has entries
    if (sprintList.length === 1) {
      await loadSprint(sprint.id);
    }
  };

  const handleCloseSprint = async () => {
    if (!currentSprint) return;
    const incompleteTasks = currentSprint.sprintTasks.filter(
      (st) => !st.task.completed
    );
    const msg =
      incompleteTasks.length > 0
        ? `Close Sprint ${currentSprint.number}? ${incompleteTasks.length} incomplete task(s) will be moved to the next sprint.`
        : `Close Sprint ${currentSprint.number}?`;

    if (!confirm(msg)) return;

    await api.sprints.close(projectId, currentSprint.id);
    const sprintList = await loadSprints();
    // Navigate to the next sprint if it exists
    const nextSprint = sprintList.find(
      (s) => s.number === currentSprint.number + 1
    );
    if (nextSprint) {
      setSelectedSprintId(nextSprint.id);
    } else {
      // Stay on current (now closed) sprint
      await loadSprint(currentSprint.id);
    }
    onRefresh();
  };

  const getSprintTasksByColumn = (columnId: string): SprintTask[] => {
    if (!currentSprint) return [];
    return currentSprint.sprintTasks
      .filter((st) => st.columnId === columnId)
      .sort((a, b) => a.order - b.order);
  };

  const handleSelectTask = (task: TaskWithRelations, _e: React.MouseEvent) => {
    onSelectTask(task);
  };

  const handleRemoveFromBoard = async (taskId: string) => {
    if (!currentSprint) return;
    // Optimistic update
    setCurrentSprint((prev) =>
      prev ? { ...prev, sprintTasks: prev.sprintTasks.filter((st) => st.taskId !== taskId) } : prev
    );
    await api.sprints.removeTask(projectId, currentSprint.id, taskId);
    await loadSprint(currentSprint.id);
    // Refresh the panel to show the removed task again
    const project = (await api.projects.get(projectId)) as ProjectWithSections;
    setProjectTasks(project);
    onRefresh();
  };

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (_event: DragOverEvent) => {
    // Visual feedback is handled by the DroppableColumn isOver state
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || !currentSprint) return;

    const activeData = active.data.current;

    // Handle dragging a project task from the panel into a column
    if (activeData?.type === "projectTask") {
      const task = activeData.task as TaskWithRelations;
      const overData = over.data.current;
      let targetColumnId: string | null = null;

      if (overData?.type === "column") {
        targetColumnId = overData.column.id;
      } else if (overData?.type === "sprintTask") {
        targetColumnId = (overData.sprintTask as SprintTask).columnId;
      }

      if (targetColumnId) {
        await api.sprints.addTasks(projectId, currentSprint.id, [task.id], targetColumnId);
        await loadSprint(currentSprint.id);
        // Refresh project tasks to remove the added task from the panel
        const project = (await api.projects.get(projectId)) as ProjectWithSections;
        setProjectTasks(project);
      }
      return;
    }

    if (activeData?.type !== "sprintTask") return;

    const activeSprintTask = activeData.sprintTask as SprintTask;

    // Determine target column
    let targetColumnId: string;
    let targetOrder: number;

    const overData = over.data.current;
    if (overData?.type === "column") {
      // Dropped on empty column area
      targetColumnId = overData.column.id;
      const tasksInColumn = getSprintTasksByColumn(targetColumnId);
      targetOrder = tasksInColumn.length;
    } else if (overData?.type === "sprintTask") {
      // Dropped on another card
      const overSprintTask = overData.sprintTask as SprintTask;
      targetColumnId = overSprintTask.columnId;
      const tasksInColumn = getSprintTasksByColumn(targetColumnId);
      const overIndex = tasksInColumn.findIndex((st) => st.id === overSprintTask.id);
      targetOrder = overIndex >= 0 ? overIndex : tasksInColumn.length;
    } else {
      return;
    }

    // Skip if nothing changed
    if (
      activeSprintTask.columnId === targetColumnId &&
      activeSprintTask.order === targetOrder
    ) {
      return;
    }

    // Optimistic update
    const updatedTasks = currentSprint.sprintTasks.map((st) =>
      st.id === activeSprintTask.id
        ? { ...st, columnId: targetColumnId, order: targetOrder }
        : st
    );

    // Recalculate orders for the target column
    const targetColumnTasks = updatedTasks
      .filter((st) => st.columnId === targetColumnId && st.id !== activeSprintTask.id)
      .sort((a, b) => a.order - b.order);

    // Insert at target position
    targetColumnTasks.splice(targetOrder, 0, {
      ...activeSprintTask,
      columnId: targetColumnId,
      order: targetOrder,
    });

    // Reorder source column if different
    let sourceColumnTasks: SprintTask[] = [];
    if (activeSprintTask.columnId !== targetColumnId) {
      sourceColumnTasks = updatedTasks
        .filter(
          (st) =>
            st.columnId === activeSprintTask.columnId &&
            st.id !== activeSprintTask.id
        )
        .sort((a, b) => a.order - b.order);
    }

    // Build reorder items
    const reorderItems: { id: string; order: number; columnId?: string }[] = [
      ...targetColumnTasks.map((st, i) => ({
        id: st.id,
        order: i,
        columnId: targetColumnId,
      })),
      ...sourceColumnTasks.map((st, i) => ({
        id: st.id,
        order: i,
      })),
    ];

    // Optimistically update state
    setCurrentSprint((prev) => {
      if (!prev) return prev;
      const newSprintTasks = prev.sprintTasks.map((st) => {
        const reorderItem = reorderItems.find((r) => r.id === st.id);
        if (reorderItem) {
          return {
            ...st,
            order: reorderItem.order,
            columnId: reorderItem.columnId || st.columnId,
          };
        }
        return st;
      });
      return { ...prev, sprintTasks: newSprintTasks };
    });

    // Persist
    await api.reorder(reorderItems, "sprintTask");
  };

  const activeDragItem =
    activeId && currentSprint && !activeId.startsWith("panel-")
      ? currentSprint.sprintTasks.find((st) => st.id === activeId)
      : null;

  const activePanelTask =
    activeId && activeId.startsWith("panel-") && projectTasks
      ? panelSections
          .flatMap((s) => s.flatTasks)
          .find((ft) => `panel-${ft.task.id}` === activeId)?.task
      : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading board...
      </div>
    );
  }

  if (sprints.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-gray-400">No sprints yet for {projectName}</p>
        <button
          onClick={handleCreateSprint}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500"
        >
          + Create First Sprint
        </button>
      </div>
    );
  }

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId);

  return (
    <div className="flex flex-col h-full">
      {/* Sprint header bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 shrink-0 flex-wrap" style={{ backgroundColor: '#026AA7' }}>
        {/* Sprint selector */}
        <select
          value={selectedSprintId || ""}
          onChange={(e) => setSelectedSprintId(e.target.value)}
          className="bg-gray-800 text-gray-200 text-sm border border-gray-700 rounded px-2 py-1.5 focus:outline-none focus:border-indigo-500"
        >
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              Sprint {s.number}
            </option>
          ))}
        </select>

        {/* Date range */}
        {selectedSprint && (
          <span className="text-xs text-white/70">
            {formatDateRange(selectedSprint.startDate, selectedSprint.endDate)}
            {selectedSprint.status === "CLOSED" && (
              <span className="ml-2 text-xs text-white/50 bg-white/10 px-1.5 py-0.5 rounded">
                Closed
              </span>
            )}
          </span>
        )}

        <div className="flex-1" />

        {/* Sprint actions */}
        <button
          onClick={() => setShowTaskPanel((v) => !v)}
          className={`text-xs px-2 py-1 rounded hover:bg-white/20 ${
            showTaskPanel ? "text-indigo-200 hover:text-white" : "text-white/80 hover:text-white"
          }`}
          title={showTaskPanel ? "Hide task list" : "Show task list to drag tasks onto the board"}
        >
          + Tasks
        </button>

        <button
          onClick={handleCreateSprint}
          className="text-xs text-white/80 hover:text-white px-2 py-1 rounded hover:bg-white/20"
          title="Create next sprint"
        >
          + Sprint
        </button>

        {currentSprint?.status === "ACTIVE" && (
          <button
            onClick={handleCloseSprint}
            className="text-xs text-orange-300 hover:text-orange-200 px-2 py-1 rounded hover:bg-white/20"
            title="Close sprint and carry over incomplete tasks"
          >
            Close Sprint
          </button>
        )}

        <button
          onClick={() => setShowSprintSettings(true)}
          className="text-xs text-white/80 hover:text-white px-2 py-1 rounded hover:bg-white/20"
          title="Board settings"
        >
          ⚙ Settings
        </button>

        {trelloConfigured && currentSprint?.trelloBoardId && (
          <span className={`text-xs px-2 py-1 ${trelloAuthError ? "text-red-400" : "text-green-400"}`} title={trelloAuthError ? "Trello token expired" : "Syncing to Trello (manage in Settings)"}>
            ● Trello{trelloAuthError && " (token expired)"}
          </span>
        )}
      </div>

      {/* Trello auth error banner */}
      {trelloAuthError && (
        <div className="bg-red-900/30 border-b border-red-800 px-4 py-2 flex items-center gap-2 shrink-0">
          <span className="text-sm text-red-300">
            ⚠ Trello token expired — sync is paused. Update TRELLO_TOKEN in .env and restart the dev server.
          </span>
        </div>
      )}

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 overflow-hidden">
          {/* Task panel */}
          {showTaskPanel && (
            <div className="shrink-0 border-r border-gray-700 bg-gray-900 flex flex-col overflow-hidden relative" style={{ width: panelWidth }}>
              <div className="px-3 py-2 border-b border-gray-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Project Tasks</span>
                  <button
                    onClick={() => setShowTaskPanel(false)}
                    className="text-gray-500 hover:text-gray-300 text-sm"
                  >
                    ✕
                  </button>
                </div>
                <div className="relative">
                  <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={taskPanelSearch}
                    onChange={(e) => setTaskPanelSearch(e.target.value)}
                    placeholder="Search tasks…"
                    className="w-full pl-7 pr-7 py-1 text-xs bg-gray-800 text-gray-300 placeholder-gray-500 border border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  {taskPanelSearch && (
                    <button
                      onClick={() => setTaskPanelSearch("")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {panelSections.map((section) => {
                  if (section.flatTasks.length === 0) return null;
                  return (
                    <div key={section.id} className="mb-2">
                      <div className="px-3 py-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {section.name}
                      </div>
                      {section.flatTasks.map(({ task, depth }) => (
                        <DraggableTaskItem key={task.id} task={task} depth={depth} />
                      ))}
                    </div>
                  );
                })}
                {projectTasks && panelTaskCount === 0 && (
                  <div className="px-3 py-4 text-xs text-gray-500 text-center">
                    All tasks are in this sprint
                  </div>
                )}
              </div>
              {/* Resize handle */}
              <div
                onMouseDown={handleResizeStart}
                className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-500/40 active:bg-indigo-500/60 transition-colors z-10"
              />
            </div>
          )}

          {/* Board columns */}
          <div
            ref={boardRef}
            className="flex-1 overflow-x-auto overflow-y-hidden p-4" style={{ backgroundColor: '#0079BF' }}
            tabIndex={0}
            onClick={(e) => {
              if (selectedTaskId && !(e.target as HTMLElement).closest("[data-board-card]")) {
                onDeselect?.();
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Delete" && selectedTaskId) {
                e.preventDefault();
                handleRemoveFromBoard(selectedTaskId);
              }
            }}
          >
            <div className="flex divide-x-4 divide-white/20 h-full">
              {columns.map((col) => (
                <DroppableColumn
                  key={col.id}
                  column={col}
                  sprintTasks={getSprintTasksByColumn(col.id)}
                  selectedTaskId={selectedTaskId}
                  onSelectTask={handleSelectTask}
                />
              ))}
            </div>
          </div>
        </div>

        <DragOverlay>
          {activeDragItem ? (
            <div className="p-3 rounded-lg border border-indigo-500 bg-gray-800 shadow-xl opacity-90 min-w-[260px]">
              <div className="text-sm text-gray-200">
                {activeDragItem.task.title}
              </div>
            </div>
          ) : activePanelTask ? (
            <div className="px-3 py-1.5 rounded border border-indigo-500 bg-gray-800 shadow-xl opacity-90 min-w-[200px]">
              <div className="text-sm text-gray-200">
                {activePanelTask.title}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Settings modal */}
      {showSprintSettings && (
        <SprintSettingsModal
          projectId={projectId}
          currentDuration={sprintDuration}
          currentStartDay={sprintStartDay}
          currentStartDate={sprintStartDate}
          columns={columns}
          currentSprint={currentSprint}
          trelloConfigured={trelloConfigured}
          onClose={() => setShowSprintSettings(false)}
          onSave={() => onRefresh()}
          onColumnsChange={() => loadColumns()}
          onSprintChange={async () => {
            const sprintList = await loadSprints();
            if (sprintList.length === 0) {
              setSelectedSprintId(null);
              setCurrentSprint(null);
              onRefresh();
            } else if (!sprintList.find((s) => s.id === selectedSprintId)) {
              const target = findCurrentSprint(sprintList) || sprintList[sprintList.length - 1];
              setSelectedSprintId(target.id);
              await loadSprint(target.id);
            } else {
              await loadSprint(selectedSprintId!);
            }
          }}
        />
      )}
    </div>
  );
}
