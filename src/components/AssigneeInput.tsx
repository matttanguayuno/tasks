"use client";

import { useState, useRef, useEffect } from "react";
import { api } from "@/lib/api";
import type { TaskAssignee } from "@/lib/types";

interface AssigneeInputProps {
  taskId: string;
  assignees: TaskAssignee[];
  onUpdate: () => void;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500",
];

function getColorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function AssigneeInitials({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "w-5 h-5 text-[9px]" : "w-6 h-6 text-[10px]";
  return (
    <div
      className={`${sizeClass} ${getColorForName(name)} rounded-full flex items-center justify-center text-white font-medium shrink-0`}
      title={name}
    >
      {getInitials(name)}
    </div>
  );
}

export default function AssigneeInput({ taskId, assignees, onUpdate }: AssigneeInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadSuggestions = async () => {
    const all = await api.assignees.list();
    const existing = new Set(assignees.map((a) => a.name.toLowerCase()));
    setSuggestions(all.filter((name) => !existing.has(name.toLowerCase())));
  };

  const handleFocus = async () => {
    await loadSuggestions();
    setShowSuggestions(true);
    setSelectedIndex(-1);
  };

  const addAssignee = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (assignees.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) return;
    await api.assignees.addToTask(taskId, trimmed);
    setInputValue("");
    setShowSuggestions(false);
    onUpdate();
  };

  const removeAssignee = async (assigneeId: string) => {
    await api.assignees.removeFromTask(taskId, assigneeId);
    onUpdate();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const filtered = suggestions.filter((s) =>
      s.toLowerCase().includes(inputValue.toLowerCase())
    );

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && filtered[selectedIndex]) {
        addAssignee(filtered[selectedIndex]);
      } else if (inputValue.trim()) {
        addAssignee(inputValue);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const filtered = suggestions.filter((s) =>
    s.toLowerCase().includes(inputValue.toLowerCase())
  );

  return (
    <div ref={containerRef} className="space-y-2">
      {/* Current assignees as chips */}
      {assignees.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {assignees.map((assignee) => (
            <span
              key={assignee.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-xs text-gray-700"
            >
              <AssigneeInitials name={assignee.name} size="sm" />
              {assignee.name}
              <button
                onClick={() => removeAssignee(assignee.id)}
                className="ml-0.5 text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input with autocomplete */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setSelectedIndex(-1);
            if (!showSuggestions) setShowSuggestions(true);
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder="Add assignee..."
          className="w-full px-2 py-1 text-sm bg-gray-50 border border-gray-200 rounded text-gray-700 placeholder-gray-400 focus:outline-none focus:border-indigo-500"
        />

        {showSuggestions && filtered.length > 0 && (
          <div className="absolute z-50 min-w-[200px] w-max mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-32 overflow-y-auto">
            {filtered.map((name, i) => (
              <button
                key={name}
                className={`w-full text-left px-2 py-1.5 text-sm flex items-center gap-2 ${
                  i === selectedIndex
                    ? "bg-indigo-600 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addAssignee(name);
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <AssigneeInitials name={name} size="sm" />
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
