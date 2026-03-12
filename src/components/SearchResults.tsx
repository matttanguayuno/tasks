"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface SearchResult {
  id: string;
  title: string;
  description: string;
  priority: string;
  completed: boolean;
  section?: {
    name: string;
    project?: { id: string; name: string; color: string };
  };
}

interface SearchResultsProps {
  query: string;
  onSelectTask: (task: SearchResult) => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: "text-red-600",
  MEDIUM: "text-amber-600",
  LOW: "text-blue-600",
};

export function SearchResults({ query, onSelectTask }: SearchResultsProps) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Searching…
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <svg className="mx-auto w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-gray-500">No tasks matching &quot;{query}&quot;</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <p className="text-sm text-gray-500 mb-4">
        {results.length} result{results.length !== 1 ? "s" : ""} for &quot;{query}&quot;
      </p>

      <ul className="divide-y divide-gray-100">
        {results.map((task) => (
          <li key={task.id}>
            <button
              onClick={() => onSelectTask(task)}
              className="w-full flex items-start gap-3 px-3 py-3 hover:bg-gray-50 rounded-lg text-left transition-colors"
            >
              <div
                className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
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
                <p className={`text-sm font-medium ${task.completed ? "line-through text-gray-400" : "text-gray-900"}`}>
                  {task.title}
                </p>
                {task.section?.project && (
                  <div className="flex items-center gap-1.5 mt-1">
                    <div
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: task.section.project.color || "#6366f1" }}
                    />
                    <span className="text-xs text-gray-500 truncate">
                      {task.section.project.name} · {task.section.name}
                    </span>
                  </div>
                )}
              </div>

              {task.priority && task.priority !== "NONE" && (
                <span className={`text-xs font-medium mt-0.5 ${PRIORITY_COLORS[task.priority] || "text-gray-400"}`}>
                  {task.priority}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
