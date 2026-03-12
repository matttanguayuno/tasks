"use client";

import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from "react";
import { LinkifiedText, LinkPopup } from "./LinkifiedText";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { api } from "@/lib/api";
import type { TaskWithRelations } from "@/lib/types";
import type { UndoAction } from "@/hooks/useUndoRedo";

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
const PRIORITY_LABELS: Record<string, string> = { LOW: "Low", MEDIUM: "Med", HIGH: "High" };
const PRIORITY_COLORS: Record<string, string> = { LOW: "bg-blue-200 text-blue-800", MEDIUM: "bg-amber-200 text-amber-800", HIGH: "bg-red-200 text-red-800" };
const PRIORITY_COLORS_IDLE: Record<string, string> = { LOW: "bg-blue-50 text-blue-600 hover:bg-blue-100", MEDIUM: "bg-amber-50 text-amber-600 hover:bg-amber-100", HIGH: "bg-red-50 text-red-600 hover:bg-red-100" };

interface TaskDetailProps {
  task: TaskWithRelations;
  onClose: () => void;
  onRefresh: () => void;
  onDelete?: () => void;
  onSelectTask?: (taskId: string) => void;
  pushAction?: (action: UndoAction) => void;
}

function RequesterInput({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [inputVal, setInputVal] = useState(value);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [allRequesters, setAllRequesters] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputVal(value); }, [value]);

  useEffect(() => {
    api.requesters().then(setAllRequesters).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (val: string) => {
    setInputVal(val);
    const filtered = val.trim()
      ? allRequesters.filter((r) => r.toLowerCase().includes(val.toLowerCase()))
      : allRequesters;
    setSuggestions(filtered);
    setHighlightIndex(-1);
    setShowDropdown(true);
  };

  const handleSelect = (name: string) => {
    setInputVal(name);
    setShowDropdown(false);
    setHighlightIndex(-1);
    onChange(name);
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (inputVal !== value) onChange(inputVal);
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) {
      if (e.key === "Enter") { e.currentTarget.blur(); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
        handleSelect(suggestions[highlightIndex]);
      } else {
        (e.currentTarget as HTMLElement).blur();
        setShowDropdown(false);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setHighlightIndex(-1);
    }
  };

  const handleDeleteRequester = async (name: string) => {
    await fetch("/api/requesters/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const updated = allRequesters.filter((r) => r !== name);
    setAllRequesters(updated);
    setSuggestions((prev) => prev.filter((r) => r !== name));
    setHighlightIndex(-1);
    if (inputVal === name) {
      setInputVal("");
      onChange("");
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <input
        type="text"
        value={inputVal}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => {
          api.requesters().then((names) => {
            setAllRequesters(names);
            const filtered = inputVal.trim() ? names.filter((r) => r.toLowerCase().includes(inputVal.toLowerCase())) : names;
            setSuggestions(filtered);
            setShowDropdown(true);
          }).catch(() => {});
        }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Enter name..."
        className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {showDropdown && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
          {suggestions.map((name, i) => (
            <div
              key={name}
              className={`flex items-center justify-between px-3 py-1.5 text-sm cursor-pointer ${
                i === highlightIndex ? "bg-indigo-50 text-indigo-700" : "text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
              }`}
              onMouseDown={(e) => { e.preventDefault(); handleSelect(name); }}
            >
              <span>{name}</span>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDeleteRequester(name);
                }}
                className="ml-2 text-gray-300 hover:text-red-500 text-xs"
                title="Remove from suggestions"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TaskDetail({ task, onClose, onRefresh, onDelete, onSelectTask, pushAction }: TaskDetailProps) {
  const [title, setTitle] = useState(task.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [description, setDescription] = useState(task.description);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [selectedSubtaskId, setSelectedSubtaskId] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const commentEditorRef = useRef<{ clear: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmDeleteSelf, setConfirmDeleteSelf] = useState(false);
  const [hyperlinkDialog, setHyperlinkDialog] = useState<{ url: string } | null>(null);
  const [linkPopup, setLinkPopup] = useState<{ url: string; rect: DOMRect } | null>(null);
  const dragCounter = useRef(0);
  // Keep a ref to onRefresh so async updateField always calls the latest version
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Synchronously reset local state when the task changes, BEFORE children
  // render. This avoids a stale `description` being passed to the editor on
  // the first render after a task switch (useEffect would run too late).
  const [prevTaskId, setPrevTaskId] = useState(task.id);
  if (task.id !== prevTaskId) {
    setPrevTaskId(task.id);
    setTitle(task.title);
    setDescription(task.description);
    setNewSubtaskTitle("");
    setNewComment("");
  }


  const [panelWidth, setPanelWidth] = useState(0);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Restore saved width from localStorage after mount
  useEffect(() => {
    const saved = localStorage.getItem("detailPanelWidth");
    if (saved) setPanelWidth(parseInt(saved, 10));
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    startX.current = e.clientX;
    startWidth.current = panelRef.current?.offsetWidth ?? 450;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!resizing.current) return;
      const delta = startX.current - ev.clientX;
      const maxWidth = Math.floor(window.innerWidth * 0.8);
      const newWidth = Math.max(350, Math.min(maxWidth, startWidth.current + delta));
      setPanelWidth(newWidth);
    };
    const onUp = () => {
      resizing.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      const width = panelRef.current?.offsetWidth;
      if (width) localStorage.setItem("detailPanelWidth", String(width));
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  // Sync title/description when the same task refreshes with new data from the server
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
  }, [task.title, task.description]);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      await api.attachments.upload(task.id, file);
    }
    onRefresh();
  }, [task.id, onRefresh]);

  const uploadImageAndGetUrl = useCallback(async (file: File): Promise<string | null> => {
    const result = await api.attachments.upload(task.id, file) as { url?: string };
    return result?.url ?? null;
  }, [task.id]);

  // Ctrl+K to set hyperlink on the task (works even while editing)
  const hyperlinkDialogRef = useRef(hyperlinkDialog);
  hyperlinkDialogRef.current = hyperlinkDialog;
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!hyperlinkDialogRef.current) {
          setLinkPopup(null);
          setHyperlinkDialog({ url: task.hyperlink || "" });
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [task.hyperlink]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length > 0) {
      await uploadFiles(e.dataTransfer.files);
    }
  };

  const updateField = async (field: string, value: unknown) => {
    const taskId = task.id;
    const oldValue = (task as unknown as Record<string, unknown>)[field];
    await api.tasks.update(taskId, { [field]: value });
    pushAction?.({
      undo: async () => { await api.tasks.update(taskId, { [field]: oldValue }); },
      redo: async () => { await api.tasks.update(taskId, { [field]: value }); },
    });
    onRefreshRef.current();
  };

  const handleTitleBlur = () => {
    if (title.trim() && title !== task.title) {
      updateField("title", title.trim());
    }
  };



  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;
    await api.tasks.create({ title: newSubtaskTitle.trim(), sectionId: task.sectionId, parentId: task.id });
    setNewSubtaskTitle("");
    onRefresh();
  };

  const handleToggleSubtask = async (subtaskId: string, completed: boolean) => {
    await api.tasks.update(subtaskId, { completed: !completed });
    onRefresh();
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    await api.tasks.delete(subtaskId);
    onRefresh();
  };



  const handleAddComment = async (content?: string) => {
    const text = content ?? newComment;
    if (!text.trim()) return;
    await api.comments.create(task.id, { content: text.trim() });
    setNewComment("");
    commentEditorRef.current?.clear();
    onRefresh();
  };

  const handleDeleteComment = async (commentId: string) => {
    await api.comments.delete(task.id, commentId);
    onRefresh();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await api.attachments.upload(task.id, file);
    onRefresh();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    await api.attachments.delete(task.id, attachmentId);
    setConfirmDelete(null);
    onRefresh();
  };

  return (
    <div
      ref={panelRef}
      className={`w-full border-l border-gray-200 bg-white flex flex-col overflow-hidden shrink-0 relative ${panelWidth === 0 ? "md:w-[450px] lg:w-[550px] xl:w-[650px]" : ""}`}
      style={panelWidth > 0 ? { width: panelWidth } : undefined}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute left-0 top-0 bottom-0 w-2 -ml-1 cursor-col-resize hover:bg-indigo-400 active:bg-indigo-500 z-30 transition-colors"
      />
      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={() => setConfirmDelete(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleDeleteAttachment(confirmDelete);
            else if (e.key === "Escape") setConfirmDelete(null);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 w-80 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Delete attachment</h3>
            <p className="text-sm text-gray-500 mb-4">This can&apos;t be undone. Are you sure?</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={() => handleDeleteAttachment(confirmDelete)}
                className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete task confirmation modal */}
      {confirmDeleteSelf && onDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={() => setConfirmDeleteSelf(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { setConfirmDeleteSelf(false); onDelete(); }
            else if (e.key === "Escape") setConfirmDeleteSelf(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 w-80 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Delete task</h3>
            <p className="text-sm text-gray-500 mb-4">
              This task has{" "}
              {[
                task.subtasks.length > 0 && `${task.subtasks.length} subtask${task.subtasks.length > 1 ? "s" : ""}`,
                ((task._count?.attachments ?? 0) > 0 || (task.attachments && task.attachments.length > 0)) && `${task.attachments?.length ?? task._count?.attachments} attachment${(task.attachments?.length ?? task._count?.attachments ?? 0) > 1 ? "s" : ""}`,
              ].filter(Boolean).join(" and ")}
              . This can&apos;t be undone. Are you sure?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDeleteSelf(false)}
                className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                autoFocus
                onClick={() => { setConfirmDeleteSelf(false); onDelete(); }}
                className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Drop overlay */}
      {dragging && (
        <div className="absolute inset-0 z-50 bg-indigo-50/80 border-2 border-dashed border-indigo-400 rounded-lg flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <svg className="w-10 h-10 text-indigo-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm font-medium text-indigo-600">Drop files to attach</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        {task.parentId && onSelectTask ? (
          <button
            onClick={() => onSelectTask(task.parentId!)}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Parent task
          </button>
        ) : (
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded md:hidden"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        <div className="flex-1" />
        {onDelete && (
          <button
            onClick={() => {
              const hasSubtasks = task.subtasks && task.subtasks.length > 0;
              const hasAttachments = (task._count?.attachments ?? 0) > 0 || (task.attachments && task.attachments.length > 0);
              if (hasSubtasks || hasAttachments) {
                setConfirmDeleteSelf(true);
              } else {
                onDelete();
              }
            }}
            className="p-1 hover:bg-red-50 hover:text-red-600 rounded text-gray-400 transition-colors"
            title="Delete task"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded hidden md:block"
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-6">
        {/* Title */}
        {editingTitle ? (
          <div className="flex items-start gap-3">
            <button
              onClick={async () => {
                await api.tasks.update(task.id, { completed: !task.completed });
                onRefresh();
              }}
              className={`
                w-[22px] h-[22px] rounded-full border-2 shrink-0 flex items-center justify-center transition-colors mt-1
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
            <textarea
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = e.target.scrollHeight + "px";
            }}
            onBlur={() => { handleTitleBlur(); setEditingTitle(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") { setTitle(task.title); setEditingTitle(false); } }}
            rows={1}
            ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; el.focus(); } }}
            className={`w-full text-lg font-semibold border-none outline-none bg-transparent resize-none overflow-hidden ${task.completed ? "line-through text-gray-400" : "text-gray-900"}`}
          />
          </div>
        ) : (
          <div
            onClick={(e) => { if (!(e.target as HTMLElement).closest('a') && !(e.target as HTMLElement).closest('button')) setEditingTitle(true); }}
            onContextMenu={(e) => {
              if ((e.target as HTMLElement).closest('a')) return;
              e.preventDefault();
              setHyperlinkDialog({ url: task.hyperlink || "" });
            }}
            className="cursor-text group/title flex items-start gap-2"
          >
            <button
              onClick={async (e) => {
                e.stopPropagation();
                await api.tasks.update(task.id, { completed: !task.completed });
                onRefresh();
              }}
              className={`
                w-[22px] h-[22px] rounded-full border-2 shrink-0 flex items-center justify-center transition-colors mt-0.5
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
            <div className="flex-1 min-w-0">
              {task.hyperlink ? (
                <>
                <a
                  href={task.hyperlink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.ctrlKey || e.metaKey) return;
                    e.preventDefault();
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    setLinkPopup({ url: task.hyperlink!, rect });
                  }}
                  className="text-lg font-semibold text-indigo-600 underline decoration-indigo-300 hover:decoration-indigo-600 cursor-pointer break-words"
                >
                  {title}
                </a>
                {linkPopup && <LinkPopup url={linkPopup.url} anchorRect={linkPopup.rect} onClose={() => setLinkPopup(null)} />}
                </>
              ) : (
                <LinkifiedText text={title} className="text-lg font-semibold text-gray-900 break-words" />
              )}
            </div>
          </div>
        )}

        {/* Status row */}
        <div className="grid grid-cols-4 gap-4 text-sm">
          {/* Priority */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Priority</label>
            <div className="flex gap-1">
              <button
                onClick={() => updateField("priority", null)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  task.priority === null ? "bg-gray-200 text-gray-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                None
              </button>
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  onClick={() => updateField("priority", task.priority === p ? null : p)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    task.priority === p ? PRIORITY_COLORS[p] : PRIORITY_COLORS_IDLE[p]
                  }`}
                >
                  {PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Status</label>
            <button
              onClick={() => updateField("inProgress", !task.inProgress)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                task.inProgress
                  ? "bg-amber-100 text-amber-700"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              In Progress
            </button>
          </div>

          {/* Due date */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Due date</label>
            <input
              type="date"
              value={task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : ""}
              onChange={(e) => updateField("dueDate", e.target.value || null)}
              className="w-full px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Requested by */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Requested by</label>
            <RequesterInput
              value={task.requestedBy || ""}
              onChange={(val) => updateField("requestedBy", val || null)}
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Description</label>
          <RichDescriptionEditor
            value={description}
            taskId={task.id}
            onSave={(val) => {
              setDescription(val);
              if (val !== task.description) updateField("description", val);
            }}
            uploadImage={async (file) => {
              dragCounter.current = 0;
              setDragging(false);
              return await uploadImageAndGetUrl(file);
            }}
          />
        </div>

        {/* Subtasks */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block">
            Subtasks {task.subtasks && task.subtasks.length > 0 && (
              <span className="text-gray-400">
                ({task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length})
              </span>
            )}
          </label>

          {task.subtasks && task.subtasks.length > 0 && (
            <div className="mb-2 bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-green-500 h-1.5 rounded-full transition-all"
                style={{
                  width: `${(task.subtasks.filter((s) => s.completed).length / task.subtasks.length) * 100}%`,
                }}
              />
            </div>
          )}

          <SortableContext items={task.subtasks?.map((s) => s.id) || []} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {task.subtasks?.map((subtask) => (
                  <SortableSubtaskRow
                    key={subtask.id}
                    subtask={subtask}
                    isSelected={selectedSubtaskId === subtask.id}
                    onSelect={() => setSelectedSubtaskId(subtask.id)}
                    onToggle={() => handleToggleSubtask(subtask.id, subtask.completed)}
                    onDelete={() => handleDeleteSubtask(subtask.id)}
                    onUpdate={async (data) => { await api.tasks.update(subtask.id, data); onRefresh(); }}
                    onNavigate={() => onSelectTask?.(subtask.id)}
                  />
                ))}
              </div>
            </SortableContext>

          <div className="flex gap-2 mt-2">
            <input
              type="text"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddSubtask()}
              onBlur={() => { if (newSubtaskTitle.trim()) handleAddSubtask(); }}
              placeholder="Add subtask..."
              data-unsaved-check
              className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleAddSubtask}
              className="px-2 py-1 text-sm text-indigo-600 hover:bg-indigo-50 rounded"
            >
              Add
            </button>
          </div>
        </div>

        {/* Attachments */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block">Attachments</label>
          {task.attachments && task.attachments.length > 0 && (
            <div className="space-y-1 mb-2">
              {task.attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded text-sm group">
                  <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <a href={att.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate text-indigo-600 hover:underline">
                    {att.filename}
                  </a>
                  <span className="text-xs text-gray-400">{formatFileSize(att.size)}</span>
                  <button
                    onClick={() => setConfirmDelete(att.id)}
                    className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-500 text-gray-400"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-indigo-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Attach file
          </button>
        </div>

        {/* Comments */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block">
            Comments {task.comments && task.comments.length > 0 && `(${task.comments.length})`}
          </label>
          <div className="space-y-3 mb-3">
            {task.comments?.map((comment) => (
              <div key={comment.id} className="bg-gray-50 rounded-lg px-3 py-2 group">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">
                    {new Date(comment.createdAt).toLocaleDateString("en-US", {
                      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                    })}
                  </span>
                  <button
                    onClick={() => handleDeleteComment(comment.id)}
                    className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-500 text-gray-400"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="text-sm text-gray-700"><RichText text={comment.content} /></div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <RichCommentInput
              ref={commentEditorRef}
              onChange={setNewComment}
              onSubmit={(content) => handleAddComment(content)}
              uploadImage={async (file) => {
                dragCounter.current = 0;
                setDragging(false);
                return await uploadImageAndGetUrl(file);
              }}
              taskId={task.id}
            />
            <button
              onClick={() => handleAddComment()}
              className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 self-end"
            >
              Post
            </button>
          </div>
        </div>
      </div>
      {/* Hyperlink dialog */}
      {hyperlinkDialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
          onClick={() => setHyperlinkDialog(null)}
        >
          <div className="bg-white rounded-xl shadow-xl px-6 py-5 w-96 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Set hyperlink</h3>
            <input
              autoFocus
              type="url"
              value={hyperlinkDialog.url}
              onChange={(e) => setHyperlinkDialog({ url: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const url = hyperlinkDialog.url.trim() || null;
                  updateField("hyperlink", url);
                  setHyperlinkDialog(null);
                }
                if (e.key === "Escape") setHyperlinkDialog(null);
              }}
              placeholder="https://..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <div className="flex justify-end gap-2 mt-4">
              {hyperlinkDialog.url && (
                <button
                  onClick={() => {
                    updateField("hyperlink", null);
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
                  updateField("hyperlink", url);
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
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function SortableSubtaskRow({
  subtask,
  isSelected,
  onSelect,
  onToggle,
  onDelete,
  onUpdate,
  onNavigate,
}: {
  subtask: TaskWithRelations;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (data: { title: string }) => void;
  onNavigate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: subtask.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(subtask.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setEditTitle(subtask.title); }, [subtask.title]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { if (isSelected && !editing) rowRef.current?.focus(); }, [isSelected, editing]);

  const commitEdit = () => {
    const trimmed = editTitle.trim();
    setEditing(false);
    if (trimmed && trimmed !== subtask.title) {
      onUpdate({ title: trimmed });
    } else {
      setEditTitle(subtask.title);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (editing) return;
    if ((e.target as HTMLElement).closest('a') && (e.ctrlKey || e.metaKey)) return;
    if (isSelected) {
      if (!(e.target as HTMLElement).closest('a')) {
        setEditing(true);
      }
    } else {
      onSelect();
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
      ref={(node) => { setNodeRef(node); (rowRef as React.MutableRefObject<HTMLDivElement | null>).current = node; }}
      style={style}
      tabIndex={isSelected ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={`flex items-center gap-2 group cursor-pointer rounded transition-colors outline-none px-1 py-0.5 ${
        isSelected ? "bg-indigo-50 ring-1 ring-indigo-200" : "hover:bg-gray-50"
      }`}
    >
      <span {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-gray-500">
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M7 2a2 2 0 10.001 4.001A2 2 0 007 2zm0 6a2 2 0 10.001 4.001A2 2 0 007 8zm0 6a2 2 0 10.001 4.001A2 2 0 007 14zm6-8a2 2 0 10-.001-4.001A2 2 0 0013 6zm0 2a2 2 0 10.001 4.001A2 2 0 0013 8zm0 6a2 2 0 10.001 4.001A2 2 0 0013 14z" />
        </svg>
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
          subtask.completed
            ? "bg-green-500 border-green-500 text-white"
            : "border-gray-300 hover:border-green-400"
        }`}
      >
        {subtask.completed && (
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") { setEditTitle(subtask.title); setEditing(false); }
          }}
          onBlur={commitEdit}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-sm px-1 py-0.5 bg-white border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      ) : (
        <span
          className={`flex-1 text-sm transition-colors ${subtask.completed ? "line-through text-gray-400" : "text-gray-700"}`}
        >
          <LinkifiedText text={subtask.title} />
        </span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onNavigate(); }}
        className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-indigo-600 text-gray-400 transition-opacity"
        title="Open subtask details"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

/** Custom undo/redo for contentEditable editors (native undo breaks with manual DOM ops) */
export function useEditorHistory(editorRef: React.RefObject<HTMLDivElement | null>) {
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const lastSnapshot = useRef<string>("");
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const snapshot = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    if (html !== lastSnapshot.current) {
      undoStack.current.push(lastSnapshot.current);
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];
      lastSnapshot.current = html;
    }
  }, [editorRef]);

  const snapshotDebounced = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(snapshot, 500);
  }, [snapshot]);

  const undo = useCallback((): boolean => {
    if (!editorRef.current) return false;
    if (debounceTimer.current) { clearTimeout(debounceTimer.current); debounceTimer.current = null; }
    const currentHtml = editorRef.current.innerHTML;
    if (currentHtml !== lastSnapshot.current) {
      undoStack.current.push(lastSnapshot.current);
      if (undoStack.current.length > 100) undoStack.current.shift();
      lastSnapshot.current = currentHtml;
    }
    if (undoStack.current.length === 0) return false;
    redoStack.current.push(currentHtml);
    const prev = undoStack.current.pop()!;
    editorRef.current.innerHTML = prev;
    lastSnapshot.current = prev;
    return true;
  }, [editorRef]);

  const redo = useCallback((): boolean => {
    if (!editorRef.current || redoStack.current.length === 0) return false;
    if (debounceTimer.current) { clearTimeout(debounceTimer.current); debounceTimer.current = null; }
    const currentHtml = editorRef.current.innerHTML;
    undoStack.current.push(currentHtml);
    const next = redoStack.current.pop()!;
    editorRef.current.innerHTML = next;
    lastSnapshot.current = next;
    return true;
  }, [editorRef]);

  const init = useCallback((html: string) => {
    undoStack.current = [];
    redoStack.current = [];
    lastSnapshot.current = html;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
  }, []);

  return { snapshot, snapshotDebounced, undo, redo, init };
}

/** Copy a selected image to the clipboard */
export async function copyImageToClipboard(img: HTMLImageElement) {
  const html = img.outerHTML;
  const md = `![${img.alt || ""}](${img.src || ""})`;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([md], { type: "text/plain" }),
      }),
    ]);
  } catch {
    // Fallback: write plain markdown
    await navigator.clipboard.writeText(md);
  }
}

