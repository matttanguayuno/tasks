"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  DndContext,
  rectIntersection,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  DragOverlay,
  type DragOverEvent,
  useDroppable,
} from "@dnd-kit/core";

// Custom sensor that doesn't start drag when interacting with text inputs
class EditablePointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: { nativeEvent: PointerEvent }) => {
        const target = event.target as HTMLElement;
        if (target.closest('input, textarea, select, [contenteditable="true"]')) {
          return false;
        }
        return true;
      },
    },
  ];
}
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { api } from "@/lib/api";
import { TaskRow } from "./TaskRow";
import { TaskDetail } from "./TaskDetail";
import { ProjectDetail } from "./ProjectDetail";
import type { ProjectWithSections, TaskWithRelations, SectionWithTasks } from "@/lib/types";
import type { UndoAction } from "@/hooks/useUndoRedo";

/* ──── Task tree helpers ──── */

type DragIntent =
  | { type: "nest"; targetId: string }
  | { type: "insert"; targetId: string; position: "before" | "after" }
  | null;

type FlatTaskItem =
  | { kind: "task"; task: TaskWithRelations; depth: number }
  | { kind: "add-subtask"; parentTask: TaskWithRelations; depth: number; sectionId: string };

/** Flatten a task tree into display order, respecting expanded state */
function flattenTasks(
  tasks: TaskWithRelations[],
  expandedTasks: Set<string>,
  depth = 0,
): FlatTaskItem[] {
  const result: FlatTaskItem[] = [];
  for (const task of tasks) {
    result.push({ kind: "task", task, depth });
    if (expandedTasks.has(task.id) && task.subtasks?.length > 0) {
      result.push(...flattenTasks(task.subtasks, expandedTasks, depth + 1));
      result.push({ kind: "add-subtask", parentTask: task, depth: depth + 1, sectionId: task.sectionId });
    }
  }
  return result;
}

/** Recursively collect all tasks at every depth */
function collectAllTasksDeep(tasks: TaskWithRelations[]): TaskWithRelations[] {
  const result: TaskWithRelations[] = [];
  for (const t of tasks) {
    result.push(t);
    if (t.subtasks?.length > 0) result.push(...collectAllTasksDeep(t.subtasks));
  }
  return result;
}

/** Find a task at any depth within sections */
function findTaskDeep(sections: SectionWithTasks[], taskId: string): TaskWithRelations | null {
  for (const s of sections) {
    const found = findInTaskTree(s.tasks, taskId);
    if (found) return found;
  }
  return null;
}

function findInTaskTree(tasks: TaskWithRelations[], taskId: string): TaskWithRelations | null {
  for (const t of tasks) {
    if (t.id === taskId) return t;
    if (t.subtasks?.length > 0) {
      const found = findInTaskTree(t.subtasks, taskId);
      if (found) return found;
    }
  }
  return null;
}

/** Check if childId is a descendant of parent (prevents circular nesting) */
function isDescendantOf(parent: TaskWithRelations, childId: string): boolean {
  for (const sub of parent.subtasks ?? []) {
    if (sub.id === childId) return true;
    if (isDescendantOf(sub, childId)) return true;
  }
  return false;
}

/** Find which section a task belongs to (searching recursively) */
function findTaskSectionId(sections: SectionWithTasks[], taskId: string): string | null {
  for (const s of sections) {
    if (findInTaskTree(s.tasks, taskId)) return s.id;
  }
  return null;
}

interface ProjectViewProps {
  project: ProjectWithSections;
  onRefresh: () => void;
  pushAction?: (action: UndoAction) => void;
  initialTaskId?: string | null;
  onInitialTaskConsumed?: () => void;
  collapseAllRef?: React.MutableRefObject<(() => void) | null>;
  filterHighPriority?: boolean;
}

