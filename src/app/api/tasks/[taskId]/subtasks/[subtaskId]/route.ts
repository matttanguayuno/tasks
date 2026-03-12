import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string; subtaskId: string }> }
) {
  const { subtaskId } = await params;
  const body = await request.json();
  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.completed !== undefined) {
    data.completed = body.completed;
    data.completedAt = body.completed ? new Date() : null;
  }
  if (body.order !== undefined) data.order = body.order;

  const subtask = await prisma.task.update({
    where: { id: subtaskId },
    data,
  });
  return NextResponse.json(subtask);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; subtaskId: string }> }
) {
  const { subtaskId } = await params;
  await prisma.task.delete({ where: { id: subtaskId } });
  return NextResponse.json({ success: true });
}