/** Overlay for selecting, resizing, and deleting images in contentEditable editors */
export function ImageSelectionOverlay({
  img,
  containerEl,
  onDelete,
  onContentChange,
}: {
  img: HTMLImageElement;
  containerEl: HTMLElement;
  onDelete: () => void;
  onContentChange: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, height: 0 });

  const updatePos = useCallback(() => {
    const cr = containerEl.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    setPos({
      top: ir.top - cr.top + containerEl.scrollTop,
      left: ir.left - cr.left + containerEl.scrollLeft,
      width: ir.width,
      height: ir.height,
    });
  }, [img, containerEl]);

  useEffect(() => {
    updatePos();
    const ro = new ResizeObserver(updatePos);
    ro.observe(img);
    ro.observe(containerEl);
    return () => ro.disconnect();
  }, [img, containerEl, updatePos]);

  const handleResizeStart = (corner: "nw" | "ne" | "sw" | "se", e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = img.getBoundingClientRect().width;
    const invertX = corner === "nw" || corner === "sw";
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const newWidth = Math.max(50, startWidth + (invertX ? -dx : dx));
      img.style.width = `${Math.round(newWidth)}px`;
      img.style.height = "auto";
      updatePos();
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      onContentChange();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const setWidth = (pct: number) => {
    img.style.width = `${pct}%`;
    img.style.height = "auto";
    requestAnimationFrame(updatePos);
    onContentChange();
  };

  const toolbarAbove = pos.top >= 40;

  return (
    <>
      <div
        className="pointer-events-none absolute rounded border-2 border-indigo-500"
        style={{ top: pos.top, left: pos.left, width: pos.width, height: pos.height, zIndex: 10 }}
      />
      <div
        className="absolute flex items-center gap-1 bg-white border border-gray-200 rounded-lg shadow-lg px-1 py-1"
        style={{
          top: toolbarAbove ? pos.top - 36 : pos.top + pos.height + 4,
          left: pos.left,
          zIndex: 11,
        }}
        onMouseDown={(e) => e.preventDefault()}
      >
        {[25, 50, 75, 100].map((pct) => (
          <button
            key={pct}
            onClick={() => setWidth(pct)}
            className="px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-100 rounded"
          >
            {pct}%
          </button>
        ))}
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <button
          onClick={onDelete}
          className="px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 rounded"
          title="Delete image"
        >
          ✕
        </button>
      </div>
      {(["nw", "ne", "sw", "se"] as const).map((corner) => {
        const isTop = corner[0] === "n";
        const isLeft = corner[1] === "w";
        const cursor = corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize";
        return (
          <div
            key={corner}
            className="absolute bg-indigo-500 border-2 border-white rounded-sm"
            style={{
              top: isTop ? pos.top - 5 : pos.top + pos.height - 5,
              left: isLeft ? pos.left - 5 : pos.left + pos.width - 5,
              width: 10,
              height: 10,
              cursor,
              zIndex: 11,
            }}
            onMouseDown={(e) => handleResizeStart(corner, e)}
          />
        );
      })}
    </>
  );
}