export function ProjectView({ project, onRefresh, pushAction, initialTaskId, onInitialTaskConsumed, collapseAllRef, filterHighPriority }: ProjectViewProps) {
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const lastClickedTaskIdRef = useRef<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [addingSectionAtTop, setAddingSectionAtTop] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [addingTaskInSection, setAddingTaskInSection] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeSectionDragId, setActiveSectionDragId] = useState<string | null>(null);
  const [localSections, setLocalSections] = useState<SectionWithTasks[] | null>(null);
  const localSectionsRef = useRef<SectionWithTasks[] | null>(null);
  const preDragSnapshotRef = useRef<SectionWithTasks[] | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: TaskWithRelations } | null>(null);
  const [sectionContextMenu, setSectionContextMenu] = useState<{ x: number; y: number; section: SectionWithTasks } | null>(null);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<TaskWithRelations | null>(null);
  const [confirmDeleteMultiple, setConfirmDeleteMultiple] = useState<TaskWithRelations[] | null>(null);
  const [clipboard, setClipboard] = useState<{ task: TaskWithRelations; mode: "copy" | "cut" } | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<SectionWithTasks | null>(null);
  const [insertingAfterTaskId, setInsertingAfterTaskId] = useState<string | null>(null);
  const [addingTaskAtTopOfSection, setAddingTaskAtTopOfSection] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState("");
  const [hyperlinkDialog, setHyperlinkDialog] = useState<{ taskId: string; url: string } | null>(null);
  const subtaskDropTargetRef = useRef<string | null>(null);
  const [subtaskDropTargetId, setSubtaskDropTargetId] = useState<string | null>(null);
  const [dragIntent, setDragIntent] = useState<DragIntent>(null);
  const dragIntentRef = useRef<DragIntent>(null);
  const [dragOverSectionId, setDragOverSectionId] = useState<string | null>(null);
  const detailSubtaskDragRef = useRef<{ task: TaskWithRelations; parentId: string } | null>(null);
  const pointerYRef = useRef<number>(0);
  const newTaskInputRef = useRef<HTMLInputElement>(null);
  const creatingTaskRef = useRef(false);
  const addingTaskInSectionRef = useRef<string | null>(null);
  addingTaskInSectionRef.current = addingTaskInSection;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Tracks the user-intended selected task ID to prevent race conditions
  // between async task fetches (e.g., onRefresh vs user click)
  const selectingTaskIdRef = useRef<string | null>(null);

  // Clear local override when server data refreshes
  useEffect(() => {
    setLocalSections(null);
    localSectionsRef.current = null;
    // After data refresh completes, reset the creating flag and refocus input
    if (creatingTaskRef.current) {
      requestAnimationFrame(() => {
        creatingTaskRef.current = false;
        newTaskInputRef.current?.focus();
      });
    }
  }, [project]);

  // Close detail panel and scroll to top when switching projects
  useEffect(() => {
    selectingTaskIdRef.current = null;
    setSelectedTask(null);
    setSelectedTaskIds(new Set());
    requestAnimationFrame(() => {
      scrollContainerRef.current?.scrollTo(0, 0);
    });
  }, [project.id]);

  // Keep ref in sync when the panel is closed
  useEffect(() => {
    if (!selectedTask) selectingTaskIdRef.current = null;
  }, [selectedTask]);

  // Scroll to top when filter changes
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollContainerRef.current?.scrollTo(0, 0);
    });
  }, [filterHighPriority]);

  const sections = localSections ?? project.sections;

  // Determine which columns to show based on project-wide task data (all depths)
  const allTasks = sections.flatMap((s) => collectAllTasksDeep(s.tasks));

  // Track pointer Y during drag for position-based zone detection
  useEffect(() => {
    if (!activeTaskId) return;
    const handler = (e: PointerEvent) => { pointerYRef.current = e.clientY; };
    window.addEventListener("pointermove", handler);
    return () => window.removeEventListener("pointermove", handler);
  }, [activeTaskId]);

  // Auto-select task when navigating from dashboard
  useEffect(() => {
    if (initialTaskId && allTasks.length > 0) {
      const task = allTasks.find((t) => t.id === initialTaskId);
      if (task) {
        selectingTaskIdRef.current = task.id;
        setSelectedTask(task);
        setSelectedTaskIds(new Set());
      }
      onInitialTaskConsumed?.();
    }
  }, [initialTaskId, allTasks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose collapseAll to parent
  useEffect(() => {
    if (collapseAllRef) {
      collapseAllRef.current = () => setCollapsedSections(new Set(sections.map((s) => s.id)));
    }
    return () => { if (collapseAllRef) collapseAllRef.current = null; };
  }, [collapseAllRef, sections]);

  const showPriorityColumn = allTasks.some((t) => t.priority);
  const showDueDateColumn = allTasks.some((t) => t.dueDate);
  const showRequestedByColumn = allTasks.some((t) => t.requestedBy);

  const sensors = useSensors(
    useSensor(EditablePointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeTask = activeTaskId
    ? allTasks.find((t) => t.id === activeTaskId) ?? detailSubtaskDragRef.current?.task ?? null
    : null;

  const findTaskSectionInRef = (taskId: string): string | null => {
    const src = localSectionsRef.current ?? sections;
    return findTaskSectionId(src, taskId);
  };

  const SECTION_SORT_PREFIX = "section-sort-";

  // Use closestCenter for section drags (forgiving), rectIntersection for task drags (precise)
  const collisionDetection = useCallback(
    (...args: Parameters<typeof rectIntersection>) => {
      return activeSectionDragId ? closestCenter(...args) : rectIntersection(...args);
    },
    [activeSectionDragId]
  );

  const handleDragStart = (event: DragStartEvent) => {
    const id = event.active.id as string;

    // Check if dragging a subtask from the detail panel
    if (selectedTask?.subtasks?.some((s) => s.id === id)) {
      const subtask = selectedTask.subtasks.find((s) => s.id === id)!;
      detailSubtaskDragRef.current = { task: subtask, parentId: selectedTask.id };
      setActiveTaskId(id);
      // Still snapshot sections for potential drop into task list
      const snapshot = project.sections.map((s) => ({ ...s, tasks: [...s.tasks] }));
      preDragSnapshotRef.current = snapshot;
      localSectionsRef.current = snapshot;
      setLocalSections(snapshot);
      return;
    }

    detailSubtaskDragRef.current = null;

    // Snapshot current sections for optimistic local reorder
    const snapshot = project.sections.map((s) => ({ ...s, tasks: [...s.tasks] }));
    preDragSnapshotRef.current = snapshot;
    localSectionsRef.current = snapshot;
    setLocalSections(snapshot);

    if (id.startsWith(SECTION_SORT_PREFIX)) {
      setActiveSectionDragId(id.replace(SECTION_SORT_PREFIX, ""));
    } else {
      setActiveTaskId(id);
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Skip section drag in handleDragOver
    if (activeId.startsWith(SECTION_SORT_PREFIX)) return;

    const src = localSectionsRef.current ?? sections;

    // ── Position-based drag intent ──
    const isOverTask = !overId.startsWith("section-") && !overId.startsWith(SECTION_SORT_PREFIX)
      && overId !== activeId;

    if (isOverTask) {
      const overTask = findTaskDeep(src, overId);
      if (overTask) {
        const el = document.querySelector(`[data-sortable-task-id="${overId}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          const relativeY = (pointerYRef.current - rect.top) / rect.height;

          let newIntent: DragIntent;
          if (relativeY < 0.25) {
            newIntent = { type: "insert", targetId: overId, position: "before" };
          } else if (relativeY > 0.75) {
            newIntent = { type: "insert", targetId: overId, position: "after" };
          } else {
            // Check for circular nesting (can't nest a task under its own descendant)
            const activeTask = findTaskDeep(src, activeId);
            if (activeTask && isDescendantOf(activeTask, overId)) {
              newIntent = { type: "insert", targetId: overId, position: "after" };
            } else {
              newIntent = { type: "nest", targetId: overId };
            }
          }

          dragIntentRef.current = newIntent;
          setDragIntent(newIntent);
          subtaskDropTargetRef.current = newIntent.type === "nest" ? overId : null;
          setSubtaskDropTargetId(newIntent.type === "nest" ? overId : null);
        }
        setDragOverSectionId(null);
        return;
      }
    }

    // Not over a task — clear intent
    dragIntentRef.current = null;
    setDragIntent(null);
    subtaskDropTargetRef.current = null;
    setSubtaskDropTargetId(null);

    // ── Track section hover for whole-section highlight ──
    if (overId.startsWith("section-droppable-") || overId.startsWith("section-header-")) {
      const sId = overId.replace("section-droppable-", "").replace("section-header-", "");
      if (src.some((s) => s.id === sId)) {
        setDragOverSectionId(sId);
      }
    } else {
      setDragOverSectionId(null);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTaskId(null);
    setActiveSectionDragId(null);

    // Capture and clear drag intent
    const intent = dragIntentRef.current;
    dragIntentRef.current = null;
    setDragIntent(null);
    subtaskDropTargetRef.current = null;
    setSubtaskDropTargetId(null);
    setDragOverSectionId(null);

    // Capture and clear detail-panel subtask drag state
    const detailDrag = detailSubtaskDragRef.current;
    detailSubtaskDragRef.current = null;

    const snapshot = preDragSnapshotRef.current ?? project.sections;

    if (!over) {
      setLocalSections(null);
      localSectionsRef.current = null;
      preDragSnapshotRef.current = null;
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // ── Detail-panel subtask drop ──
    if (detailDrag) {
      // Check if dropped on another subtask of the same parent (reorder within detail panel)
      const isReorderWithinParent = selectedTask?.subtasks?.some((s) => s.id === overId);
      if (isReorderWithinParent && selectedTask?.subtasks) {
        const subs = selectedTask.subtasks;
        const oldIndex = subs.findIndex((s) => s.id === activeId);
        const newIndex = subs.findIndex((s) => s.id === overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = [...subs];
          const [moved] = reordered.splice(oldIndex, 1);
          reordered.splice(newIndex, 0, moved);
          const items = reordered.map((s, i) => ({ id: s.id, order: i }));
          try { await api.reorder(items, "task"); } catch { /* ignore */ }
        }
        setLocalSections(null);
        localSectionsRef.current = null;
        preDragSnapshotRef.current = null;
        onRefresh();
        return;
      }

      // Use drag intent if available
      if (intent?.type === "nest" && intent.targetId !== detailDrag.parentId) {
        const targetTask = findTaskDeep(snapshot, intent.targetId);
        if (targetTask) {
          const maxOrder = Math.max(-1, ...targetTask.subtasks.map((s) => s.order));
          try {
            await api.tasks.update(activeId, { parentId: intent.targetId, sectionId: targetTask.sectionId, order: maxOrder + 1 });
          } catch { /* ignore */ }
          setExpandedTasks((prev) => new Set(prev).add(intent.targetId));
        }
        setLocalSections(null);
        localSectionsRef.current = null;
        preDragSnapshotRef.current = null;
        onRefresh();
        return;
      }

      if (intent?.type === "insert") {
        const targetTask = findTaskDeep(snapshot, intent.targetId);
        if (targetTask) {
          const newParentId = targetTask.parentId;
          const targetSectionId = targetTask.sectionId;
          const siblings = newParentId
            ? (findTaskDeep(snapshot, newParentId)?.subtasks ?? [])
            : (snapshot.find((s) => s.id === targetSectionId)?.tasks ?? []);
          const filteredSiblings = siblings.filter((t) => t.id !== activeId);
          const targetIdx = filteredSiblings.findIndex((t) => t.id === intent.targetId);
          const insertIdx = intent.position === "before" ? targetIdx : targetIdx + 1;
          const order = insertIdx >= 0 ? insertIdx : filteredSiblings.length;
          try {
            await api.tasks.update(activeId, { parentId: newParentId, sectionId: targetSectionId, order });
            const reorderItems = [...filteredSiblings];
            reorderItems.splice(insertIdx >= 0 ? insertIdx : reorderItems.length, 0, { id: activeId } as TaskWithRelations);
            await api.reorder(reorderItems.map((t, i) => ({ id: t.id, order: i, sectionId: targetSectionId })), "task");
          } catch { /* ignore */ }
        }
        setLocalSections(null);
        localSectionsRef.current = null;
        preDragSnapshotRef.current = null;
        onRefresh();
        return;
      }

      // Dropped on a section area → move to that section as top-level task
      let targetSectionId: string | null = null;
      const taskInSection = snapshot.find((s) => s.tasks.some((t) => t.id === overId));
      if (taskInSection) {
        targetSectionId = taskInSection.id;
      } else {
        const sectionDropMatch = overId.startsWith("section-droppable-") ? overId.replace("section-droppable-", "") : null;
        const sectionHeaderMatch = overId.startsWith("section-header-") ? overId.replace("section-header-", "") : null;
        const matchedId = sectionDropMatch || sectionHeaderMatch;
        if (matchedId && snapshot.some((s) => s.id === matchedId)) {
          targetSectionId = matchedId;
        }
      }

      if (targetSectionId) {
        const targetSection = snapshot.find((s) => s.id === targetSectionId)!;
        const overIdx = targetSection.tasks.findIndex((t) => t.id === overId);
        const order = overIdx >= 0 ? overIdx : targetSection.tasks.length;
        try {
          await api.tasks.update(activeId, { parentId: null, sectionId: targetSectionId, order });
          const reorderItems = targetSection.tasks.map((t, i) => ({
            id: t.id, order: i >= order ? i + 1 : i, sectionId: targetSectionId!,
          }));
          reorderItems.push({ id: activeId, order, sectionId: targetSectionId! });
          await api.reorder(reorderItems, "task");
        } catch { /* ignore */ }
      }

      setLocalSections(null);
      localSectionsRef.current = null;
      preDragSnapshotRef.current = null;
      onRefresh();
      return;
    }

    // ── Section reorder ──
    if (activeId.startsWith(SECTION_SORT_PREFIX)) {
      const activeSectionId = activeId.replace(SECTION_SORT_PREFIX, "");
      let overSectionId: string | null = null;
      if (overId.startsWith(SECTION_SORT_PREFIX)) {
        overSectionId = overId.replace(SECTION_SORT_PREFIX, "");
      }
      if (overSectionId && overSectionId !== activeSectionId) {
        const oldIdx = snapshot.findIndex((s) => s.id === activeSectionId);
        const newIdx = snapshot.findIndex((s) => s.id === overSectionId);
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          const reordered = [...snapshot];
          const [moved] = reordered.splice(oldIdx, 1);
          reordered.splice(newIdx, 0, moved);
          const sectionUpdates = reordered.map((s, i) => ({ id: s.id, order: i }));
          const oldOrder = snapshot.map((s, i) => ({ id: s.id, order: i }));
          try {
            await api.reorder(sectionUpdates, "section");
            pushAction?.({
              undo: async () => { await api.reorder(oldOrder, "section"); },
              redo: async () => { await api.reorder(sectionUpdates, "section"); },
            });
          } catch {
            setLocalSections(null);
            localSectionsRef.current = null;
          }
        }
      }
      preDragSnapshotRef.current = null;
      onRefresh();
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-section-id="${activeSectionId}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
      return;
    }

    // ── Task move via drag intent ──
    if (intent) {
      const activeTask = findTaskDeep(snapshot, activeId);
      if (!activeTask) {
        preDragSnapshotRef.current = null;
        setLocalSections(null);
        localSectionsRef.current = null;
        onRefresh();
        return;
      }

      const isMultiDrag = selectedTaskIds.size > 0 && selectedTaskIds.has(activeId);
      const taskIds = isMultiDrag ? Array.from(selectedTaskIds) : [activeId];

      if (intent.type === "nest") {
        const targetTask = findTaskDeep(snapshot, intent.targetId);
        if (targetTask && !taskIds.includes(intent.targetId)) {
          // Block circular nesting
          const draggedTask = findTaskDeep(snapshot, activeId);
          if (draggedTask && !isDescendantOf(draggedTask, intent.targetId)) {
            const filteredIds = taskIds.filter((id) => id !== intent.targetId);

            // Save state for undo
            const originalStates = filteredIds.map((id) => {
              const t = findTaskDeep(snapshot, id);
              return t ? { id, parentId: t.parentId, sectionId: t.sectionId, order: t.order } : null;
            }).filter(Boolean) as { id: string; parentId: string | null; sectionId: string; order: number }[];

            const maxSubtaskOrder = Math.max(-1, ...targetTask.subtasks.map((s) => s.order));
            let nextOrder = maxSubtaskOrder + 1;
            const targetSectionId = targetTask.sectionId;

            try {
              for (const taskId of filteredIds) {
                await api.tasks.update(taskId, { parentId: intent.targetId, sectionId: targetSectionId, order: nextOrder++ });
              }
              pushAction?.({
                undo: async () => {
                  for (const state of originalStates) {
                    await api.tasks.update(state.id, { parentId: state.parentId, sectionId: state.sectionId, order: state.order });
                  }
                },
                redo: async () => {
                  let o = maxSubtaskOrder + 1;
                  for (const id of filteredIds) {
                    await api.tasks.update(id, { parentId: intent.targetId, sectionId: targetSectionId, order: o++ });
                  }
                },
              });
            } catch { /* ignore */ }

            setExpandedTasks((prev) => new Set(prev).add(intent.targetId));
            if (isMultiDrag) setSelectedTaskIds(new Set());
          }
        }
      } else if (intent.type === "insert") {
        const targetTask = findTaskDeep(snapshot, intent.targetId);
        if (targetTask) {
          const newParentId = targetTask.parentId;
          const targetSectionId = targetTask.sectionId;

          // Get siblings (tasks with same parentId in same section)
          const siblings = newParentId
            ? (findTaskDeep(snapshot, newParentId)?.subtasks ?? [])
            : (snapshot.find((s) => s.id === targetSectionId)?.tasks ?? []);

          // Save state for undo
          const originalStates = taskIds.map((id) => {
            const t = findTaskDeep(snapshot, id);
            return t ? { id, parentId: t.parentId, sectionId: t.sectionId, order: t.order } : null;
          }).filter(Boolean) as { id: string; parentId: string | null; sectionId: string; order: number }[];

          // Build new order: remove dragged tasks, then insert at position
          const filteredSiblings = siblings.filter((t) => !taskIds.includes(t.id));
          const targetIdx = filteredSiblings.findIndex((t) => t.id === intent.targetId);
          const insertIdx = intent.position === "before" ? targetIdx : targetIdx + 1;

          const reorderItems: { id: string; order: number; sectionId: string }[] = [];
          let order = 0;
          for (let i = 0; i <= filteredSiblings.length; i++) {
            if (i === (insertIdx >= 0 ? insertIdx : filteredSiblings.length)) {
              for (const taskId of taskIds) {
                reorderItems.push({ id: taskId, order: order++, sectionId: targetSectionId });
              }
            }
            if (i < filteredSiblings.length) {
              reorderItems.push({ id: filteredSiblings[i].id, order: order++, sectionId: targetSectionId });
            }
          }

          try {
            // Update parentId/sectionId for moved tasks if changed
            for (const taskId of taskIds) {
              const task = findTaskDeep(snapshot, taskId);
              if (task && (task.parentId !== newParentId || task.sectionId !== targetSectionId)) {
                await api.tasks.update(taskId, { parentId: newParentId, sectionId: targetSectionId });
              }
            }
            // Reorder all siblings
            await api.reorder(reorderItems, "task");

            pushAction?.({
              undo: async () => {
                for (const state of originalStates) {
                  await api.tasks.update(state.id, { parentId: state.parentId, sectionId: state.sectionId, order: state.order });
                }
              },
              redo: async () => {
                for (const taskId of taskIds) {
                  const task = findTaskDeep(snapshot, taskId);
                  if (task && (task.parentId !== newParentId || task.sectionId !== targetSectionId)) {
                    await api.tasks.update(taskId, { parentId: newParentId, sectionId: targetSectionId });
                  }
                }
                await api.reorder(reorderItems, "task");
              },
            });
          } catch { /* ignore */ }

          if (isMultiDrag) setSelectedTaskIds(new Set());
        }
      }

      preDragSnapshotRef.current = null;
      setLocalSections(null);
      localSectionsRef.current = null;
      onRefresh();
      return;
    }

    // ── Fallback: dropped on a section area (no drag intent) ──
    let targetSectionId: string | null = null;
    if (overId.startsWith("section-droppable-")) targetSectionId = overId.replace("section-droppable-", "");
    else if (overId.startsWith("section-header-")) targetSectionId = overId.replace("section-header-", "");

    if (targetSectionId) {
      const section = snapshot.find((s) => s.id === targetSectionId);
      if (section) {
        try {
          await api.tasks.update(activeId, { parentId: null, sectionId: targetSectionId, order: section.tasks.length });
        } catch { /* ignore */ }
      }
    }

    preDragSnapshotRef.current = null;
    setLocalSections(null);
    localSectionsRef.current = null;
    onRefresh();
  };

  const handleDragCancel = () => {
    setActiveTaskId(null);
    setActiveSectionDragId(null);
    setLocalSections(null);
    localSectionsRef.current = null;
    preDragSnapshotRef.current = null;
    subtaskDropTargetRef.current = null;
    setSubtaskDropTargetId(null);
    setDragOverSectionId(null);
    dragIntentRef.current = null;
    setDragIntent(null);
    detailSubtaskDragRef.current = null;
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  };

  const handleCreateSection = async (atTop?: boolean) => {
    if (!newSectionName.trim()) return;
    const created = await api.sections.create(project.id, { name: newSectionName.trim() }) as { id: string };
    if (atTop) {
      // Reorder to place the new section at the top
      const reordered = [created.id, ...sections.map((s) => s.id)].map((id, i) => ({ id, order: i }));
      await api.reorder(reordered, "section");
    }
    setNewSectionName("");
    setAddingSection(false);
    setAddingSectionAtTop(false);
    await onRefresh();
    // Open task input in the newly created section
    setAddingTaskInSection(created.id);
    setNewTaskTitle("");
  };

  const handleDeleteSection = async (sectionId: string) => {
    const section = sections.find((s) => s.id === sectionId);
    if (section && section.tasks.length > 0) {
      setConfirmDeleteSection(section);
      return;
    }
    await api.sections.delete(project.id, sectionId);
    onRefresh();
  };

  const confirmAndDeleteSection = async () => {
    if (!confirmDeleteSection) return;
    await api.sections.delete(project.id, confirmDeleteSection.id);
    setConfirmDeleteSection(null);
    onRefresh();
  };

  const handleCreateTask = async (sectionId: string, afterTaskId?: string, parentId?: string): Promise<string | undefined> => {
    if (!newTaskTitle.trim()) return;
    creatingTaskRef.current = true;
    const title = newTaskTitle.trim();
    const created = await api.tasks.create({ title, sectionId, parentId }) as { id: string };
    const ref = { id: created.id };

    // If inserting after a specific task, reorder to place it right after
    if (afterTaskId) {
      if (parentId) {
        // Reorder subtasks within the parent
        const parentTask = sections.flatMap((s) => s.tasks).find((t) => t.id === parentId);
        if (parentTask) {
          const subtasks = parentTask.subtasks || [];
          const afterIdx = subtasks.findIndex((t) => t.id === afterTaskId);
          const reordered = [
            ...subtasks.slice(0, afterIdx + 1),
            { id: created.id } as TaskWithRelations,
            ...subtasks.slice(afterIdx + 1),
          ].map((t, i) => ({ id: t.id, order: i }));
          await api.reorder(reordered, "task");
        }
      } else {
        const section = sections.find((s) => s.id === sectionId);
        if (section) {
        const afterIdx = section.tasks.findIndex((t) => t.id === afterTaskId);
        const reordered = [...section.tasks];
        // Insert the new task after the target
        const newItems = [
          ...reordered.slice(0, afterIdx + 1),
          { id: created.id } as TaskWithRelations,
          ...reordered.slice(afterIdx + 1),
        ].map((t, i) => ({ id: t.id, order: i }));
        await api.reorder(newItems, "task");
      }
      }
    }

    pushAction?.({
      undo: async () => { await api.tasks.delete(ref.id); },
      redo: async () => { const re = await api.tasks.create({ title, sectionId }) as { id: string }; ref.id = re.id; },
    });
    setNewTaskTitle("");

    if (afterTaskId) {
      // Inline insert: show input after the newly created task
      setAddingTaskInSection(null);
      setInsertingAfterTaskId(ref.id);
    } else {
      // Bottom "+ Task" flow: keep the bottom input open for chain-adding
      // addingTaskInSection stays set, input stays mounted
    }
    onRefresh();
    return ref.id;
  };

  const handleCreateTaskAtTop = async (sectionId: string) => {
    if (!newTaskTitle.trim()) return;
    creatingTaskRef.current = true;
    const title = newTaskTitle.trim();
    const created = await api.tasks.create({ title, sectionId }) as { id: string };
    const ref = { id: created.id };

    // Reorder to place new task at position 0 (top)
    const section = sections.find((s) => s.id === sectionId);
    if (section) {
      const reordered = [
        { id: created.id } as TaskWithRelations,
        ...section.tasks,
      ].map((t, i) => ({ id: t.id, order: i }));
      await api.reorder(reordered, "task");
    }

    pushAction?.({
      undo: async () => { await api.tasks.delete(ref.id); },
      redo: async () => { const re = await api.tasks.create({ title, sectionId }) as { id: string }; ref.id = re.id; },
    });
    setNewTaskTitle("");
    // Keep input open for chain-adding
    onRefresh();
    creatingTaskRef.current = false;
  };

  const handleToggleComplete = async (task: TaskWithRelations) => {
    const wasCompleted = task.completed;
    await api.tasks.update(task.id, { completed: !wasCompleted });

    // Reorder: move completed tasks below uncompleted ones
    const section = sections.find((s) => s.id === task.sectionId);
    if (section) {
      const updatedTasks = section.tasks.map((t) =>
        t.id === task.id ? { ...t, completed: !wasCompleted } : t
      );
      const uncompleted = updatedTasks.filter((t) => !t.completed);
      const completed = updatedTasks.filter((t) => t.completed);
      const sorted = [...uncompleted, ...completed];
      await api.reorder(sorted.map((t, i) => ({ id: t.id, order: i })), "task");
    }

    pushAction?.({
      undo: async () => { await api.tasks.update(task.id, { completed: wasCompleted }); },
      redo: async () => { await api.tasks.update(task.id, { completed: !wasCompleted }); },
    });
    onRefresh();
  };

  const executeDeleteTask = async (task: TaskWithRelations) => {
    const taskData = {
      title: task.title,
      sectionId: task.sectionId,
      priority: task.priority || undefined,
      dueDate: task.dueDate || undefined,
      parentId: task.parentId || undefined,
    };
    const desc = task.description;
    const wasCompleted = task.completed;
    try {
      await api.tasks.delete(task.id);
    } catch {
      // Task may already be deleted (e.g. duplicate Delete key events)
      return;
    }
    const ref = { id: task.id };
    pushAction?.({
      undo: async () => {
        const created = await api.tasks.create(taskData) as { id: string };
        const updates: Record<string, unknown> = {};
        if (desc) updates.description = desc;
        if (wasCompleted) updates.completed = true;
        if (Object.keys(updates).length > 0) await api.tasks.update(created.id, updates);
        ref.id = created.id;
      },
      redo: async () => { await api.tasks.delete(ref.id); },
    });
    if (selectedTask?.id === task.id) setSelectedTask(null);
    onRefresh();
  };

  const handleDeleteTask = async (taskId: string) => {
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;
    if (task.subtasks.length > 0 || (task._count?.attachments ?? 0) > 0) {
      setConfirmDeleteTask(task);
      return;
    }
    await executeDeleteTask(task);
  };

  const confirmAndDeleteTask = async () => {
    if (!confirmDeleteTask) return;
    const task = confirmDeleteTask;
    setConfirmDeleteTask(null);
    await executeDeleteTask(task);
  };

  const deleteMultipleTasks = async (tasks: TaskWithRelations[]) => {
    for (const task of tasks) {
      try { await api.tasks.delete(task.id); } catch { /* may already be deleted */ }
    }
    setSelectedTask(null);
    setSelectedTaskIds(new Set());
    onRefresh();
  };

  const handleDeleteMultiple = () => {
    const tasks = allTasks.filter((t) => selectedTaskIds.has(t.id));
    if (tasks.length === 0) return;
    const needsConfirm = tasks.some((t) => t.subtasks.length > 0 || (t._count?.attachments ?? 0) > 0);
    if (needsConfirm) {
      setConfirmDeleteMultiple(tasks);
    } else {
      deleteMultipleTasks(tasks);
    }
  };

  const handleSelectTask = async (task: TaskWithRelations) => {
    selectingTaskIdRef.current = task.id;
    const full = await api.tasks.get(task.id);
    // Only apply if user hasn't navigated to a different task in the meantime
    if (selectingTaskIdRef.current === task.id) {
      setSelectedTask(full as TaskWithRelations);
    }
    setSelectedTaskIds(new Set());
    setSelectedSectionId(null);
  };

  // Refresh the currently-selected task's data without changing which task
  // is intended — safe to call from stale closures (e.g. after async saves)
  const refreshSelectedTask = useCallback(async () => {
    const taskId = selectingTaskIdRef.current;
    if (!taskId) return;
    const full = await api.tasks.get(taskId);
    if (selectingTaskIdRef.current === taskId) {
      setSelectedTask(full as TaskWithRelations);
    }
  }, []);

  const handleTaskClick = (task: TaskWithRelations, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: toggle task in multi-selection
      e.preventDefault();
      setSelectedTaskIds((prev) => {
        const next = new Set(prev);
        // If single-select was active, include it in multi-set
        if (selectedTask && next.size === 0) {
          next.add(selectedTask.id);
        }
        if (next.has(task.id)) {
          next.delete(task.id);
        } else {
          next.add(task.id);
        }
        return next;
      });
      setSelectedTask(null);
      lastClickedTaskIdRef.current = task.id;
    } else if (e.shiftKey && lastClickedTaskIdRef.current) {
      // Shift+click: range select
      e.preventDefault();
      const flatTasks = sections.flatMap((s) => collectAllTasksDeep(s.tasks));
      const lastIdx = flatTasks.findIndex((t) => t.id === lastClickedTaskIdRef.current);
      const curIdx = flatTasks.findIndex((t) => t.id === task.id);
      if (lastIdx !== -1 && curIdx !== -1) {
        const start = Math.min(lastIdx, curIdx);
        const end = Math.max(lastIdx, curIdx);
        const rangeIds = flatTasks.slice(start, end + 1).map((t) => t.id);
        setSelectedTaskIds((prev) => {
          const next = new Set(prev);
          if (selectedTask && next.size === 0) next.add(selectedTask.id);
          for (const id of rangeIds) next.add(id);
          return next;
        });
        setSelectedTask(null);
      }
    } else {
      // Normal click: single select
      setSelectedTaskIds(new Set());
      lastClickedTaskIdRef.current = task.id;
      // Close the "+ Task" input if open with no text
      if (addingTaskInSection && !newTaskTitle.trim()) {
        setAddingTaskInSection(null);
        setNewTaskTitle("");
      }
      handleSelectTask(task);
    }
  };

  const clearMultiSelect = () => {
    setSelectedTaskIds(new Set());
  };

  // Escape clears multi-select
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedTaskIds.size > 0) {
        clearMultiSelect();
      }
      if (e.key === "Escape" && insertingAfterTaskId) {
        setInsertingAfterTaskId(null);
        setNewTaskTitle("");
      }
      if (e.key === "Escape" && clipboard?.mode === "cut") {
        setClipboard(null);
      }
      const el = document.activeElement;
      const isEditing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable;

      // Alt+Arrow: move selected task up/down within its section
      if (!isEditing && e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp") && selectedTask) {
        e.preventDefault();
        const section = sections.find((s) => s.id === selectedTask.sectionId);
        if (!section) return;
        const idx = section.tasks.findIndex((t) => t.id === selectedTask.id);
        if (idx === -1) return;
        const swapIdx = e.key === "ArrowDown" ? idx + 1 : idx - 1;
        if (swapIdx < 0 || swapIdx >= section.tasks.length) return;
        const reordered = [...section.tasks];
        [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
        const items = reordered.map((t, i) => ({ id: t.id, order: i }));
        // Optimistic local update
        const updatedSections = sections.map((s) =>
          s.id === section.id ? { ...s, tasks: reordered } : s
        );
        setLocalSections(updatedSections);
        localSectionsRef.current = updatedSections;
        api.reorder(items, "task").then(() => onRefresh());
        setTimeout(() => {
          document.querySelector(`[data-task-id="${selectedTask.id}"]`)?.scrollIntoView({ block: "nearest" });
        }, 0);
        return;
      }

      // Arrow key navigation through flat list of sections and tasks
      if (!isEditing && !e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        // Build flat list: section header, then its visible tasks (respecting expand/collapse)
        type NavItem = { type: "section"; sectionId: string } | { type: "task"; task: TaskWithRelations };
        const flatItems: NavItem[] = [];
        for (const s of sections) {
          flatItems.push({ type: "section", sectionId: s.id });
          if (!collapsedSections.has(s.id)) {
            const visibleItems = flattenTasks(s.tasks, expandedTasks);
            for (const item of visibleItems) {
              if (item.kind === "task") {
                if (!(clipboard?.mode === "cut" && clipboard.task.id === item.task.id)) {
                  flatItems.push({ type: "task", task: item.task });
                }
              }
            }
          }
        }
        if (flatItems.length === 0) return;

        // Find current index
        let currentIdx = -1;
        if (selectedTask) {
          currentIdx = flatItems.findIndex((item) => item.type === "task" && item.task.id === selectedTask.id);
        } else if (selectedSectionId) {
          currentIdx = flatItems.findIndex((item) => item.type === "section" && item.sectionId === selectedSectionId);
        }

        if (currentIdx === -1) {
          // Nothing selected — select first (Down) or last (Up)
          const target = e.key === "ArrowDown" ? flatItems[0] : flatItems[flatItems.length - 1];
          if (target.type === "section") {
            setSelectedSectionId(target.sectionId);
            setSelectedTask(null);
            setSelectedTaskIds(new Set());
            setTimeout(() => {
              document.querySelector(`[data-section-id="${target.sectionId}"]`)?.scrollIntoView({ block: "nearest" });
            }, 0);
          } else {
            handleSelectTask(target.task);
            setTimeout(() => {
              document.querySelector(`[data-task-id="${target.task.id}"]`)?.scrollIntoView({ block: "nearest" });
            }, 0);
          }
          return;
        }

        const nextIdx = e.key === "ArrowDown" ? currentIdx + 1 : currentIdx - 1;
        if (nextIdx >= 0 && nextIdx < flatItems.length) {
          const next = flatItems[nextIdx];
          if (next.type === "section") {
            setSelectedSectionId(next.sectionId);
            setSelectedTask(null);
            setSelectedTaskIds(new Set());
            setTimeout(() => {
              document.querySelector(`[data-section-id="${next.sectionId}"]`)?.scrollIntoView({ block: "nearest" });
            }, 0);
          } else {
            setSelectedSectionId(null);
            handleSelectTask(next.task);
            setTimeout(() => {
              document.querySelector(`[data-task-id="${next.task.id}"]`)?.scrollIntoView({ block: "nearest" });
            }, 0);
          }
        }
      }

      // Left/Right arrow: collapse/expand selected section
      if (!isEditing && !e.altKey && selectedSectionId && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const shouldCollapse = e.key === "ArrowLeft";
        const isCollapsed = collapsedSections.has(selectedSectionId);
        if (shouldCollapse && !isCollapsed) {
          toggleSection(selectedSectionId);
        } else if (!shouldCollapse && isCollapsed) {
          toggleSection(selectedSectionId);
        }
      }

      // Enter to insert a new task after the selected one
      if (!isEditing && e.key === "Enter" && selectedTask && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        setInsertingAfterTaskId(selectedTask.id);
        setNewTaskTitle("");
      }

      // Enter on selected section: add task at top of section
      if (!isEditing && e.key === "Enter" && selectedSectionId && !selectedTask && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        setAddingTaskAtTopOfSection(selectedSectionId);
        setNewTaskTitle("");
      }

      // Space to trigger inline edit on selected task
      if (!isEditing && e.key === " " && selectedTask && !insertingAfterTaskId && !addingTaskInSectionRef.current) {
        e.preventDefault();
        // Click the TaskRow's inner div (third level: data-task-id > sortable wrapper > TaskRow root)
        const wrapper = document.querySelector(`[data-task-id="${selectedTask.id}"]`);
        const taskRowEl = wrapper?.querySelector("[tabindex]") as HTMLElement;
        taskRowEl?.click();
      }

      // Delete selected task(s) or section
      if (e.key === "Delete" && !isEditing) {
        if (selectedTaskIds.size > 0) {
          e.preventDefault();
          handleDeleteMultiple();
        } else if (selectedSectionId) {
          e.preventDefault();
          const section = sections.find((s) => s.id === selectedSectionId);
          if (section) handleDeleteSection(section.id);
        } else if (selectedTask) {
          e.preventDefault();
          const task = selectedTask;
          if (task.subtasks.length > 0 || (task._count?.attachments ?? 0) > 0) {
            setConfirmDeleteTask(task);
          } else {
            executeDeleteTask(task);
          }
        }
      }
      // Ctrl+K to set hyperlink (works even while editing)
      if ((e.ctrlKey || e.metaKey) && e.key === "k" && selectedTask && !hyperlinkDialog) {
        e.preventDefault();
        setHyperlinkDialog({ taskId: selectedTask.id, url: selectedTask.hyperlink || "" });
      }
      // Ctrl+C / Ctrl+X for selected task(s)
      if (!isEditing && (e.ctrlKey || e.metaKey)) {
        if (e.key === "c" && (selectedTask || selectedTaskIds.size > 0)) {
          e.preventDefault();
          // Write titles to system clipboard for pasting into external apps
          const titles: string[] = [];
          if (selectedTaskIds.size > 0) {
            for (const s of sections) {
              for (const t of s.tasks) {
                if (selectedTaskIds.has(t.id)) titles.push(t.title);
              }
            }
          } else if (selectedTask) {
            titles.push(selectedTask.title);
          }
          if (titles.length > 0) {
            navigator.clipboard.writeText(titles.join("\n"));
          }
          if (selectedTask) {
            setClipboard({ task: selectedTask, mode: "copy" });
          }
        } else if (e.key === "x" && selectedTask) {
          e.preventDefault();
          setClipboard({ task: selectedTask, mode: "cut" });
          setSelectedTask(null);
        } else if (e.key === "v" && clipboard) {
          e.preventDefault();
          // Paste into selected section, or the section of the selected task, or first section
          const targetSectionId = selectedSectionId
            || (selectedTask ? selectedTask.sectionId : null)
            || sections[0]?.id;
          if (targetSectionId) {
            if (clipboard.mode === "copy") {
              api.tasks.create({
                title: clipboard.task.title,
                sectionId: targetSectionId,
                priority: clipboard.task.priority || undefined,
                dueDate: clipboard.task.dueDate ? new Date(clipboard.task.dueDate).toISOString() : undefined,
              }).then(() => onRefresh());
            } else {
              api.tasks.update(clipboard.task.id, { sectionId: targetSectionId }).then(() => {
                setClipboard(null);
                onRefresh();
              });
            }
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedTaskIds.size, selectedTask, selectedSectionId, clipboard, sections, collapsedSections, insertingAfterTaskId, onRefresh, hyperlinkDialog]);

  // Paste hyperlink as subtask
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const el = document.activeElement;
      const isEditing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable;
      if (isEditing || !selectedTask) return;

      const html = e.clipboardData?.getData("text/html") || "";
      const text = e.clipboardData?.getData("text/plain") || "";

      // Extract hyperlink from HTML (e.g. pasted from Teams)
      const anchorMatch = html.match(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
      let title = "";
      if (anchorMatch) {
        const url = anchorMatch[1];
        const linkText = anchorMatch[2].replace(/<[^>]+>/g, "").trim();
        title = linkText && linkText !== url ? `${linkText} ${url}` : url;
      } else {
        // Check if plain text is/contains a URL
        const urlMatch = text.match(/https?:\/\/[^\s<>)"',]+/);
        if (!urlMatch) return;
        title = text.trim();
      }

      e.preventDefault();
      const parentId = selectedTask.parentId ? selectedTask.parentId : selectedTask.id;
      const sectionId = selectedTask.sectionId;
      api.tasks.create({ title, sectionId, parentId }).then(() => {
        // Expand the parent task to show the new subtask
        setExpandedTasks((prev) => new Set(prev).add(parentId));
        onRefresh();
      });
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [selectedTask, onRefresh]);

  const handleBulkComplete = async () => {
    const ids = Array.from(selectedTaskIds);
    for (const id of ids) {
      await api.tasks.update(id, { completed: true });
    }
    clearMultiSelect();
    onRefresh();
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedTaskIds);
    for (const id of ids) {
      await api.tasks.delete(id);
    }
    clearMultiSelect();
    onRefresh();
  };

  return (
    <div className="flex h-full">
      {/* Task context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                setClipboard({ task: contextMenu.task, mode: "copy" });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy task
            </button>
            <button
              onClick={() => {
                setClipboard({ task: contextMenu.task, mode: "cut" });
                setSelectedTask(null);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-7 7m7-7l-7-7" />
              </svg>
              Cut task
            </button>
            <button
              onClick={() => {
                setHyperlinkDialog({ taskId: contextMenu.task.id, url: contextMenu.task.hyperlink || "" });
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Hyperlink
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={() => {
                const task = contextMenu.task;
                setContextMenu(null);
                handleDeleteTask(task.id);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete task
            </button>
          </div>
        </>
      )}
      {/* Section context menu */}
      {sectionContextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setSectionContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setSectionContextMenu(null); }} />
          <div
            className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[160px]"
            style={{ left: sectionContextMenu.x, top: sectionContextMenu.y }}
          >
            {clipboard && (
              <>
                <button
                  onClick={async () => {
                    const section = sectionContextMenu.section;
                    setSectionContextMenu(null);
                    if (clipboard.mode === "copy") {
                      await api.tasks.create({
                        title: clipboard.task.title,
                        sectionId: section.id,
                        priority: clipboard.task.priority || undefined,
                        dueDate: clipboard.task.dueDate ? new Date(clipboard.task.dueDate).toISOString() : undefined,
                      });
                    } else {
                      await api.tasks.update(clipboard.task.id, { sectionId: section.id });
                      setClipboard(null);
                    }
                    onRefresh();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Paste task here
                </button>
                <div className="border-t border-gray-100 my-1" />
              </>
            )}
            <button
              onClick={() => {
                const section = sectionContextMenu.section;
                setSectionContextMenu(null);
                setEditingSectionId(section.id);
                setEditSectionName(section.name);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Rename section
            </button>
            <button
              onClick={() => {
                const section = sectionContextMenu.section;
                setSectionContextMenu(null);
                handleDeleteSection(section.id);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete section
            </button>
          </div>
        </>
      )}
      {/* Delete multiple tasks confirmation modal */}
      {confirmDeleteMultiple && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={() => setConfirmDeleteMultiple(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { const tasks = confirmDeleteMultiple; setConfirmDeleteMultiple(null); deleteMultipleTasks(tasks); }
            else if (e.key === "Escape") setConfirmDeleteMultiple(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 w-80 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Delete {confirmDeleteMultiple.length} tasks</h3>
            <p className="text-sm text-gray-500 mb-4">
              Some tasks have subtasks or attachments. This can&apos;t be undone. Are you sure?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteMultiple(null)}
                className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={() => { const tasks = confirmDeleteMultiple; setConfirmDeleteMultiple(null); deleteMultipleTasks(tasks); }}
                className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete all
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete task confirmation modal */}
      {confirmDeleteTask && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={() => setConfirmDeleteTask(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmAndDeleteTask();
            else if (e.key === "Escape") setConfirmDeleteTask(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 w-80 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Delete task</h3>
            <p className="text-sm text-gray-500 mb-4">
              This task has{" "}
              {[
                confirmDeleteTask.subtasks.length > 0 && `${confirmDeleteTask.subtasks.length} subtask${confirmDeleteTask.subtasks.length > 1 ? "s" : ""}`,
                (confirmDeleteTask._count?.attachments ?? 0) > 0 && `${confirmDeleteTask._count!.attachments} attachment${confirmDeleteTask._count!.attachments > 1 ? "s" : ""}`,
              ].filter(Boolean).join(" and ")}
              . This can&apos;t be undone. Are you sure?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteTask(null)}
                className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={confirmAndDeleteTask}
                className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete section confirmation modal */}
      {confirmDeleteSection && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={() => setConfirmDeleteSection(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") confirmAndDeleteSection();
            else if (e.key === "Escape") setConfirmDeleteSection(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 w-80 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Delete section</h3>
            <p className="text-sm text-gray-500 mb-4">
              This section has {confirmDeleteSection.tasks.length} task{confirmDeleteSection.tasks.length > 1 ? "s" : ""}. This can&apos;t be undone. Are you sure?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteSection(null)}
                className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={confirmAndDeleteSection}
                className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Hyperlink dialog */}
      {hyperlinkDialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={() => setHyperlinkDialog(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setHyperlinkDialog(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Set hyperlink</h3>
            <input
              autoFocus
              type="url"
              value={hyperlinkDialog.url}
              onChange={(e) => setHyperlinkDialog({ ...hyperlinkDialog, url: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const url = hyperlinkDialog.url.trim() || null;
                  api.tasks.update(hyperlinkDialog.taskId, { hyperlink: url }).then(() => onRefresh());
                  setHyperlinkDialog(null);
                }
              }}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <div className="flex justify-end gap-2 mt-4">
              {hyperlinkDialog.url && (
                <button
                  onClick={() => {
                    api.tasks.update(hyperlinkDialog.taskId, { hyperlink: null }).then(() => onRefresh());
                    setHyperlinkDialog(null);
                  }}
                  className="px-3 py-1.5 text-sm text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors mr-auto"
                >
                  Remove
                </button>
              )}
              <button
                onClick={() => setHyperlinkDialog(null)}
                className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const url = hyperlinkDialog.url.trim() || null;
                  api.tasks.update(hyperlinkDialog.taskId, { hyperlink: url }).then(() => onRefresh());
                  setHyperlinkDialog(null);
                }}
                className="px-3 py-1.5 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
      {/* Task list */}
      <div ref={scrollContainerRef} className={`flex-1 overflow-auto p-6 ${selectedTask ? "hidden md:block" : ""}`} onClick={(e) => {
        if (selectedTask && !(e.target as HTMLElement).closest('[data-sortable-task-id], button, a, input, textarea, select, [contenteditable="true"], [role="button"]')) {
          selectingTaskIdRef.current = null;
          setSelectedTask(null);
        }
      }}>
        <SortableContext
          items={sections.map((s) => `${SECTION_SORT_PREFIX}${s.id}`)}
          strategy={verticalListSortingStrategy}
        >
        {/* Add section above first section */}
        {allTasks.length > 0 && (!filterHighPriority || sections.some((s) => s.tasks.some((t) => t.priority === "HIGH" || t.subtasks.some((st) => st.priority === "HIGH")))) && (
          addingSectionAtTop ? (
            <div
              className="mb-2"
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  if (newSectionName.trim()) {
                    handleCreateSection(true);
                  }
                  setAddingSectionAtTop(false);
                  setNewSectionName("");
                }
              }}
            >
              <input
                type="text"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateSection(true);
                  if (e.key === "Escape") { setAddingSectionAtTop(false); setNewSectionName(""); }
                }}
                placeholder="Section name"
                data-unsaved-check
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                autoFocus
              />
              <div className="flex gap-2 mt-2">
                <button onClick={() => handleCreateSection(true)} className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                  Add Section
                </button>
                <button onClick={() => { setAddingSectionAtTop(false); setNewSectionName(""); }} className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingSectionAtTop(true)}
              className="flex items-center gap-2 mb-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Section
            </button>
          )
        )}

        {sections.filter((section) => !filterHighPriority || section.tasks.some((t) => t.priority === "HIGH" || t.subtasks.some((s) => s.priority === "HIGH"))).map((section) => (
          <SortableSection key={section.id} sectionId={section.id} prefix={SECTION_SORT_PREFIX} isDragging={activeSectionDragId === section.id} isSectionDragActive={!!activeSectionDragId} isDropTarget={dragOverSectionId === section.id && !!activeTaskId}>
            {(sectionDragListeners, sectionDragAttributes) => (<>
            {/* Section header */}
            <DroppableSectionHeader sectionId={section.id} isDraggingTask={!!activeTaskId} disabled={!!activeSectionDragId}>
            <div
              data-section-id={section.id}
              className={`flex items-center gap-2 mb-2 group cursor-grab active:cursor-grabbing rounded-lg px-1 py-0.5 transition-colors ${
                selectedSectionId === section.id ? "bg-indigo-50 ring-1 ring-indigo-200" : ""
              }`}
              {...sectionDragListeners}
              {...sectionDragAttributes}
              onClick={(e) => {
                // Don't select section if clicking the collapse button
                if ((e.target as HTMLElement).closest("button")) return;
                setSelectedSectionId(section.id);
                setSelectedTask(null);
                setSelectedTaskIds(new Set());
              }}
              onContextMenu={(e) => { e.preventDefault(); setSectionContextMenu({ x: e.clientX, y: e.clientY, section }); }}
            >
              <button
                onClick={() => toggleSection(section.id)}
                className="p-0.5 hover:bg-gray-100 rounded"
              >
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${collapsedSections.has(section.id) ? "" : "rotate-90"}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <h3 className="font-semibold text-gray-900">
                {editingSectionId === section.id ? (
                  <input
                    autoFocus
                    value={editSectionName}
                    onChange={(e) => setEditSectionName(e.target.value)}
                    onBlur={async () => {
                      const trimmed = editSectionName.trim();
                      if (trimmed && trimmed !== section.name) {
                        await api.sections.update(project.id, section.id, { name: trimmed });
                        onRefresh();
                      }
                      setEditingSectionId(null);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditingSectionId(null);
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-gray-900 bg-white border border-indigo-300 rounded px-1 py-0 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <span onDoubleClick={(e) => { e.stopPropagation(); setEditingSectionId(section.id); setEditSectionName(section.name); }}>
                    {section.name}
                  </span>
                )}
              </h3>
              {(() => {
                const totalItems = section.tasks.reduce((sum, t) => sum + 1 + t.subtasks.length, 0);
                const completedItems = section.tasks.reduce((sum, t) => sum + (t.completed ? 1 : 0) + t.subtasks.filter(s => s.completed).length, 0);
                if (totalItems === 0 || completedItems === 0) return null;
                const pct = Math.round((completedItems / totalItems) * 100);
                return (
                  <div className="flex items-center gap-1.5 ml-1">
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-400">{pct}%</span>
                  </div>
                );
              })()}
            </div>
            </DroppableSectionHeader>

            {/* Tasks */}
            {!collapsedSections.has(section.id) && !activeSectionDragId && (() => {
              const filteredTasks = section.tasks.filter((t) => {
                if (clipboard?.mode === "cut" && clipboard.task.id === t.id) return false;
                if (filterHighPriority && t.priority !== "HIGH" && !t.subtasks.some((s) => s.priority === "HIGH")) return false;
                return true;
              });
              const flatList = flattenTasks(filteredTasks, expandedTasks);
              return (
              <SortableContext
                items={flatList.filter((it) => it.kind === "task").map((it) => (it as { kind: "task"; task: TaskWithRelations; depth: number }).task.id)}
                strategy={verticalListSortingStrategy}
              >
                <DroppableSection sectionId={section.id} disabled={!!activeSectionDragId}>
                {addingTaskAtTopOfSection === section.id && (
                  <div
                    className="flex items-center gap-2 py-1.5 px-2"
                    onBlur={(e) => {
                      if (creatingTaskRef.current) return;
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        if (newTaskTitle.trim()) {
                          handleCreateTaskAtTop(section.id);
                        } else {
                          setAddingTaskAtTopOfSection(null);
                          setNewTaskTitle("");
                        }
                      }
                    }}
                  >
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") handleCreateTaskAtTop(section.id);
                        if (e.key === "Escape") {
                          setAddingTaskAtTopOfSection(null);
                          setNewTaskTitle("");
                        }
                      }}
                      ref={(el) => {
                        newTaskInputRef.current = el;
                        if (el) el.focus();
                      }}
                      placeholder="Task name"
                      data-unsaved-check
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      autoFocus
                    />
                    <button
                      onClick={() => { setAddingTaskAtTopOfSection(null); setNewTaskTitle(""); }}
                      className="px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {flatList.map((item, _flatIdx) => {
                  if (item.kind === "add-subtask") {
                    if (insertingAfterTaskId) return null;
                    return (
                      <button
                        key={`add-sub-${item.parentTask.id}`}
                        className="flex items-center gap-2 w-full text-left pr-2 py-1 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded"
                        style={{ paddingLeft: `${item.depth * 24 + 36}px` }}
                        onClick={() => {
                          const lastSubtask = item.parentTask.subtasks[item.parentTask.subtasks.length - 1];
                          if (lastSubtask) {
                            setInsertingAfterTaskId(lastSubtask.id);
                            setNewTaskTitle("");
                          }
                        }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Subtask
                      </button>
                    );
                  }

                  const { task, depth } = item;
                  return (
                  <div key={task.id} data-task-id={task.id}>
                  {/* Insertion line indicator — before */}
                  {dragIntent?.type === "insert" && dragIntent.targetId === task.id && dragIntent.position === "before" && (
                    <div className="h-0.5 bg-indigo-500 rounded-full my-0.5" style={{ marginLeft: `${depth * 24 + 36}px`, marginRight: "8px" }} />
                  )}
                  <SortableTaskRow
                    task={task}
                    depth={depth}
                    isSelected={selectedTask?.id === task.id}
                    isMultiSelected={selectedTaskIds.has(task.id)}
                    onSelect={(e) => handleTaskClick(task, e)}
                    onToggleComplete={() => handleToggleComplete(task)}
                    onDelete={() => handleDeleteTask(task.id)}
                    onContextMenu={(e) => {
                      if ((e.target as HTMLElement).closest('a')) return;
                      setContextMenu({ x: e.clientX, y: e.clientY, task });
                    }}
                    onUpdate={async (data) => {
                      await api.tasks.update(task.id, data);
                      if (selectingTaskIdRef.current === task.id) {
                        const full = await api.tasks.get(task.id);
                        if (selectingTaskIdRef.current === task.id) {
                          setSelectedTask(full as TaskWithRelations);
                        }
                      }
                      onRefresh();
                    }}
                    showPriorityColumn={showPriorityColumn}
                    showDueDateColumn={showDueDateColumn}
                    showRequestedByColumn={showRequestedByColumn}
                    isDragOverlay={false}
                    sectionDragging={!!activeSectionDragId}
                    isSubtaskDropTarget={dragIntent?.type === "nest" && dragIntent.targetId === task.id}
                    isExpanded={expandedTasks.has(task.id)}
                    onToggleExpand={() => {
                      setExpandedTasks((prev) => {
                        const next = new Set(prev);
                        if (next.has(task.id)) next.delete(task.id);
                        else next.add(task.id);
                        return next;
                      });
                    }}
                  />
                  {/* Insertion line indicator — after */}
                  {dragIntent?.type === "insert" && dragIntent.targetId === task.id && dragIntent.position === "after" && (
                    <div className="h-0.5 bg-indigo-500 rounded-full my-0.5" style={{ marginLeft: `${depth * 24 + 36}px`, marginRight: "8px" }} />
                  )}
                  {/* Inline task creation */}
                  {insertingAfterTaskId === task.id && (
                    <div
                      className="flex items-center gap-2 py-1.5 px-2"
                      style={{ paddingLeft: `${depth * 24 + 8}px` }}
                      onBlur={(e) => {
                        if (creatingTaskRef.current) return;
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          if (newTaskTitle.trim()) {
                            handleCreateTask(section.id, task.id, task.parentId ?? undefined);
                          } else {
                            setInsertingAfterTaskId(null);
                            setNewTaskTitle("");
                          }
                        }
                      }}
                    >
                      <input
                        type="text"
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        onKeyDown={async (e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === "k") {
                            e.preventDefault();
                            if (newTaskTitle.trim()) {
                              const taskId = await handleCreateTask(section.id, task.id, task.parentId ?? undefined);
                              if (taskId) setHyperlinkDialog({ taskId, url: "" });
                            }
                          }
                          if (e.key === "Enter") handleCreateTask(section.id, task.id, task.parentId ?? undefined);
                          if (e.key === "Escape") {
                            setInsertingAfterTaskId(null);
                            setNewTaskTitle("");
                          }
                        }}
                        placeholder={depth > 0 ? "Subtask name" : "Task name"}
                        data-unsaved-check
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        autoFocus
                        ref={(el) => {
                          if (el) newTaskInputRef.current = el;
                        }}
                      />
                    </div>
                  )}
                  </div>
                  );
                })}

                {/* Add task */}
                {addingTaskInSection === section.id ? (
                  <div
                    className="flex items-center gap-2 py-1.5 px-2"
                    onBlur={(e) => {
                      if (creatingTaskRef.current) return;
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        if (newTaskTitle.trim()) {
                          handleCreateTask(section.id);
                        } else {
                          setAddingTaskInSection(null);
                          setNewTaskTitle("");
                        }
                      }
                    }}
                  >
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      onKeyDown={async (e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key === "k") {
                          e.preventDefault();
                          if (newTaskTitle.trim()) {
                            const taskId = await handleCreateTask(section.id);
                            if (taskId) setHyperlinkDialog({ taskId, url: "" });
                          }
                        }
                        if (e.key === "Enter") handleCreateTask(section.id);
                        if (e.key === "Escape") {
                          setAddingTaskInSection(null);
                          setNewTaskTitle("");
                        }
                      }}
                      ref={(el) => {
                        newTaskInputRef.current = el;
                        if (el) el.focus();
                      }}
                      placeholder="Task name"
                      data-unsaved-check
                      className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button
                      onClick={() => { setAddingTaskInSection(null); setNewTaskTitle(""); }}
                      className="px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 rounded"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingTaskInSection(section.id)}
                    className="flex items-center gap-2 py-1.5 pl-[36px] pr-2 text-sm text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded w-full transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Task
                  </button>
                )}
              </DroppableSection>              </SortableContext>
              );
            })()}
          </>)}
          </SortableSection>
        ))}
        </SortableContext>

        {/* Add section */}
        {addingSection ? (
          <div
            className="mt-4"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                if (newSectionName.trim()) {
                  handleCreateSection();
                }
                setAddingSection(false);
                setNewSectionName("");
              }
            }}
          >
            <input
              type="text"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateSection();
                if (e.key === "Escape") setAddingSection(false);
              }}
              placeholder="Section name"
              data-unsaved-check
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              autoFocus
            />
            <div className="flex gap-2 mt-2">
              <button onClick={handleCreateSection} className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                Add Section
              </button>
              <button onClick={() => setAddingSection(false)} className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingSection(true)}
            className="mt-4 flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Section
          </button>
        )}

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="opacity-90 shadow-lg rounded-lg relative">
              <TaskRow
                task={activeTask}
                isSelected={false}
                isMultiSelected={false}
                onSelect={() => {}}
                onToggleComplete={() => {}}
                onDelete={() => {}}
                onUpdate={() => {}}
                showPriorityColumn={showPriorityColumn}
                showDueDateColumn={showDueDateColumn}
                showRequestedByColumn={showRequestedByColumn}
              />
              {selectedTaskIds.size > 0 && selectedTaskIds.has(activeTask.id) && (
                <div className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow">
                  {selectedTaskIds.size}
                </div>
              )}
            </div>
          ) : activeSectionDragId ? (
            <div className="opacity-90 shadow-lg rounded-lg bg-white border border-gray-200 px-4 py-2">
              <h3 className="font-semibold text-gray-900">
                {sections.find((s) => s.id === activeSectionDragId)?.name}
              </h3>
            </div>
          ) : null}
        </DragOverlay>
      </div>

      {/* Multi-select bulk action bar */}
      {selectedTaskIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-gray-200 rounded-xl shadow-xl px-4 py-2.5">
          <span className="text-sm font-medium text-gray-700">{selectedTaskIds.size} selected</span>
          <div className="w-px h-5 bg-gray-200" />
          <button
            onClick={handleBulkComplete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-green-700 hover:bg-green-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Complete
          </button>
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <button
            onClick={clearMultiSelect}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
            title="Clear selection"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Task detail panel */}
      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          onClose={() => { selectingTaskIdRef.current = null; setSelectedTask(null); }}
          onRefresh={() => {
            refreshSelectedTask();
            onRefresh();
          }}
          onDelete={() => handleDeleteTask(selectedTask.id)}
          pushAction={pushAction}
          onSelectTask={async (taskId) => {
            selectingTaskIdRef.current = taskId;
            const full = await api.tasks.get(taskId);
            if (selectingTaskIdRef.current === taskId) {
              setSelectedTask(full as TaskWithRelations);
            }
          }}
        />
      )}
      {/* Project detail panel (shown when no task selected) */}
      {!selectedTask && (
        <ProjectDetail
          project={project}
          onRefresh={onRefresh}
        />
      )}
      </DndContext>
    </div>
  );
}

/* ──── Sortable section wrapper ──── */

function SortableSection({ sectionId, prefix, isDragging, isSectionDragActive, isDropTarget, children }: { sectionId: string; prefix: string; isDragging: boolean; isSectionDragActive: boolean; isDropTarget?: boolean; children: (listeners: ReturnType<typeof useSortable>["listeners"], attributes: ReturnType<typeof useSortable>["attributes"]) => React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: `${prefix}${sectionId}` });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className={`mb-6 rounded-lg transition-colors ${isDropTarget ? "bg-indigo-50 ring-2 ring-indigo-300" : ""}`}>
      {children(listeners ?? {}, attributes ?? {})}
    </div>
  );
}

/* ──── Droppable section header (for dropping tasks onto section name) ──── */

function DroppableSectionHeader({ sectionId, isDraggingTask, disabled, children }: { sectionId: string; isDraggingTask: boolean; disabled?: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `section-header-${sectionId}`, disabled });
  return (
    <div ref={setNodeRef} className="rounded transition-colors">
      {children}
    </div>
  );
}

/* ──── Droppable section container ──── */

function DroppableSection({ sectionId, disabled, children }: { sectionId: string; disabled?: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `section-droppable-${sectionId}`, disabled });
  return (
    <div ref={setNodeRef} className="ml-3 min-h-[8px] rounded transition-colors">
      {children}
    </div>
  );
}

/* ──── Sortable wrapper for TaskRow ──── */

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableTaskRowProps {
  task: TaskWithRelations;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onToggleComplete: () => void;
  onDelete: () => void;
  onUpdate: (data: { title: string }) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  showPriorityColumn?: boolean;
  showDueDateColumn?: boolean;
  showRequestedByColumn?: boolean;
  isDragOverlay: boolean;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  isSubtask?: boolean;
  sectionDragging?: boolean;
  isSubtaskDropTarget?: boolean;
  depth?: number;
}

function SortableTaskRow({ task, isDragOverlay, sectionDragging, depth = 0, ...props }: SortableTaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({ id: task.id, disabled: sectionDragging });

  // Don't apply SortableContext transforms — we use insertion line indicators instead
  const style: React.CSSProperties = {
    opacity: isDragging ? 0.4 : 1,
  };

  // Filter dnd-kit listeners so keyboard events from inputs don't trigger drag
  const filteredListeners = Object.fromEntries(
    Object.entries(listeners ?? {}).map(([key, handler]) => {
      if (key === 'onKeyDown') {
        return [key, (e: React.KeyboardEvent) => {
          const target = e.target as HTMLElement;
          if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
          (handler as (e: React.KeyboardEvent) => void)?.(e);
        }];
      }
      return [key, handler];
    })
  );

  return (
    <div ref={setNodeRef} style={style} data-sortable-task-id={task.id} {...attributes} {...filteredListeners}>
      <TaskRow task={task} depth={depth} {...props} />
    </div>
  );
}
