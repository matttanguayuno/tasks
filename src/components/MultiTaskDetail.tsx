"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import AssigneeInput from "./AssigneeInput";
import type { TaskWithRelations, Sprint, TaskAssignee } from "@/lib/types";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const PRIORITY_LABELS: Record<string, string> = { LOW: "Low", MEDIUM: "Med", HIGH: "High" };
const PRIORITY_COLORS: Record<string, string> = { LOW: "bg-blue-200 text-blue-800", MEDIUM: "bg-amber-200 text-amber-800", HIGH: "bg-red-200 text-red-800" };
const PRIORITY_COLORS_IDLE: Record<string, string> = { LOW: "bg-blue-50 text-blue-600 hover:bg-blue-100", MEDIUM: "bg-amber-50 text-amber-600 hover:bg-amber-100", HIGH: "bg-red-50 text-red-600 hover:bg-red-100" };

interface MultiTaskDetailProps {
  tasks: TaskWithRelations[];
  projectId: string;
  onClose: () => void;
  onRefresh: () => void;
}

export default function MultiTaskDetail({ tasks, projectId, onClose, onRefresh }: MultiTaskDetailProps) {
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [sprintLoading, setSprintLoading] = useState(true);
  // Map: sprintId -> Set of taskIds in that sprint
  const [taskSprintMap, setTaskSprintMap] = useState<Map<string, Set<string>>>(new Map());

  // Compute common values
  const allCompleted = tasks.every((t) => t.completed);
  const noneCompleted = tasks.every((t) => !t.completed);
  const allInProgress = tasks.every((t) => t.inProgress);
  const noneInProgress = tasks.every((t) => !t.inProgress);

  const priorities = new Set(tasks.map((t) => t.priority));
  const commonPriority = priorities.size === 1 ? tasks[0].priority : null;

  const dueDates = new Set(tasks.map((t) => t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : ""));
  const commonDueDate = dueDates.size === 1 ? (tasks[0].dueDate ? new Date(tasks[0].dueDate).toISOString().slice(0, 10) : "") : null;

  const requestedBys = new Set(tasks.map((t) => t.requestedBy || ""));
  const commonRequestedBy = requestedBys.size === 1 ? (tasks[0].requestedBy || "") : null;

  // Collect all unique assignee names across all tasks
  const allAssigneeNames = new Set<string>();
  for (const t of tasks) {
    for (const a of (t.assignees || [])) {
      allAssigneeNames.add(a.name);
    }
  }

  // Load sprints and task-sprint mapping
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSprintLoading(true);
      const sprintList = (await api.sprints.list(projectId)) as Sprint[];
      if (cancelled) return;
      setSprints(sprintList);

      const map = new Map<string, Set<string>>();
      for (const sprint of sprintList) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sprintData = (await api.sprints.get(projectId, sprint.id)) as any;
        if (cancelled) return;
        const taskIds = new Set<string>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const st of (sprintData.sprintTasks || [])) {
          taskIds.add(st.taskId);
        }
        map.set(sprint.id, taskIds);
      }
      setTaskSprintMap(map);
      setSprintLoading(false);
    })();
    return () => { cancelled = true; };
  }, [projectId, tasks]);

  // Determine common sprint
  const getTaskSprint = (taskId: string): string => {
    for (const [sprintId, taskIds] of taskSprintMap) {
      if (taskIds.has(taskId)) return sprintId;
    }
    return "";
  };
  const sprintValues = new Set(tasks.map((t) => getTaskSprint(t.id)));
  const commonSprintId = sprintValues.size === 1 ? Array.from(sprintValues)[0] : null;

  const updateAll = useCallback(async (field: string, value: unknown) => {
    for (const t of tasks) {
      await api.tasks.update(t.id, { [field]: value });
    }
    onRefresh();
  }, [tasks, onRefresh]);

  const handleSetSprintForAll = useCallback(async (newSprintId: string) => {
    for (const t of tasks) {
      const currentSprintId = getTaskSprint(t.id);
      if (currentSprintId === newSprintId) continue;
      if (currentSprintId) {
        await api.sprints.removeTask(projectId, currentSprintId, t.id);
      }
      if (newSprintId) {
        await api.sprints.addTasks(projectId, newSprintId, [t.id]);
      }
    }
    onRefresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, projectId, onRefresh, taskSprintMap]);

  const handleAddAssigneeToAll = useCallback(async (name: string) => {
    for (const t of tasks) {
      const already = (t.assignees || []).some((a) => a.name === name);
      if (!already) {
        await api.assignees.addToTask(t.id, name);
      }
    }
    onRefresh();
  }, [tasks, onRefresh]);

  const handleRemoveAssigneeFromAll = useCallback(async (name: string) => {
    for (const t of tasks) {
      const assignee = (t.assignees || []).find((a) => a.name === name);
      if (assignee) {
        await api.assignees.removeFromTask(t.id, assignee.id);
      }
    }
    onRefresh();
  }, [tasks, onRefresh]);

  return (
    <div className="border-l border-gray-200 bg-white flex flex-col overflow-hidden" style={{ width: 420, minWidth: 350 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm">
            {tasks.length}
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{tasks.length} tasks selected</h2>
            <p className="text-xs text-gray-500">Edit common attributes</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded transition-colors text-gray-400 hover:text-gray-600"
          title="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* Completed */}
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1.5 block">Completed</label>
          <div className="flex gap-2">
            <button
              onClick={() => updateAll("completed", true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                allCompleted
                  ? "bg-green-100 text-green-700 border-green-300"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-green-50 hover:text-green-700"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Mark all complete
            </button>
            {!noneCompleted && (
              <button
                onClick={() => updateAll("completed", false)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Mark all incomplete
              </button>
            )}
          </div>
        </div>

        {/* In Progress */}
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1.5 block">Status</label>
          <div className="flex gap-2">
            <button
              onClick={() => updateAll("inProgress", true)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                allInProgress
                  ? "bg-amber-100 text-amber-700 border-amber-300"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-amber-50 hover:text-amber-700"
              }`}
            >
              In Progress
            </button>
            <button
              onClick={() => updateAll("inProgress", false)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                noneInProgress
                  ? "bg-gray-100 text-gray-700 border-gray-300"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
            >
              Not Started
            </button>
          </div>
        </div>

        {/* Priority */}
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1.5 block">
            Priority
            {commonPriority === null && priorities.size > 1 && (
              <span className="ml-2 text-xs text-gray-400 font-normal">(mixed)</span>
            )}
          </label>
          <div className="flex gap-1">
            <button
              onClick={() => updateAll("priority", null)}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                commonPriority === null && priorities.size === 1 ? "bg-gray-200 text-gray-700" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
              }`}
            >
              None
            </button>
            {PRIORITIES.map((p) => (
              <button
                key={p}
                onClick={() => updateAll("priority", p)}
                className={`px-2 py-1 text-xs rounded-md transition-colors ${
                  commonPriority === p ? PRIORITY_COLORS[p] : PRIORITY_COLORS_IDLE[p]
                }`}
              >
                {PRIORITY_LABELS[p]}
              </button>
            ))}
          </div>
        </div>

        {/* Due Date */}
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1.5 block">
            Due date
            {commonDueDate === null && dueDates.size > 1 && (
              <span className="ml-2 text-xs text-gray-400 font-normal">(mixed)</span>
            )}
          </label>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={commonDueDate ?? ""}
              onChange={(e) => updateAll("dueDate", e.target.value || null)}
              className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {commonDueDate !== null && commonDueDate !== "" && (
              <button
                onClick={() => updateAll("dueDate", null)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                title="Clear due date"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Requested By */}
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1.5 block">
            Requested by
            {commonRequestedBy === null && requestedBys.size > 1 && (
              <span className="ml-2 text-xs text-gray-400 font-normal">(mixed)</span>
            )}
          </label>
          <BulkRequesterInput
            value={commonRequestedBy ?? ""}
            mixed={commonRequestedBy === null}
            onChange={(val) => updateAll("requestedBy", val || null)}
          />
        </div>

        {/* Assignees */}
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1.5 block">Assignees</label>
          {allAssigneeNames.size > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {Array.from(allAssigneeNames).map((name) => {
                // Check if all tasks have this assignee
                const allHave = tasks.every((t) => (t.assignees || []).some((a) => a.name === name));
                return (
                  <span
                    key={name}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full ${
                      allHave ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-600 border border-dashed border-gray-300"
                    }`}
                    title={allHave ? `All ${tasks.length} tasks` : "Some tasks only"}
                  >
                    {name}
                    <button
                      onClick={() => handleRemoveAssigneeFromAll(name)}
                      className="ml-0.5 text-gray-400 hover:text-red-500"
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <BulkAssigneeAdd onAdd={handleAddAssigneeToAll} existingNames={allAssigneeNames} />
        </div>

        {/* Sprint */}
        {!sprintLoading && sprints.length > 0 && (
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1.5 block">
              Sprint
              {commonSprintId === null && sprintValues.size > 1 && (
                <span className="ml-2 text-xs text-gray-400 font-normal">(mixed)</span>
              )}
            </label>
            <select
              value={commonSprintId ?? ""}
              onChange={(e) => handleSetSprintForAll(e.target.value)}
              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="">None</option>
              {sprints.map((s) => {
                const now = new Date();
                const start = new Date(s.startDate);
                const end = new Date(s.endDate);
                const isActive = s.status !== "CLOSED" && now >= start && now <= end;
                return (
                  <option key={s.id} value={s.id}>
                    Sprint {s.number}{isActive ? " ● Active" : s.status === "CLOSED" ? " (Closed)" : ""}
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Task list */}
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1.5 block">Selected tasks</label>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-2 py-1 rounded text-sm text-gray-700 bg-gray-50">
                <span className={`w-2 h-2 rounded-full shrink-0 ${t.completed ? "bg-green-500" : t.inProgress ? "bg-amber-400" : "bg-gray-300"}`} />
                <span className={`truncate ${t.completed ? "line-through text-gray-400" : ""}`}>{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Simplified requester input for bulk editing */
function BulkRequesterInput({ value, mixed, onChange }: { value: string; mixed: boolean; onChange: (val: string) => void }) {
  const [inputVal, setInputVal] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [allRequesters, setAllRequesters] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => { if (!mixed) setInputVal(value); }, [value, mixed]);

  useEffect(() => {
    api.requesters().then(setAllRequesters).catch(() => {});
  }, []);

  return (
    <div className="relative">
      <input
        type="text"
        value={mixed ? "" : inputVal}
        placeholder={mixed ? "Mixed values..." : "Enter name..."}
        onChange={(e) => {
          setInputVal(e.target.value);
          const filtered = e.target.value.trim()
            ? allRequesters.filter((r) => r.toLowerCase().includes(e.target.value.toLowerCase()))
            : allRequesters;
          setSuggestions(filtered);
          setShowDropdown(true);
        }}
        onFocus={() => {
          const filtered = inputVal.trim()
            ? allRequesters.filter((r) => r.toLowerCase().includes(inputVal.toLowerCase()))
            : allRequesters;
          setSuggestions(filtered);
          setShowDropdown(true);
        }}
        onBlur={() => {
          setTimeout(() => {
            setShowDropdown(false);
            if (inputVal !== value) onChange(inputVal);
          }, 150);
        }}
        className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
          {suggestions.map((name) => (
            <div
              key={name}
              className="px-3 py-1.5 text-sm cursor-pointer text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
              onMouseDown={(e) => {
                e.preventDefault();
                setInputVal(name);
                setShowDropdown(false);
                onChange(name);
              }}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Simple input to add an assignee to all selected tasks */
function BulkAssigneeAdd({ onAdd, existingNames }: { onAdd: (name: string) => void; existingNames: Set<string> }) {
  const [inputVal, setInputVal] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [allAssignees, setAllAssignees] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    api.assignees.list().then(setAllAssignees).catch(() => {});
  }, []);

  const filtered = inputVal.trim()
    ? allAssignees.filter((a) => a.toLowerCase().includes(inputVal.toLowerCase()) && !existingNames.has(a))
    : allAssignees.filter((a) => !existingNames.has(a));

  const handleAdd = (name: string) => {
    onAdd(name);
    setInputVal("");
    setShowDropdown(false);
  };

  return (
    <div className="relative">
      <input
        type="text"
        value={inputVal}
        placeholder="Add assignee..."
        onChange={(e) => {
          setInputVal(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && inputVal.trim()) {
            e.preventDefault();
            handleAdd(inputVal.trim());
          }
        }}
        className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
          {filtered.map((name) => (
            <div
              key={name}
              className="px-3 py-1.5 text-sm cursor-pointer text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
              onMouseDown={(e) => {
                e.preventDefault();
                handleAdd(name);
              }}
            >
              {name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