/** contentEditable description editor that renders images inline */
export function RichDescriptionEditor({
  value,
  onSave,
  uploadImage,
  taskId,
}: {
  value: string;
  onSave: (val: string) => void;
  uploadImage: (file: File) => Promise<string | null>;
  taskId: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const internalValue = useRef(value);
  const [empty, setEmpty] = useState(!value);
  const [dragOver, setDragOver] = useState(false);
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const history = useEditorHistory(editorRef);

  // Deselect image on outside click
  useEffect(() => {
    if (!selectedImg) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectedImg(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedImg]);

  function toHtml(md: string): string {
    if (!md) return "";
    return md
      .split(/(!\[[^\]]*\]\([^)]+\)(?:\{[^}]+\})?)/g)
      .map((part) => {
        const m = part.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]+)\})?$/);
        if (m) {
          const alt = m[1].replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
          const src = m[2].replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
          const widthStyle = m[3] && /^\d+(%|px)$/.test(m[3]) ? ` style="width: ${m[3]}; height: auto"` : "";
          return `<img src="${src}" alt="${alt}"${widthStyle} class="max-w-full rounded-lg my-1 inline-block" contenteditable="false" />`;
        }
        return part
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/(https?:\/\/[^\s<>)"',]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-indigo-600 underline decoration-indigo-300 hover:decoration-indigo-600" contenteditable="false">$1</a>')
          .replace(/\n/g, "<br>");
      })
      .join("");
  }

  function toMarkdown(el: HTMLElement): string {
    let result = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent || "";
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        if (element.tagName === "IMG") {
          const imgWidth = (element as HTMLImageElement).style.width;
          const widthSuffix = imgWidth && /^\d+(%|px)$/.test(imgWidth) ? `{${imgWidth}}` : "";
          result += `![${element.getAttribute("alt") || ""}](${element.getAttribute("src") || ""})${widthSuffix}`;
        } else if (element.tagName === "A") {
          result += element.getAttribute("href") || element.textContent || "";
        } else if (element.tagName === "BR") {
          result += "\n";
        } else if (element.tagName === "DIV" || element.tagName === "P") {
          if (result && !result.endsWith("\n")) result += "\n";
          result += toMarkdown(element);
        } else {
          result += toMarkdown(element);
        }
      }
    }
    return result;
  }

  // Set HTML on mount and task switch
  useEffect(() => {
    if (editorRef.current) {
      const html = toHtml(value) || "";
      editorRef.current.innerHTML = html;
      internalValue.current = value;
      setEmpty(!value);
      setSelectedImg(null);
      history.init(html);
    }
  }, [taskId]);

  const handleInput = () => {
    if (editorRef.current) {
      internalValue.current = toMarkdown(editorRef.current);
      setEmpty(!internalValue.current);
      history.snapshotDebounced();
    }
  };

  const handleBlur = () => {
    if (editorRef.current) {
      const md = toMarkdown(editorRef.current);
      internalValue.current = md;
      setEmpty(!md);
      editorRef.current.innerHTML = toHtml(md) || "";
      if (md !== value) {
        onSave(md);
      }
    }
  };

  const saveContent = () => {
    if (editorRef.current) {
      internalValue.current = toMarkdown(editorRef.current);
      setEmpty(!internalValue.current);
      onSave(internalValue.current);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {empty && (
        <div className="absolute top-2 left-3 text-sm text-gray-400 pointer-events-none" style={{ zIndex: 1 }}>
          Add a description...
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onBlur={handleBlur}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === "IMG" && editorRef.current?.contains(target)) {
            e.preventDefault();
            setSelectedImg(target as HTMLImageElement);
          } else {
            setSelectedImg(null);
          }
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
            e.preventDefault();
            if (history.undo()) {
              setSelectedImg(null);
              handleInput();
            }
            return;
          }
          if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
            e.preventDefault();
            if (history.redo()) {
              setSelectedImg(null);
              handleInput();
            }
            return;
          }
          if (selectedImg && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
            e.preventDefault();
            copyImageToClipboard(selectedImg);
            return;
          }
          if (selectedImg && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "x") {
            e.preventDefault();
            copyImageToClipboard(selectedImg);
            history.snapshot();
            selectedImg.remove();
            setSelectedImg(null);
            saveContent();
            return;
          }
          if (selectedImg && (e.key === "Delete" || e.key === "Backspace")) {
            e.preventDefault();
            history.snapshot();
            selectedImg.remove();
            setSelectedImg(null);
            saveContent();
          }
          if (selectedImg && e.key === "Escape") {
            setSelectedImg(null);
          }
        }}
        onPaste={async (e) => {
          e.preventDefault();
          history.snapshot();
          // Check for pasted image files (e.g. screenshot paste)
          const items = Array.from(e.clipboardData.items);
          const imageItem = items.find((item) => item.type.startsWith("image/"));
          if (imageItem) {
            const file = imageItem.getAsFile();
            if (file) {
              const url = await uploadImage(file);
              if (url && editorRef.current) {
                const img = document.createElement("img");
                img.src = url;
                img.alt = file.name || "pasted-image";
                img.className = "max-w-full rounded-lg my-1 inline-block";
                img.contentEditable = "false";
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
                  const range = sel.getRangeAt(0);
                  range.deleteContents();
                  range.insertNode(img);
                  range.setStartAfter(img);
                  range.collapse(true);
                  sel.removeAllRanges();
                  sel.addRange(range);
                } else {
                  editorRef.current.appendChild(img);
                }
                internalValue.current = toMarkdown(editorRef.current);
                setEmpty(false);
                onSave(internalValue.current);
              }
              return;
            }
          }
          const html = e.clipboardData.getData("text/html");
          if (html && /<img\s/i.test(html)) {
            // Preserve images (e.g. cut/copy within editor)
            const temp = document.createElement("div");
            temp.innerHTML = html;
            // Strip everything except img, br, and text nodes
            const clean = document.createElement("div");
            function extractNodes(source: Node) {
              for (const node of Array.from(source.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE) {
                  clean.appendChild(node.cloneNode());
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                  const el = node as HTMLElement;
                  if (el.tagName === "IMG") {
                    const img = document.createElement("img");
                    img.src = el.getAttribute("src") || "";
                    img.alt = el.getAttribute("alt") || "";
                    img.className = "max-w-full rounded-lg my-1 inline-block";
                    img.contentEditable = "false";
                    clean.appendChild(img);
                  } else if (el.tagName === "BR") {
                    clean.appendChild(document.createElement("br"));
                  } else {
                    extractNodes(el);
                  }
                }
              }
            }
            extractNodes(temp);
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              const frag = document.createDocumentFragment();
              while (clean.firstChild) frag.appendChild(clean.firstChild);
              range.insertNode(frag);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } else {
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }
          handleInput();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types.includes("Files")) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={async (e) => {
          setDragOver(false);
          const imageFiles = Array.from(e.dataTransfer.files).filter((f) =>
            f.type.startsWith("image/")
          );
          if (imageFiles.length === 0) return;
          e.preventDefault();
          e.stopPropagation();
          history.snapshot();
          for (const file of imageFiles) {
            const url = await uploadImage(file);
            if (url && editorRef.current) {
              const img = document.createElement("img");
              img.src = url;
              img.alt = file.name;
              img.className = "max-w-full rounded-lg my-1 inline-block";
              img.contentEditable = "false";
              const sel = window.getSelection();
              if (
                sel &&
                sel.rangeCount > 0 &&
                editorRef.current.contains(sel.anchorNode)
              ) {
                const range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(img);
                range.setStartAfter(img);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
              } else {
                editorRef.current.appendChild(img);
              }
              internalValue.current = toMarkdown(editorRef.current);
              setEmpty(false);
              onSave(internalValue.current);
            }
          }
        }}
        className={`w-full min-h-[40px] px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 break-words whitespace-pre-wrap transition-colors ${dragOver ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-300" : "border-gray-200"}`}
      />
      {selectedImg && containerRef.current && (
        <ImageSelectionOverlay
          img={selectedImg}
          containerEl={containerRef.current}
          onDelete={() => {
            history.snapshot();
            selectedImg.remove();
            setSelectedImg(null);
            saveContent();
          }}
          onContentChange={saveContent}
        />
      )}
    </div>
  );
}

