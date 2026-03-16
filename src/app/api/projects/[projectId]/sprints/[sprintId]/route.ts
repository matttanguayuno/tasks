import { prisma } from "@/lib/prisma";
import { taskListInclude } from "@/lib/prisma-includes";
import { NextRequest, NextResponse } from "next/server";
import { deleteTrelloBoard, fireAndForget } from "@/lib/trello";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { sprintId } = await params;

  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
    include: {
      sprintTasks: {
        include: {
          task: { include: taskListInclude },
          column: true,
        },
        orderBy: { order: "asc" },
      },
    },
  });

  return NextResponse.json(sprint);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { sprintId } = await params;
  const body = await request.json();

  const sprint = await prisma.sprint.update({
    where: { id: sprintId },
    data: {
      ...(body.status !== undefined && { status: body.status }),
    },
  });

  return NextResponse.json(sprint);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { sprintId } = await params;
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  await prisma.sprint.delete({ where: { id: sprintId } });
  if (sprint?.trelloBoardId) {
    fireAndForget(() => deleteTrelloBoard(sprint.trelloBoardId!));
  }
  return NextResponse.json({ success: true });
}
