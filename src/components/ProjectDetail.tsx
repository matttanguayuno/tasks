"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { RichDescriptionEditor } from "./TaskDetail";
import { api } from "@/lib/api";
import type { ProjectWithSections, ProjectLink } from "@/lib/types";

interface ProjectDetailProps {
  project: ProjectWithSections;
  onRefresh: () => void;
}

export function ProjectDetail({ project, onRefresh }: ProjectDetailProps) {
  const [description, setDescription] = useState(project.description);
  const [newLinkName, setNewLinkName] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editLinkName, setEditLinkName] = useState("");
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const editNameRef = useRef<HTMLInputElement>(null);

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

  return (
    <div
      ref={panelRef}
      className={`w-full border-l border-gray-200 bg-white flex flex-col overflow-hidden shrink-0 relative ${panelWidth === 0 ? "md:w-[450px] lg:w-[550px] xl:w-[650px]" : ""}`}
      style={panelWidth > 0 ? { width: panelWidth } : undefined}
    >
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
            <div className="space-y-1 mb-2">
              {project.links.map((link) => (
                <div key={link.id} className="group">
                  {editingLinkId === link.id ? (
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-indigo-50 rounded text-sm">
                      <input
                        ref={editNameRef}
                        type="text"
                        value={editLinkName}
                        onChange={(e) => setEditLinkName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditLink();
                          if (e.key === "Escape") setEditingLinkId(null);
                        }}
                        placeholder="Name"
                        className="flex-1 min-w-0 px-2 py-0.5 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <input
                        type="url"
                        value={editLinkUrl}
                        onChange={(e) => setEditLinkUrl(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitEditLink();
                          if (e.key === "Escape") setEditingLinkId(null);
                        }}
                        placeholder="https://..."
                        className="flex-1 min-w-0 px-2 py-0.5 text-sm border border-indigo-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        onClick={commitEditLink}
                        className="px-2 py-0.5 text-xs text-white bg-indigo-600 rounded hover:bg-indigo-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingLinkId(null)}
                        className="px-2 py-0.5 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded text-sm hover:bg-gray-100 transition-colors">
                      <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 min-w-0 text-indigo-600 hover:underline truncate"
                        title={link.url}
                      >
                        {link.name}
                      </a>
                      <span className="text-xs text-gray-400 truncate max-w-[150px] hidden sm:block">
                        {link.url.replace(/^https?:\/\//, "").split("/")[0]}
                      </span>
                      <button
                        onClick={() => startEditLink(link)}
                        className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-indigo-600 text-gray-400 transition-opacity"
                        title="Edit link"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteLink(link.id)}
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
              ))}
            </div>
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
      </div>
    </div>
  );
}
