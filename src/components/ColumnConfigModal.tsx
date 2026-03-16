"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { BoardColumn } from "@/lib/types";

interface ColumnConfigModalProps {
  projectId: string;
  columns: BoardColumn[];
  onClose: () => void;
  onSave: () => void;
}

export default function ColumnConfigModal({
  projectId,
  columns: initialColumns,
  onClose,
  onSave,
}: ColumnConfigModalProps) {
  const [columns, setColumns] = useState<BoardColumn[]>(initialColumns);
  const [newColumnName, setNewColumnName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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
    setSaving(true);

    const newCols = [...columns];
    const temp = newCols[index];
    newCols[index] = newCols[newIndex];
    newCols[newIndex] = temp;

    // Update orders
    const reordered = newCols.map((c, i) => ({ ...c, order: i }));
    setColumns(reordered);

    await api.reorder(
      reordered.map((c) => ({ id: c.id, order: c.order })),
      "boardColumn"
    );
    setSaving(false);
  };

  const handleDone = () => {
    onSave();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Configure Board Columns</h2>

        {/* Column list */}
        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {columns.map((col, i) => (
            <div
              key={col.id}
              className="flex items-center gap-2 bg-gray-800 rounded px-3 py-2"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => moveColumn(i, -1)}
                  disabled={i === 0 || saving}
                  className="text-gray-500 hover:text-white disabled:opacity-30 text-xs leading-none"
                >
                  ▲
                </button>
                <button
                  onClick={() => moveColumn(i, 1)}
                  disabled={i === columns.length - 1 || saving}
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

        {/* Add new column */}
        <div className="flex gap-2 mb-6">
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

        {/* Footer */}
        <div className="flex justify-end">
          <button
            onClick={handleDone}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-500"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
