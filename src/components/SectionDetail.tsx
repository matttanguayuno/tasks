"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "@/lib/api";
import type { SectionWithTasks } from "@/lib/types";
import { RichDescriptionEditor } from "./TaskDetail";

interface SectionDetailProps {
  section: SectionWithTasks;
  projectId: string;
  onClose: () => void;
  onRefresh: () => void;
}

export default function SectionDetail({ section, projectId, onClose, onRefresh }: SectionDetailProps) {
  const [notes, setNotes] = useState(section.notes || "");
  const [panelWidth, setPanelWidth] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    const saved = localStorage.getItem("detailPanelWidth");
    if (saved) setPanelWidth(parseInt(saved, 10));
  }, []);

  useEffect(() => {
    setNotes(section.notes || "");
  }, [section.id, section.notes]);

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

  const handleSaveNotes = async (val: string) => {
    setNotes(val);
    if (val !== section.notes) {
      await api.sections.update(projectId, section.id, { notes: val });
      onRefresh();
    }
  };

  const totalTasks = section.tasks.length;
  const completedTasks = section.tasks.filter((t) => t.completed).length;

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
        <h2 className="text-lg font-semibold text-gray-900 flex-1">{section.name}</h2>
        {totalTasks > 0 && (
          <span className="text-xs text-gray-400">
            {completedTasks}/{totalTasks} done
          </span>
        )}
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
          title="Close panel"
        >
          <svg className="w-5 h-5 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1 block">Notes</label>
          <RichDescriptionEditor
            value={notes}
            taskId={section.id}
            onSave={handleSaveNotes}
            uploadImage={async () => null}
          />
        </div>
      </div>
    </div>
  );
}
