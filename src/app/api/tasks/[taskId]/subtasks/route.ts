import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = await request.json();

  // Get parent task's sectionId
  const parent = await prisma.task.findUnique({ where: { id: taskId }, select: { sectionId: true } });
  if (!parent) {
    return NextResponse.json({ error: "Parent task not found" }, { status: 404 });
  }

  const maxOrder = await prisma.task.aggregate({
    where: { parentId: taskId },
    _max: { order: true },
  });
  const subtask = await prisma.task.create({
    data: {
      title: body.title,
      order: (maxOrder._max.order ?? -1) + 1,
      parentId: taskId,
      sectionId: parent.sectionId,
    },
    include: {
      _count: { select: { comments: true, attachments: true, subtasks: true } },
    },
  });
  return NextResponse.json(subtask, { status: 201 });
}
