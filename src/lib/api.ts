const API_BASE = "/api";

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || res.statusText);
  }
  return res.json();
}

// Projects
export const api = {
  projects: {
    list: (opts?: { archived?: boolean }) =>
      fetchJson<unknown[]>(`${API_BASE}/projects${opts?.archived ? "?archived=true" : ""}`),
    get: (id: string) => fetchJson<unknown>(`${API_BASE}/projects/${id}`),
    create: (data: { name: string; color?: string; icon?: string }) =>
      fetchJson<unknown>(`${API_BASE}/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Record<string, unknown>) =>
      fetchJson<unknown>(`${API_BASE}/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchJson<unknown>(`${API_BASE}/projects/${id}`, { method: "DELETE" }),
  },

  sections: {
    create: (projectId: string, data: { name: string }) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/sections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    update: (projectId: string, sectionId: string, data: Record<string, unknown>) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/sections/${sectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (projectId: string, sectionId: string) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/sections/${sectionId}`, {
        method: "DELETE",
      }),
  },

  tasks: {
    create: (data: { title: string; sectionId: string; priority?: string; dueDate?: string; parentId?: string }) =>
      fetchJson<unknown>(`${API_BASE}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    get: (id: string) => fetchJson<unknown>(`${API_BASE}/tasks/${id}`),
    update: (id: string, data: Record<string, unknown>) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${id}`, { method: "DELETE" }),
  },

  subtasks: {
    create: (taskId: string, data: { title: string }) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/subtasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    update: (taskId: string, subtaskId: string, data: Record<string, unknown>) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (taskId: string, subtaskId: string) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/subtasks/${subtaskId}`, {
        method: "DELETE",
      }),
  },

  tags: {
    list: () => fetchJson<unknown[]>(`${API_BASE}/tags`),
    create: (data: { name: string; color?: string }) =>
      fetchJson<unknown>(`${API_BASE}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    addToTask: (taskId: string, tagId: string) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagId }),
      }),
    removeFromTask: (taskId: string, tagId: string) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/tags?tagId=${tagId}`, {
        method: "DELETE",
      }),
  },

  comments: {
    create: (taskId: string, data: { content: string }) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    update: (taskId: string, commentId: string, data: { content: string }) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (taskId: string, commentId: string) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/comments/${commentId}`, {
        method: "DELETE",
      }),
  },

  attachments: {
    upload: (taskId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/attachments`, {
        method: "POST",
        body: formData,
      });
    },
    addLink: (taskId: string, data: { name: string; url: string }) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (taskId: string, attachmentId: string) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/attachments/${attachmentId}`, {
        method: "DELETE",
      }),
  },

  projectLinks: {
    create: (projectId: string, data: { name: string; url: string }) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    update: (projectId: string, linkId: string, data: Record<string, unknown>) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/links/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (projectId: string, linkId: string) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/links/${linkId}`, {
        method: "DELETE",
      }),
  },

  projectAttachments: {
    list: (projectId: string) =>
      fetchJson<unknown[]>(`${API_BASE}/projects/${projectId}/attachments`),
    upload: (projectId: string, file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return fetchJson<unknown>(`${API_BASE}/projects/${projectId}/attachments`, {
        method: "POST",
        body: formData,
      });
    },
    delete: (projectId: string, attachmentId: string) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/attachments/${attachmentId}`, {
        method: "DELETE",
      }),
  },

  reorder: (items: { id: string; order: number; sectionId?: string; columnId?: string }[], type: string) =>
    fetchJson<unknown>(`${API_BASE}/reorder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, type }),
    }),

  search: (q: string) => fetchJson<unknown[]>(`${API_BASE}/search?q=${encodeURIComponent(q)}`),

  requesters: () => fetchJson<string[]>(`${API_BASE}/requesters`),

  assignees: {
    list: () => fetchJson<string[]>(`${API_BASE}/assignees`),
    addToTask: (taskId: string, name: string) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/assignees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    removeFromTask: (taskId: string, assigneeId: string) =>
      fetchJson<unknown>(`${API_BASE}/tasks/${taskId}/assignees?assigneeId=${assigneeId}`, {
        method: "DELETE",
      }),
  },

  boardColumns: {
    list: (projectId: string) =>
      fetchJson<unknown[]>(`${API_BASE}/projects/${projectId}/columns`),
    create: (projectId: string, data: { name: string }) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    update: (projectId: string, columnId: string, data: Record<string, unknown>) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/columns/${columnId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (projectId: string, columnId: string) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/columns/${columnId}`, {
        method: "DELETE",
      }),
  },

  sprints: {
    list: (projectId: string) =>
      fetchJson<unknown[]>(`${API_BASE}/projects/${projectId}/sprints`),
    get: (projectId: string, sprintId: string) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/sprints/${sprintId}`),
    create: (projectId: string) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/sprints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    update: (projectId: string, sprintId: string, data: Record<string, unknown>) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/sprints/${sprintId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (projectId: string, sprintId: string) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/sprints/${sprintId}`, {
        method: "DELETE",
      }),
    close: (projectId: string, sprintId: string) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/sprints/${sprintId}/close`, {
        method: "POST",
      }),
    addTasks: (projectId: string, sprintId: string, taskIds: string[], columnId?: string) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/sprints/${sprintId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds, columnId }),
      }),
    removeTask: (projectId: string, sprintId: string, taskId: string) =>
      fetchJson<unknown>(`${API_BASE}/projects/${projectId}/sprints/${sprintId}/tasks?taskId=${taskId}`, {
        method: "DELETE",
      }),
  },

  teamMembers: {
    list: () => fetchJson<unknown[]>(`${API_BASE}/team-members`),
    create: (data?: Record<string, string>) =>
      fetchJson<unknown>(`${API_BASE}/team-members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data || {}),
      }),
    update: (id: string, data: Record<string, unknown>) =>
      fetchJson<unknown>(`${API_BASE}/team-members/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      fetchJson<unknown>(`${API_BASE}/team-members/${id}`, { method: "DELETE" }),
  },

  trello: {
    status: () => fetchJson<{ configured: boolean }>(`${API_BASE}/trello/poll`),
    enableSync: (sprintId: string) =>
      fetchJson<{ success: boolean; boardId: string }>(`${API_BASE}/trello/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId }),
      }),
    disableSync: (sprintId: string) =>
      fetchJson<{ success: boolean }>(`${API_BASE}/trello/sync`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId }),
      }),
    poll: (sprintId: string) =>
      fetchJson<{
        configured: boolean;
        authError?: boolean;
        changes: Array<{
          type: "rename" | "move" | "complete" | "reopen";
          taskId: string;
          taskTitle?: string;
          newTitle?: string;
          newColumnId?: string;
          newColumnName?: string;
        }>;
      }>(`${API_BASE}/trello/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprintId }),
      }),
  },
};
