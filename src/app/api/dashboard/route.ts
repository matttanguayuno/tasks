import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 3); // within 3 days

  const [urgentTasks, projects] = await Promise.all([
    prisma.task.findMany({
      where: {
        completed: false,
        OR: [
          { priority: "HIGH" },
          { dueDate: { lte: soon } },
        ],
      },
      include: {
        section: {
          include: { project: { select: { id: true, name: true, color: true } } },
        },
        parent: {
          select: {
            id: true,
            title: true,
            priority: true,
            dueDate: true,
            completed: true,
            section: {
              include: { project: { select: { id: true, name: true, color: true } } },
            },
          },
        },
        subtasks: true,
        tags: { include: { tag: true } },
        _count: { select: { comments: true, attachments: true, subtasks: true } },
      },
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
      take: 30,
    }),
    prisma.project.findMany({
      orderBy: { order: "asc" },
      include: {
        sections: {
          include: {
            tasks: {
              select: { id: true, completed: true, subtasks: { select: { id: true, completed: true } } },
            },
          },
        },
      },
    }),
  ]);

  // Summarise project stats
  const projectCards = projects.map((p) => {
    let totalTasks = 0;
    let completedTasks = 0;
    for (const s of p.sections) {
      for (const t of s.tasks) {
        totalTasks++;
        if (t.completed) completedTasks++;
        for (const st of t.subtasks) {
          totalTasks++;
          if (st.completed) completedTasks++;
        }
      }
    }
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      icon: p.icon,
      totalTasks,
      completedTasks,
      openTasks: totalTasks - completedTasks,
    };
  });

  return NextResponse.json({ urgentTasks, projectCards });
}
