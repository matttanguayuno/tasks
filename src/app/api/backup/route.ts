import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { order: "asc" },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          tasks: {
            orderBy: { order: "asc" },
            include: {
              subtasks: { orderBy: { order: "asc" } },
              tags: { include: { tag: true } },
              comments: { orderBy: { createdAt: "asc" } },
              attachments: true,
            },
          },
        },
      },
    },
  });

  const tags = await prisma.tag.findMany();

  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tags,
    projects,
  };

  const json = JSON.stringify(backup, null, 2);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  return new NextResponse(json, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="tasks-backup-${timestamp}.json"`,
    },
  });
}

export async function POST(request: NextRequest) {
  const backup = await request.json();

  if (!backup || backup.version !== 1 || !Array.isArray(backup.projects)) {
    return NextResponse.json({ error: "Invalid backup format" }, { status: 400 });
  }

  // Delete all existing data (cascades handle related records)
  await prisma.project.deleteMany();
  await prisma.tag.deleteMany();

  // Restore tags
  if (Array.isArray(backup.tags)) {
    for (const tag of backup.tags) {
      await prisma.tag.create({
        data: { id: tag.id, name: tag.name, color: tag.color },
      });
    }
  }

  // Restore projects, sections, tasks, comments, attachments, and tag links
  for (const project of backup.projects) {
    await prisma.project.create({
      data: {
        id: project.id,
        name: project.name,
        color: project.color,
        icon: project.icon,
        order: project.order,
        createdAt: new Date(project.createdAt),
        updatedAt: new Date(project.updatedAt),
      },
    });

    for (const section of project.sections ?? []) {
      await prisma.section.create({
        data: {
          id: section.id,
          name: section.name,
          order: section.order,
          projectId: project.id,
          createdAt: new Date(section.createdAt),
          updatedAt: new Date(section.updatedAt),
        },
      });

      // First pass: create top-level tasks (no parentId)
      const topTasks = (section.tasks ?? []).filter((t: { parentId: string | null }) => !t.parentId);
      for (const task of topTasks) {
        await createTask(task);
      }

      // Second pass: create subtasks (have parentId)
      const subTasks = (section.tasks ?? []).filter((t: { parentId: string | null }) => t.parentId);
      for (const task of subTasks) {
        // Only create if not already created as a nested subtask
        const exists = await prisma.task.findUnique({ where: { id: task.id } });
        if (!exists) {
          await createTask(task);
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createTask(task: any) {
  await prisma.task.create({
    data: {
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      dueDate: task.dueDate ? new Date(task.dueDate) : null,
      priority: task.priority,
      requestedBy: task.requestedBy || null,
      order: task.order,
      completed: task.completed ?? false,
      completedAt: task.completedAt ? new Date(task.completedAt) : null,
      inProgress: task.inProgress ?? false,
      hyperlink: task.hyperlink ?? null,
      sectionId: task.sectionId,
      parentId: task.parentId ?? null,
      createdAt: new Date(task.createdAt),
      updatedAt: new Date(task.updatedAt),
    },
  });

  // Restore subtasks recursively
  for (const sub of task.subtasks ?? []) {
    const exists = await prisma.task.findUnique({ where: { id: sub.id } });
    if (!exists) {
      await createTask({ ...sub, sectionId: task.sectionId });
    }
  }

  // Restore comments
  for (const comment of task.comments ?? []) {
    await prisma.comment.create({
      data: {
        id: comment.id,
        content: comment.content,
        taskId: task.id,
        createdAt: new Date(comment.createdAt),
        updatedAt: new Date(comment.updatedAt),
      },
    });
  }

  // Restore attachments
  for (const att of task.attachments ?? []) {
    await prisma.attachment.create({
      data: {
        id: att.id,
        filename: att.filename,
        url: att.url,
        size: att.size,
        mimeType: att.mimeType,
        taskId: task.id,
        createdAt: new Date(att.createdAt),
      },
    });
  }

  // Restore tag links
  for (const taskTag of task.tags ?? []) {
    const tagId = taskTag.tagId ?? taskTag.tag?.id;
    if (tagId) {
      await prisma.taskTag.create({
        data: { taskId: task.id, tagId },
      }).catch(() => { /* tag may not exist */ });
    }
  }
}