/** Renders text with inline markdown images and preserves whitespace */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(!\[[^\]]*\]\([^)]+\)(?:\{[^}]+\})?)/g);
  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        const match = part.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\{([^}]+)\})?$/);
        if (match) {
          const widthStyle = match[3] && /^\d+(%|px)$/.test(match[3]) ? { width: match[3], height: "auto" as const } : undefined;
          return (
            <img
              key={i}
              src={match[2]}
              alt={match[1]}
              style={widthStyle}
              className="max-w-full rounded-lg my-1 inline-block"
            />
          );
        }
        return <LinkifiedText key={i} text={part} />;
      })}
    </div>
  );
}

/** contentEditable comment input with image paste/drop support */
const RichCommentInput = forwardRef<
  { clear: () => void },
  {
    onChange: (val: string) => void;
    onSubmit: (val: string) => void;
    uploadImage: (file: File) => Promise<string | null>;
    taskId: string;
  }
>(function RichCommentInput({ onChange, onSubmit, uploadImage, taskId }, ref) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const history = useEditorHistory(editorRef);

  // Deselect image on outside click
  useEffect(() => {
    if (!selectedImg) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSelectedImg(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selectedImg]);

  function toMarkdown(el: HTMLElement): string {
    let result = "";
    for (const node of Array.from(el.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent || "";
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as HTMLElement;
        if (element.tagName === "IMG") {
          const imgWidth = (element as HTMLImageElement).style.width;
          const widthSuffix = imgWidth && /^\d+(%|px)$/.test(imgWidth) ? `{${imgWidth}}` : "";
          result += `![${element.getAttribute("alt") || ""}](${element.getAttribute("src") || ""})${widthSuffix}`;
        } else if (element.tagName === "A") {
          result += element.getAttribute("href") || element.textContent || "";
        } else if (element.tagName === "BR") {
          result += "\n";
        } else if (element.tagName === "DIV" || element.tagName === "P") {
          if (result && !result.endsWith("\n")) result += "\n";
          result += toMarkdown(element);
        } else {
          result += toMarkdown(element);
        }
      }
    }
    return result;
  }

  function getValue(): string {
    return editorRef.current ? toMarkdown(editorRef.current) : "";
  }

  useImperativeHandle(ref, () => ({
    clear() {
      if (editorRef.current) {
        editorRef.current.innerHTML = "";
        setEmpty(true);
        history.init("");
      }
    },
  }));

  // Reset on task switch
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
      setEmpty(true);
      setSelectedImg(null);
      history.init("");
    }
  }, [taskId]);

  const handleInput = () => {
    const val = getValue();
    onChange(val);
    setEmpty(!val);
    history.snapshotDebounced();
  };

  function insertImageElement(url: string, alt: string) {
    if (!editorRef.current) return;
    const img = document.createElement("img");
    img.src = url;
    img.alt = alt;
    img.className = "max-w-full rounded-lg my-1 inline-block";
    img.contentEditable = "false";
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(img);
      range.setStartAfter(img);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      editorRef.current.appendChild(img);
    }
    handleInput();
  }

  return (
    <div className="relative flex-1" ref={containerRef}>
      {empty && (
        <div className="absolute top-1.5 left-3 text-sm text-gray-400 pointer-events-none" style={{ zIndex: 1 }}>
          Add a comment...
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-unsaved-check
        onInput={handleInput}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.tagName === "IMG" && editorRef.current?.contains(target)) {
            e.preventDefault();
            setSelectedImg(target as HTMLImageElement);
          } else {
            setSelectedImg(null);
          }
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
            e.preventDefault();
            if (history.undo()) {
              setSelectedImg(null);
              handleInput();
            }
            return;
          }
          if ((e.metaKey || e.ctrlKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
            e.preventDefault();
            if (history.redo()) {
              setSelectedImg(null);
              handleInput();
            }
            return;
          }
          if (selectedImg && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c") {
            e.preventDefault();
            copyImageToClipboard(selectedImg);
            return;
          }
          if (selectedImg && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "x") {
            e.preventDefault();
            copyImageToClipboard(selectedImg);
            history.snapshot();
            selectedImg.remove();
            setSelectedImg(null);
            handleInput();
            return;
          }
          if (selectedImg && (e.key === "Delete" || e.key === "Backspace")) {
            e.preventDefault();
            history.snapshot();
            selectedImg.remove();
            setSelectedImg(null);
            handleInput();
          }
          if (selectedImg && e.key === "Escape") {
            setSelectedImg(null);
          }
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            const val = getValue();
            if (val.trim()) onSubmit(val);
          }
        }}
        onPaste={async (e) => {
          e.preventDefault();
          history.snapshot();
          // Check for pasted image files (e.g. screenshot paste)
          const items = Array.from(e.clipboardData.items);
          const imageItem = items.find((item) => item.type.startsWith("image/"));
          if (imageItem) {
            const file = imageItem.getAsFile();
            if (file) {
              const url = await uploadImage(file);
              if (url) insertImageElement(url, file.name || "pasted-image");
              return;
            }
          }
          // Check for HTML with images (cut/copy from editor)
          const html = e.clipboardData.getData("text/html");
          if (html && /<img\s/i.test(html)) {
            const temp = document.createElement("div");
            temp.innerHTML = html;
            const clean = document.createElement("div");
            function extractNodes(source: Node) {
              for (const node of Array.from(source.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE) {
                  clean.appendChild(node.cloneNode());
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                  const el = node as HTMLElement;
                  if (el.tagName === "IMG") {
                    const img = document.createElement("img");
                    img.src = el.getAttribute("src") || "";
                    img.alt = el.getAttribute("alt") || "";
                    img.className = "max-w-full rounded-lg my-1 inline-block";
                    img.contentEditable = "false";
                    clean.appendChild(img);
                  } else if (el.tagName === "BR") {
                    clean.appendChild(document.createElement("br"));
                  } else {
                    extractNodes(el);
                  }
                }
              }
            }
            extractNodes(temp);
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
              const range = sel.getRangeAt(0);
              range.deleteContents();
              const frag = document.createDocumentFragment();
              while (clean.firstChild) frag.appendChild(clean.firstChild);
              range.insertNode(frag);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } else {
            const text = e.clipboardData.getData("text/plain");
            document.execCommand("insertText", false, text);
          }
          handleInput();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          if (e.dataTransfer.types.includes("Files")) setDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
        }}
        onDrop={async (e) => {
          setDragOver(false);
          const imageFiles = Array.from(e.dataTransfer.files).filter((f) =>
            f.type.startsWith("image/")
          );
          if (imageFiles.length === 0) return;
          e.preventDefault();
          e.stopPropagation();
          history.snapshot();
          for (const file of imageFiles) {
            const url = await uploadImage(file);
            if (url) insertImageElement(url, file.name);
          }
        }}
        className={`w-full min-h-[36px] px-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 break-words whitespace-pre-wrap transition-colors ${dragOver ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-300" : "border-gray-200"}`}
      />
      {selectedImg && containerRef.current && (
        <ImageSelectionOverlay
          img={selectedImg}
          containerEl={containerRef.current}
          onDelete={() => {
            history.snapshot();
            selectedImg.remove();
            setSelectedImg(null);
            handleInput();
          }}
          onContentChange={handleInput}
        />
      )}
    </div>
  );
});
