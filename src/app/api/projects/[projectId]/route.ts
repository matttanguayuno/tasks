import { prisma } from "@/lib/prisma";
import { taskListInclude } from "@/lib/prisma-includes";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          tasks: {
            where: { parentId: null },
            orderBy: { order: "asc" },
            include: taskListInclude as Record<string, unknown>,
          },
        },
      },
      links: {
        orderBy: { order: "asc" },
      },
      attachments: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = await request.json();
  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.icon !== undefined && { icon: body.icon }),
      ...(body.order !== undefined && { order: body.order }),
      ...(body.sprintDuration !== undefined && { sprintDuration: body.sprintDuration }),
      ...(body.sprintStartDay !== undefined && { sprintStartDay: body.sprintStartDay }),
      ...(body.sprintStartDate !== undefined && { sprintStartDate: body.sprintStartDate ? new Date(body.sprintStartDate + "T12:00:00") : null }),
      ...(body.archived !== undefined && { archived: body.archived }),
    },
  });

  // Recalculate sprint dates when start day, duration, or start date changes
  if (body.sprintStartDay !== undefined || body.sprintDuration !== undefined || body.sprintStartDate !== undefined) {
    // Re-fetch project to get latest sprintStartDate
    const updatedProject = await prisma.project.findUnique({ where: { id: projectId } });
    const sprints = await prisma.sprint.findMany({
      where: { projectId },
      orderBy: { number: "asc" },
    });

    if (sprints.length > 0 && updatedProject) {
      const duration = updatedProject.sprintDuration;

      // Use sprintStartDate as anchor for Sprint 1 if set
      let sprint1Start: Date;
      if (updatedProject.sprintStartDate) {
        sprint1Start = new Date(updatedProject.sprintStartDate);
      } else {
        // Fallback: anchor off current date
        const startDay = updatedProject.sprintStartDay;
        const now = new Date();
        const currentDay = now.getDay() === 0 ? 7 : now.getDay();
        const daysToSubtract = (currentDay - startDay + 7) % 7;
        sprint1Start = new Date(now);
        sprint1Start.setDate(now.getDate() - daysToSubtract);
      }
      sprint1Start.setHours(0, 0, 0, 0);

      let currentStart = new Date(sprint1Start);
      for (const sprint of sprints) {
        const endDate = new Date(currentStart);
        endDate.setDate(currentStart.getDate() + duration - 1);
        endDate.setHours(23, 59, 59, 999);

        await prisma.sprint.update({
          where: { id: sprint.id },
          data: { startDate: currentStart, endDate },
        });

        // Next sprint starts the day after this one ends
        currentStart = new Date(endDate);
        currentStart.setDate(currentStart.getDate() + 1);
        currentStart.setHours(0, 0, 0, 0);
      }
    }
  }

  return NextResponse.json(project);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  await prisma.project.delete({ where: { id: projectId } });
  return NextResponse.json({ success: true });
}
