"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { BoardColumn, Sprint } from "@/lib/types";

interface SprintSettingsModalProps {
  projectId: string;
  currentDuration: number;
  currentStartDay: number;
  columns: BoardColumn[];
  currentSprint: Sprint | null;
  trelloConfigured: boolean;
  onClose: () => void;
  onSave: () => void;
  onColumnsChange: () => void;
  onSprintChange: () => void;
}

const DAY_NAMES = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" },
];

export default function SprintSettingsModal({
  projectId,
  currentDuration,
  currentStartDay,
  columns: initialColumns,
  currentSprint,
  trelloConfigured,
  onClose,
  onSave,
  onColumnsChange,
  onSprintChange,
}: SprintSettingsModalProps) {
  const [duration, setDuration] = useState(currentDuration);
  const [startDay, setStartDay] = useState(currentStartDay);
  const [saving, setSaving] = useState(false);
  const [columns, setColumns] = useState<BoardColumn[]>(initialColumns);
  const [newColumnName, setNewColumnName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [reordering, setReordering] = useState(false);
  const [trelloSyncing, setTrelloSyncing] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSave = async () => {
    setSaving(true);
    await api.projects.update(projectId, {
      sprintDuration: duration,
      sprintStartDay: startDay,
    });
    setSaving(false);
    onSave();
    onColumnsChange();
    onClose();
  };

  // Column management
  const addColumn = async () => {
    const name = newColumnName.trim();
    if (!name) return;
    const col = (await api.boardColumns.create(projectId, { name })) as BoardColumn;
    setColumns((prev) => [...prev, col]);
    setNewColumnName("");
  };

  const deleteColumn = async (columnId: string) => {
    await api.boardColumns.delete(projectId, columnId);
    setColumns((prev) => prev.filter((c) => c.id !== columnId));
  };

  const startRename = (col: BoardColumn) => {
    setEditingId(col.id);
    setEditName(col.name);
  };

  const saveRename = async (columnId: string) => {
    const name = editName.trim();
    if (!name) return;
    await api.boardColumns.update(projectId, columnId, { name });
    setColumns((prev) =>
      prev.map((c) => (c.id === columnId ? { ...c, name } : c))
    );
    setEditingId(null);
  };

  const moveColumn = async (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= columns.length) return;
    setReordering(true);

    const newCols = [...columns];
    const temp = newCols[index];
    newCols[index] = newCols[newIndex];
    newCols[newIndex] = temp;

    const reordered = newCols.map((c, i) => ({ ...c, order: i }));
    setColumns(reordered);

    await api.reorder(
      reordered.map((c) => ({ id: c.id, order: c.order })),
      "boardColumn"
    );
    setReordering(false);
  };

  const handleToggleTrello = async () => {
    if (!currentSprint) return;
    setTrelloSyncing(true);
    try {
      if (currentSprint.trelloBoardId) {
        if (!confirm("Stop syncing this sprint to Trello? The Trello board will be deleted.")) {
          setTrelloSyncing(false);
          return;
        }
        await api.trello.disableSync(currentSprint.id);
      } else {
        await api.trello.enableSync(currentSprint.id);
      }
      onSprintChange();
    } catch (err) {
      console.error("Trello sync toggle failed:", err);
      alert("Failed to toggle Trello sync. Check console for details.");
    } finally {
      setTrelloSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Board Settings</h2>

        <div className="space-y-5">
          {/* Sprint settings */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">Sprint</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Duration (days)</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={duration}
                  onChange={(e) => setDuration(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Start Day</label>
                <select
                  value={startDay}
                  onChange={(e) => setStartDay(parseInt(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-indigo-500"
                >
                  {DAY_NAMES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700" />

          {/* Column configuration */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">Board Columns</h3>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {columns.map((col, i) => (
                <div
                  key={col.id}
                  className="flex items-center gap-2 bg-gray-800 rounded px-3 py-2"
                >
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => moveColumn(i, -1)}
                      disabled={i === 0 || reordering}
                      className="text-gray-500 hover:text-white disabled:opacity-30 text-xs leading-none"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => moveColumn(i, 1)}
                      disabled={i === columns.length - 1 || reordering}
                      className="text-gray-500 hover:text-white disabled:opacity-30 text-xs leading-none"
                    >
                      ▼
                    </button>
                  </div>

                  {editingId === col.id ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => saveRename(col.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(col.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="flex-1 bg-gray-700 text-white text-sm px-2 py-1 rounded border border-gray-600 focus:outline-none focus:border-indigo-500"
                    />
                  ) : (
                    <span
                      className="flex-1 text-sm text-gray-200 cursor-pointer"
                      onDoubleClick={() => startRename(col)}
                    >
                      {col.name}
                    </span>
                  )}

                  <button
                    onClick={() => deleteColumn(col.id)}
                    className="text-gray-500 hover:text-red-400 text-sm"
                    title="Delete column"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addColumn();
                }}
                placeholder="New column name..."
                className="flex-1 px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={addColumn}
                disabled={!newColumnName.trim()}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>

          {/* Trello integration */}
          {trelloConfigured && currentSprint && (
            <>
              <div className="border-t border-gray-700" />
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-300 uppercase tracking-wider">Trello Sync</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-300">
                      Sprint {currentSprint.number}
                    </p>
                    <p className="text-xs text-gray-500">
                      {currentSprint.trelloBoardId
                        ? "This sprint is synced to a Trello board"
                        : "Sync this sprint\u2019s board to Trello"}
                    </p>
                  </div>
                  <button
                    onClick={handleToggleTrello}
                    disabled={trelloSyncing}
                    className={`px-3 py-1.5 text-sm rounded transition-colors ${
                      currentSprint.trelloBoardId
                        ? "bg-red-600/20 text-red-400 hover:bg-red-600/30"
                        : "bg-indigo-600 text-white hover:bg-indigo-500"
                    } ${trelloSyncing ? "opacity-50 cursor-wait" : ""}`}
                  >
                    {trelloSyncing
                      ? "Syncing..."
                      : currentSprint.trelloBoardId
                        ? "Disconnect"
                        : "Enable Sync"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
