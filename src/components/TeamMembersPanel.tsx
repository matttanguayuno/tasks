"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";

interface TeamMember {
  id: string;
  name: string;
  role: string;
  discord: string;
  email: string;
  notes: string;
  order: number;
}

export default function TeamMembersPanel({ onClose }: { onClose?: () => void }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const load = async () => {
    try {
      const data = await api.teamMembers.list();
      setMembers(data as TeamMember[]);
    } catch {
      // API may not be ready yet (e.g. after schema change)
      setMembers([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach(clearTimeout);
    };
  }, []);

  const updateField = (id: string, field: keyof TeamMember, value: string) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m))
    );
    // Debounced auto-save
    if (saveTimers.current[id]) clearTimeout(saveTimers.current[id]);
    saveTimers.current[id] = setTimeout(() => {
      api.teamMembers.update(id, { [field]: value });
    }, 500);
  };

  const addMember = async () => {
    const m = (await api.teamMembers.create()) as TeamMember;
    setMembers((prev) => [...prev, m]);
    setExpandedId(m.id);
    setEditingId(m.id);
  };

  const removeMember = async (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
    await api.teamMembers.delete(id);
    if (expandedId === id) setExpandedId(null);
  };

  if (loading) {
    return (
      <div className="w-full md:w-[450px] lg:w-[550px] xl:w-[650px] border-l border-gray-200 bg-white flex flex-col overflow-hidden shrink-0">
        <div className="flex items-center justify-center h-full text-gray-400 text-sm">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="w-full md:w-[450px] lg:w-[550px] xl:w-[650px] border-l border-gray-200 bg-white flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h2 className="font-semibold text-gray-900">Team Members</h2>
          <span className="text-xs text-gray-400">({members.length})</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={addMember}
            className="px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
          >
            + Add
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="ml-1 p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
              title="Hide panel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M6 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Members list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
        {members.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-sm">No team members yet</p>
            <button
              onClick={addMember}
              className="mt-2 text-sm text-indigo-600 hover:text-indigo-800"
            >
              Add your first member
            </button>
          </div>
        ) : (
          members.map((member) => {
            const isExpanded = expandedId === member.id;
            return (
              <div
                key={member.id}
                className={`rounded-lg border transition-colors ${
                  isExpanded
                    ? "border-indigo-200 bg-indigo-50/30"
                    : "border-gray-200 hover:border-gray-300 bg-white"
                }`}
              >
                {/* Collapsed row */}
                <div
                  className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
                  onClick={() => setExpandedId(isExpanded ? null : member.id)}
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-sm font-semibold shrink-0">
                    {member.name
                      ? member.name
                          .split(/\s+/)
                          .map((w) => w[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2)
                      : "?"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">
                      {member.name || "Unnamed"}
                    </div>
                    {member.role && (
                      <div className="text-xs text-gray-500 truncate">
                        {member.role}
                      </div>
                    )}
                  </div>

                  {/* Quick info badges */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {member.discord && (
                      <span className="text-xs text-gray-400" title={member.discord}>
                        💬
                      </span>
                    )}
                    {member.email && (
                      <span className="text-xs text-gray-400" title={member.email}>
                        ✉
                      </span>
                    )}
                  </div>

                  <svg
                    className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
                    <div className="pt-2 space-y-2">
                      <FieldRow
                        label="Name"
                        value={member.name}
                        editing={editingId === member.id}
                        onChange={(v) => updateField(member.id, "name", v)}
                        autoFocus={editingId === member.id}
                        onFocus={() => setEditingId(member.id)}
                      />
                      <FieldRow
                        label="Role"
                        value={member.role}
                        editing={editingId === member.id}
                        placeholder="e.g. Frontend Dev"
                        onChange={(v) => updateField(member.id, "role", v)}
                        onFocus={() => setEditingId(member.id)}
                      />
                      <FieldRow
                        label="Discord"
                        value={member.discord}
                        editing={editingId === member.id}
                        placeholder="username#1234"
                        onChange={(v) => updateField(member.id, "discord", v)}
                        onFocus={() => setEditingId(member.id)}
                      />
                      <FieldRow
                        label="Email"
                        value={member.email}
                        editing={editingId === member.id}
                        placeholder="name@example.com"
                        onChange={(v) => updateField(member.id, "email", v)}
                        onFocus={() => setEditingId(member.id)}
                      />
                      <div>
                        <label className="text-xs font-medium text-gray-500 block mb-1">
                          Notes
                        </label>
                        <textarea
                          value={member.notes}
                          onChange={(e) =>
                            updateField(member.id, "notes", e.target.value)
                          }
                          onFocus={() => setEditingId(member.id)}
                          placeholder="Anything to remember…"
                          rows={2}
                          className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeMember(member.id);
                        }}
                        className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function FieldRow({
  label,
  value,
  placeholder,
  onChange,
  autoFocus,
  onFocus,
}: {
  label: string;
  value: string;
  editing?: boolean;
  placeholder?: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  onFocus?: () => void;
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 block mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
      />
    </div>
  );
}
