import { prisma } from "@/lib/prisma";
import { taskListInclude } from "@/lib/prisma-includes";
import { NextRequest, NextResponse } from "next/server";
import { syncTaskToCards, fireAndForget } from "@/lib/trello";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      ...(taskListInclude as Record<string, unknown>),
      comments: { orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json(task);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.description !== undefined) data.description = body.description;
  if (body.dueDate !== undefined) {
    // Store as noon UTC so it displays the correct calendar day in any timezone
    if (body.dueDate) {
      const dateStr = typeof body.dueDate === "string" && body.dueDate.length === 10
        ? body.dueDate  // "YYYY-MM-DD"
        : new Date(body.dueDate).toISOString().slice(0, 10);
      data.dueDate = new Date(`${dateStr}T12:00:00.000Z`);
    } else {
      data.dueDate = null;
    }
  }
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.requestedBy !== undefined) data.requestedBy = body.requestedBy || null;
  if (body.order !== undefined) data.order = body.order;
  if (body.sectionId !== undefined) data.sectionId = body.sectionId;
  if (body.completed !== undefined) {
    data.completed = body.completed;
    data.completedAt = body.completed ? new Date() : null;
    if (body.completed) data.inProgress = false;
  }
  if (body.inProgress !== undefined) data.inProgress = body.inProgress;
  if (body.hyperlink !== undefined) data.hyperlink = body.hyperlink;
  if (body.parentId !== undefined) data.parentId = body.parentId || null;

  try {
    const task = await prisma.task.update({
      where: { id: taskId },
      data,
      include: taskListInclude as Record<string, unknown>,
    });

    fireAndForget(() => syncTaskToCards(taskId));

    return NextResponse.json(task);
  } catch (err) {
    console.error("PATCH /api/tasks/[taskId] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  try {
    await prisma.task.delete({ where: { id: taskId } });
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
