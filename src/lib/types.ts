import type { Attachment, Comment, Tag } from "@/generated/prisma/client";

export interface TaskTag {
  taskId: string;
  tagId: string;
  tag: Tag;
}

export interface TaskAssignee {
  id: string;
  name: string;
  taskId: string;
  createdAt: string;
}

export interface TaskWithRelations {
  id: string;
  title: string;
  description: string;
  dueDate: string | null;
  priority: string;
  requestedBy: string | null;
  order: number;
  completed: boolean;
  completedAt: string | null;
  inProgress: boolean;
  hyperlink: string | null;
  createdAt: string;
  updatedAt: string;
  sectionId: string;
  parentId: string | null;
  subtasks: TaskWithRelations[];
  tags: TaskTag[];
  comments?: Comment[];
  attachments?: Attachment[];
  assignees: TaskAssignee[];
  sprintTasks?: { sprint: { number: number; status: string } }[];
  _count: { comments: number; attachments: number; subtasks: number };
}

export interface SectionWithTasks {
  id: string;
  name: string;
  notes: string;
  order: number;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  tasks: TaskWithRelations[];
}

export interface ProjectLink {
  id: string;
  name: string;
  url: string;
  order: number;
  projectId: string;
  createdAt: string;
}

export interface ProjectWithSections {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  order: number;
  sprintDuration: number;
  sprintStartDay: number;
  createdAt: string;
  updatedAt: string;
  sections: SectionWithTasks[];
  links: ProjectLink[];
  attachments: ProjectAttachment[];
}

export interface ProjectAttachment {
  id: string;
  filename: string;
  url: string;
  size: number;
  mimeType: string;
  createdAt: string;
  projectId: string;
}

export interface ProjectSummary {
  id: string;
  name: string;
  color: string;
  icon: string;
  order: number;
  archived: boolean;
  _count: { sections: number };
}

export interface BoardColumn {
  id: string;
  name: string;
  order: number;
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sprint {
  id: string;
  number: number;
  startDate: string;
  endDate: string;
  status: string;
  projectId: string;
  trelloBoardId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SprintTask {
  id: string;
  order: number;
  sprintId: string;
  taskId: string;
  columnId: string;
  createdAt: string;
  task: TaskWithRelations;
  column: BoardColumn;
}

export interface SprintWithTasks extends Sprint {
  sprintTasks: SprintTask[];
}
