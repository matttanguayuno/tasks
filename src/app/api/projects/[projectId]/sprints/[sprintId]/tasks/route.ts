import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { syncCard, archiveCard, trelloSync } from "@/lib/trello";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { projectId, sprintId } = await params;
  const body = await request.json();
  const taskIds: string[] = Array.isArray(body.taskIds) ? body.taskIds : [body.taskId];

  // Get the first column (default column for new tasks)
  const firstColumn = await prisma.boardColumn.findFirst({
    where: { projectId },
    orderBy: { order: "asc" },
  });

  if (!firstColumn) {
    return NextResponse.json({ error: "No board columns configured" }, { status: 400 });
  }

  // Get current max order in the first column for this sprint
  const maxOrder = await prisma.sprintTask.aggregate({
    where: { sprintId, columnId: firstColumn.id },
    _max: { order: true },
  });

  let nextOrder = (maxOrder._max.order ?? -1) + 1;

  const created: { id: string }[] = [];
  for (const taskId of taskIds) {
    // Check if task is already in this sprint
    const existing = await prisma.sprintTask.findUnique({
      where: { sprintId_taskId: { sprintId, taskId } },
    });
    if (existing) continue;

    const sprintTask = await prisma.sprintTask.create({
      data: {
        sprintId,
        taskId,
        columnId: body.columnId || firstColumn.id,
        order: nextOrder++,
      },
    });
    created.push(sprintTask);
  }

  // Only sync to Trello if this sprint has Trello enabled
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (sprint?.trelloBoardId) {
    after(trelloSync(async () => {
      for (const st of created) await syncCard(st.id);
    }));
  }

  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { sprintId } = await params;
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return NextResponse.json({ error: "taskId required" }, { status: 400 });
  }

  // Find sprint task(s) before deleting (to get trello card IDs)
  const sprintTasks = await prisma.sprintTask.findMany({
    where: { sprintId, taskId },
  });

  await prisma.sprintTask.deleteMany({
    where: { sprintId, taskId },
  });

  // Archive Trello cards synchronously so removal is reliable
  for (const st of sprintTasks) {
    if (st.trelloCardId) await archiveCard(st.trelloCardId);
  }

  return NextResponse.json({ success: true });
}
