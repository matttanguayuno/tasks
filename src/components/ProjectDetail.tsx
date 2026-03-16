"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RichDescriptionEditor } from "./TaskDetail";
import { api } from "@/lib/api";
import type { ProjectWithSections, ProjectLink, ProjectAttachment } from "@/lib/types";

interface SortableLinkRowProps {
  link: ProjectLink;
  isEditing: boolean;
  editLinkName: string;
  editLinkUrl: string;
  editNameRef: React.RefObject<HTMLInputElement | null>;
  onEditNameChange: (v: string) => void;
  onEditUrlChange: (v: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
}

function SortableLinkRow({
  link,
  isEditing,
  editLinkName,
  editLinkUrl,
  editNameRef,
  onEditNameChange,
  onEditUrlChange,
  onCommitEdit,
  onCancelEdit,
  onStartEdit,
  onDelete,
}: SortableLinkRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: link.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group">
      {isEditing ? (
        <div className="flex items-center gap-2 px-2 py-1.5 bg-indigo-50 rounded text-sm">
          <input
            ref={editNameRef}
            type="text"
            value={editLinkName}
            onChange={(e) => onEditNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            placeholder="Name"
            className="flex-1 min-w-0 px-2 py-0.5 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <input
            type="url"
            value={editLinkUrl}
            onChange={(e) => onEditUrlChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onCommitEdit();
              if (e.key === "Escape") onCancelEdit();
            }}
            placeholder="https://..."
            className="flex-1 min-w-0 px-2 py-0.5 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={onCommitEdit}
            className="px-2 py-0.5 text-xs text-white bg-indigo-600 rounded hover:bg-indigo-700"
          >
            Save
          </button>
          <button
            onClick={onCancelEdit}
            className="px-2 py-0.5 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div
          {...attributes}
          {...listeners}
          className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded text-sm hover:bg-gray-100 transition-colors cursor-grab active:cursor-grabbing touch-none"
        >
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            onPointerDown={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 text-indigo-600 hover:underline truncate cursor-pointer"
            title={link.url}
          >
            {link.name}
          </a>
          <span className="text-xs text-gray-400 truncate max-w-[150px] hidden sm:block">
            {link.url.replace(/^https?:\/\//, "").split("/")[0]}
          </span>
          <button
            onClick={onStartEdit}
            className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-indigo-600 text-gray-400 transition-opacity"
            title="Edit link"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-500 text-gray-400 transition-opacity"
            title="Delete link"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

interface ProjectDetailProps {
  project: ProjectWithSections;
  onRefresh: () => void;
  onClose?: () => void;
}

export function ProjectDetail({ project, onRefresh, onClose }: ProjectDetailProps) {
  const [description, setDescription] = useState(project.description);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editLinkName, setEditLinkName] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const editNameRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  const [panelWidth, setPanelWidth] = useState(0);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync state when project changes
  const [prevProjectId, setPrevProjectId] = useState(project.id);
  if (project.id !== prevProjectId) {
    setPrevProjectId(project.id);
    setDescription(project.description);
    setNewLinkName("");
    setNewLinkUrl("");
    setEditingLinkId(null);
  }

  useEffect(() => {
    setDescription(project.description);
  }, [project.description]);

  // Restore saved width from localStorage
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

  const updateDescription = async (val: string) => {
    setDescription(val);
    if (val !== project.description) {
      await api.projects.update(project.id, { description: val });
      onRefresh();
    }
  };

  const handleAddLink = async () => {
    const name = newLinkName.trim();
    const url = newLinkUrl.trim();
    if (!name || !url) return;
    await api.projectLinks.create(project.id, { name, url });
    setNewLinkName("");
    setNewLinkUrl("");
    onRefresh();
  };

  const handleDeleteLink = async (linkId: string) => {
    await api.projectLinks.delete(project.id, linkId);
    onRefresh();
  };

  const startEditLink = (link: ProjectLink) => {
    setEditingLinkId(link.id);
    setEditLinkName(link.name);
    setEditLinkUrl(link.url);
    setTimeout(() => editNameRef.current?.focus(), 0);
  };

  const commitEditLink = async () => {
    if (!editingLinkId) return;
    const name = editLinkName.trim();
    const url = editLinkUrl.trim();
    if (name && url) {
      await api.projectLinks.update(project.id, editingLinkId, { name, url });
      onRefresh();
    }
    setEditingLinkId(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleLinkDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !project.links) return;
    const oldIndex = project.links.findIndex((l) => l.id === active.id);
    const newIndex = project.links.findIndex((l) => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(project.links, oldIndex, newIndex);
    // Optimistic update via onRefresh after API call
    await api.reorder(
      reordered.map((l, i) => ({ id: l.id, order: i })),
      "projectLink"
    );
    onRefresh();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await api.projectAttachments.upload(project.id, file);
    onRefresh();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      await api.projectAttachments.upload(project.id, file);
    }
    onRefresh();
  }, [project.id, onRefresh]);

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

  const handleDeleteAttachment = async (attachmentId: string) => {
    await api.projectAttachments.delete(project.id, attachmentId);
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
      {/* Drag overlay */}
      {dragging && (
        <div className="absolute inset-0 bg-indigo-50/80 border-2 border-dashed border-indigo-400 z-40 flex items-center justify-center">
          <div className="text-indigo-600 font-medium flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Drop files to attach
          </div>
        </div>
      )}
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute left-0 top-0 bottom-0 w-2 -ml-1 cursor-col-resize hover:bg-indigo-400 active:bg-indigo-500 z-30 transition-colors"
      />

      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
        <div
          className="w-3 h-3 rounded-sm shrink-0"
          style={{ backgroundColor: project.color }}
        />
        <h2 className="text-lg font-semibold text-gray-900 truncate">{project.name}</h2>
        <div className="flex-1" />
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded hidden md:block"
            title="Close panel"
          >
            <svg className="w-5 h-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-6">
        {/* Description */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Notes</label>
          <RichDescriptionEditor
            value={description}
            taskId={project.id}
            onSave={updateDescription}
            uploadImage={async () => null}
          />
        </div>

        {/* Links */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block">
            Links {project.links && project.links.length > 0 && `(${project.links.length})`}
          </label>

          {project.links && project.links.length > 0 && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleLinkDragEnd}
            >
              <SortableContext items={project.links.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1 mb-2">
                  {project.links.map((link) => (
                    <SortableLinkRow
                      key={link.id}
                      link={link}
                      isEditing={editingLinkId === link.id}
                      editLinkName={editLinkName}
                      editLinkUrl={editLinkUrl}
                      editNameRef={editNameRef}
                      onEditNameChange={setEditLinkName}
                      onEditUrlChange={setEditLinkUrl}
                      onCommitEdit={commitEditLink}
                      onCancelEdit={() => setEditingLinkId(null)}
                      onStartEdit={() => startEditLink(link)}
                      onDelete={() => handleDeleteLink(link.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {/* Add link form */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newLinkName}
              onChange={(e) => setNewLinkName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddLink()}
              placeholder="Link name..."
              className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <input
              type="url"
              value={newLinkUrl}
              onChange={(e) => setNewLinkUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddLink()}
              placeholder="https://..."
              className="flex-1 min-w-0 px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleAddLink}
              className="px-2 py-1 text-sm text-indigo-600 hover:bg-indigo-50 rounded shrink-0"
            >
              Add
            </button>
          </div>
        </div>

        {/* Attachments */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block">
            Attachments {project.attachments && project.attachments.length > 0 && `(${project.attachments.length})`}
          </label>
          {project.attachments && project.attachments.length > 0 && (
            <div className="space-y-1 mb-2">
              {project.attachments.map((att: ProjectAttachment) => (
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

        {/* Delete attachment confirmation */}
        {confirmDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={() => setConfirmDelete(null)}>
            <div className="bg-white rounded-lg shadow-lg p-4 max-w-xs" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Delete attachment</h3>
              <p className="text-sm text-gray-600 mb-3">Are you sure you want to delete this attachment?</p>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setConfirmDelete(null)} className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
                <button onClick={() => handleDeleteAttachment(confirmDelete)} className="px-3 py-1 text-sm text-white bg-red-600 rounded hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
