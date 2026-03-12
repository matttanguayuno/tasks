"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";

interface SearchResult {
  id: string;
  title: string;
  description: string;
  priority: string;
  completed: boolean;
  section?: {
    name: string;
    project?: { id: string; name: string };
  };
}

interface SearchOverlayProps {
  onClose: () => void;
  onSelectTask: (task: SearchResult) => void;
}

export function SearchOverlay({ onClose, onSelectTask }: SearchOverlayProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.search(query.trim());
        setResults(data as SearchResult[]);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks..."
            className="flex-1 text-sm outline-none bg-transparent"
          />
          <kbd className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">ESC</kbd>
        </div>

        <div className="max-h-[40vh] overflow-auto">
          {loading && (
            <div className="py-6 text-center text-sm text-gray-400">Searching...</div>
          )}

          {!loading && query && results.length === 0 && (
            <div className="py-6 text-center text-sm text-gray-400">No tasks found</div>
          )}

          {results.map((task) => (
            <button
              key={task.id}
              onClick={() => onSelectTask(task)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors"
            >
              <div
                className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                  task.completed ? "bg-green-500 border-green-500" : "border-gray-300"
                }`}
              >
                {task.completed && (
                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate ${task.completed ? "line-through text-gray-400" : "text-gray-800"}`}>
                  {task.title}
                </div>
                {task.section?.project && (
                  <div className="text-xs text-gray-400 truncate">
                    {task.section.project.name} &rsaquo; {task.section.name}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
