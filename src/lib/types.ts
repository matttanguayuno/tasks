import type { Attachment, Comment, Tag } from "@/generated/prisma/client";

export interface TaskTag {
  taskId: string;
  tagId: string;
  tag: Tag;
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
  _count: { comments: number; attachments: number; subtasks: number };
}

export interface SectionWithTasks {
  id: string;
  name: string;
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
  createdAt: string;
  updatedAt: string;
  sections: SectionWithTasks[];
  links: ProjectLink[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  color: string;
  icon: string;
  order: number;
  _count: { sections: number };
}
