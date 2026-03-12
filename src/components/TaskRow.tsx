"use client";

import { useState, useRef, useEffect } from "react";
import type { TaskWithRelations } from "@/lib/types";
import { LinkifiedText, LinkPopup } from "./LinkifiedText";

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "text-red-500",
  MEDIUM: "text-amber-500",
  LOW: "text-blue-400",
};

const PRIORITY_LABELS: Record<string, string> = {
  HIGH: "High",
  MEDIUM: "Med",
  LOW: "Low",
};

interface TaskRowProps {
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
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  isSubtask?: boolean;
  depth?: number;
  isSubtaskDropTarget?: boolean;
}

export function TaskRow({ task, isSelected, isMultiSelected, onSelect, onToggleComplete, onDelete, onUpdate, onContextMenu, showPriorityColumn, showDueDateColumn, showRequestedByColumn, isExpanded, onToggleExpand, isSubtask, depth, isSubtaskDropTarget }: TaskRowProps) {
  const effectiveDepth = depth ?? (isSubtask ? 1 : 0);
  const isOverdue = task.dueDate && !task.completed && new Date(task.dueDate.toString().split("T")[0] + "T00:00:00") < new Date();
  const subtasks = task.subtasks ?? [];
  const completedSubtasks = subtasks.filter((s) => s.completed).length;
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [linkPopup, setLinkPopup] = useState<{ url: string; rect: DOMRect } | null>(null);
  const [hyperlinkPrompt, setHyperlinkPrompt] = useState<{ selStart: number; selEnd: number; text: string; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hyperlinkInputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const prevEditingRef = useRef(editing);
  useEffect(() => {
    if (editing && !hyperlinkPrompt) {
      inputRef.current?.focus();
    } else if (!editing && prevEditingRef.current) {
      // Only re-focus the row when *leaving* edit mode, not on every render
      rowRef.current?.focus();
    }
    prevEditingRef.current = editing;
  }, [editing, hyperlinkPrompt]);

  // Reset edit title if task changes externally
  useEffect(() => {
    setEditTitle(task.title);
  }, [task.title]);

  const commitEdit = () => {
    const trimmed = editTitle.trim();
    setEditing(false);
    setHyperlinkPrompt(null);
    if (trimmed && trimmed !== task.title) {
      onUpdate({ title: trimmed });
    } else {
      setEditTitle(task.title);
    }
  };

  const applyHyperlink = () => {
    if (!hyperlinkPrompt) return;
    const { selStart, selEnd, text, url } = hyperlinkPrompt;
    if (url.trim()) {
      const before = editTitle.substring(0, selStart);
      const after = editTitle.substring(selEnd);
      setEditTitle(`${before}[${text}](${url.trim()})${after}`);
    }
    setHyperlinkPrompt(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (editing) return;
    // Ignore Ctrl+clicks on <a> elements (links) — let native browser handle navigation
    if ((e.target as HTMLElement).closest('a') && (e.ctrlKey || e.metaKey)) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      onSelect(e);
    } else if (isSelected) {
      // Don't enter edit mode when clicking a hyperlink — the popup will show instead
      if (!(e.target as HTMLElement).closest('a')) {
        setEditing(true);
      }
    } else {
      onSelect(e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.key === "F2" || e.key === " ") && isSelected && !editing) {
      e.preventDefault();
      setEditing(true);
    }
    if (e.key === "Delete" && isSelected && !editing) {
      e.preventDefault();
      onDelete();
    }
  };

  return (
    <div
      ref={rowRef}
      tabIndex={isSelected ? 0 : -1}
      onKeyDown={handleKeyDown}
      className={`
        group flex items-center gap-2 py-2 px-2 cursor-pointer transition-colors outline-none border-b border-gray-200
        ${isSubtaskDropTarget ? "ring-2 ring-indigo-400 bg-indigo-100" : isMultiSelected ? "bg-indigo-100 ring-1 ring-indigo-300" : isSelected ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-gray-50"}
        ${task.completed ? "opacity-60" : ""}
      `}
      style={{ paddingLeft: `${effectiveDepth * 24 + 8}px` }}
      onClick={handleClick}
      onContextMenu={(e) => {
        // Allow native context menu on links (for "Open in new tab", etc.)
        if ((e.target as HTMLElement).closest('a')) return;
        e.preventDefault();
        e.stopPropagation();
        onSelect(e);
        onContextMenu?.(e);
      }}
    >
      {/* Expand/collapse arrow for tasks with subtasks */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpand?.();
        }}
        className={`w-5 h-5 flex items-center justify-center shrink-0 rounded transition-colors ${
          subtasks.length > 0 ? "hover:bg-gray-200 text-gray-400" : ""
        }`}
      >
        {subtasks.length > 0 && (
          <svg
            className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleComplete();
        }}
        className={`
          w-[18px] h-[18px] rounded-full border-2 shrink-0 flex items-center justify-center transition-colors
          ${task.completed
            ? "bg-green-500 border-green-500 text-white"
            : "border-gray-300 hover:border-green-400"
          }
        `}
      >
        {task.completed && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Title */}
      {editing ? (
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "k") {
                e.preventDefault();
                e.nativeEvent.stopImmediatePropagation();
                const input = inputRef.current;
                if (input && input.selectionStart !== null && input.selectionEnd !== null && input.selectionStart !== input.selectionEnd) {
                  const selStart = input.selectionStart;
                  const selEnd = input.selectionEnd;
                  const text = editTitle.substring(selStart, selEnd);
                  setHyperlinkPrompt({ selStart, selEnd, text, url: "" });
                }
                return;
              }
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") {
                setEditTitle(task.title);
                setEditing(false);
              }
            }}
            onBlur={() => {
              if (!hyperlinkPrompt) commitEdit();
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-sm px-1 py-0.5 bg-white border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {hyperlinkPrompt && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-72" onClick={(e) => e.stopPropagation()}>
              <p className="text-xs text-gray-500 mb-1.5">Link for &ldquo;{hyperlinkPrompt.text}&rdquo;</p>
              <input
                ref={hyperlinkInputRef}
                autoFocus
                type="url"
                value={hyperlinkPrompt.url}
                onChange={(e) => setHyperlinkPrompt({ ...hyperlinkPrompt, url: e.target.value })}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") applyHyperlink();
                  if (e.key === "Escape") {
                    setHyperlinkPrompt(null);
                    setTimeout(() => inputRef.current?.focus(), 0);
                  }
                }}
                onBlur={() => {
                  setHyperlinkPrompt(null);
                }}
                placeholder="https://..."
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          )}
        </div>
      ) : (
        <span className={`flex-1 text-sm break-words flex items-center ${task.completed ? "line-through text-gray-400" : ""}`}>
          {task.hyperlink ? (
            <a
              href={task.hyperlink}
              target="_blank"
              rel="noopener noreferrer"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) return;
                e.preventDefault();
                const rect = (e.target as HTMLElement).getBoundingClientRect();
                setLinkPopup({ url: task.hyperlink!, rect });
              }}
              className={`underline decoration-indigo-300 hover:decoration-indigo-600 cursor-pointer ${task.completed ? "text-gray-400" : "text-indigo-600"}`}
            >
              {task.title}
            </a>
          ) : (
            <LinkifiedText
              text={task.title}
              className={task.completed ? "text-gray-400" : "text-gray-800"}
              interactive={isSelected}
            />
          )}
          {task.inProgress && !task.completed && (
            <span className="ml-1.5 text-[10px] font-medium text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
              In Progress
            </span>
          )}
          {subtasks.length > 0 && (
            <span className="ml-1.5 text-xs text-gray-400 font-normal">
              {completedSubtasks}/{subtasks.length}
            </span>
          )}
          {linkPopup && <LinkPopup url={linkPopup.url} anchorRect={linkPopup.rect} onClose={() => setLinkPopup(null)} />}
        </span>
      )}

      {/* Metadata */}
      <div className="flex items-stretch gap-2 shrink-0">
        {/* Tags */}
        {(task.tags ?? []).slice(0, 2).map((tt) => (
          <span
            key={tt.tagId}
            className="text-xs px-1.5 py-0.5 rounded-full self-center"
            style={{ backgroundColor: tt.tag.color + "20", color: tt.tag.color }}
          >
            {tt.tag.name}
          </span>
        ))}

        {/* Priority column */}
        {showPriorityColumn && (
          <span className={`w-16 text-left text-xs font-bold whitespace-nowrap border-l border-gray-200 pl-2 -my-2 py-2 flex items-center ${PRIORITY_COLORS[task.priority] || "text-transparent"}`}>
            {PRIORITY_LABELS[task.priority] || ""}
          </span>
        )}

        {/* Due date column */}
        {showDueDateColumn && (
          <span className={`w-20 text-left text-xs border-l border-gray-200 pl-2 -my-2 py-2 flex items-center ${task.dueDate ? (isOverdue ? "text-red-500 font-medium" : "text-gray-400") : "text-transparent"}`}>
            {task.dueDate
              ? new Date(task.dueDate.toString().split("T")[0] + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : "—"}
          </span>
        )}

        {/* Requested by column */}
        {showRequestedByColumn && (
          <span className={`w-20 text-left text-xs truncate border-l border-gray-200 pl-2 -my-2 py-2 flex items-center ${task.requestedBy ? "text-gray-400" : "text-transparent"}`}>
            {task.requestedBy || "—"}
          </span>
        )}

        {/* Comment count */}
        {task._count?.comments > 0 && (
          <span className="text-xs text-gray-400 flex items-center gap-0.5 self-center">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            {task._count.comments}
          </span>
        )}

        {/* Delete */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 rounded text-gray-400 transition-opacity self-center"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
