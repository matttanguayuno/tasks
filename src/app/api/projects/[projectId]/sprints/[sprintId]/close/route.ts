import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { closeTrelloBoard, syncAllCards, trelloSync } from "@/lib/trello";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { projectId, sprintId } = await params;

  // Get the sprint being closed
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
    include: {
      sprintTasks: {
        include: { task: true },
      },
    },
  });

  // Find incomplete tasks in this sprint
  const incompleteTasks = sprint.sprintTasks.filter((st) => !st.task.completed);

  if (incompleteTasks.length > 0) {
    // Find or create the next sprint
    let nextSprint = await prisma.sprint.findFirst({
      where: {
        projectId,
        number: sprint.number + 1,
      },
    });

    if (!nextSprint) {
      // Auto-create next sprint
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
      });

      const nextStartDate = new Date(sprint.endDate);
      nextStartDate.setDate(nextStartDate.getDate() + 1);
      nextStartDate.setHours(0, 0, 0, 0);

      const nextEndDate = new Date(nextStartDate);
      nextEndDate.setDate(nextStartDate.getDate() + project.sprintDuration - 1);
      nextEndDate.setHours(23, 59, 59, 999);

      nextSprint = await prisma.sprint.create({
        data: {
          number: sprint.number + 1,
          startDate: nextStartDate,
          endDate: nextEndDate,
          projectId,
        },
      });
    }

    // Move incomplete tasks to the next sprint, keeping their column
    for (const st of incompleteTasks) {
      // Remove from current sprint
      await prisma.sprintTask.delete({ where: { id: st.id } });

      // Add to next sprint (check it doesn't already exist)
      const existingInNext = await prisma.sprintTask.findUnique({
        where: { sprintId_taskId: { sprintId: nextSprint.id, taskId: st.taskId } },
      });

      if (!existingInNext) {
        await prisma.sprintTask.create({
          data: {
            sprintId: nextSprint.id,
            taskId: st.taskId,
            columnId: st.columnId,
            order: st.order,
          },
        });
      }
    }
  }

  // Mark sprint as closed
  const closedSprint = await prisma.sprint.update({
    where: { id: sprintId },
    data: { status: "CLOSED" },
  });

  if (sprint.trelloBoardId) {
    after(trelloSync(async () => {
      await closeTrelloBoard(sprintId);
      // Sync cards on the new sprint if tasks were carried over
      const nextSprint = await prisma.sprint.findFirst({
        where: { projectId, number: sprint.number + 1 },
      });
      if (nextSprint?.trelloBoardId) await syncAllCards(nextSprint.id);
    }));
  }

  return NextResponse.json(closedSprint);
}
