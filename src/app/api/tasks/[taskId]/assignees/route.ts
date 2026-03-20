import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { syncAssigneesToCard, trelloSync } from "@/lib/trello";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const assignees = await prisma.taskAssignee.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(assignees);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = await request.json();

  const assignee = await prisma.taskAssignee.create({
    data: {
      name: body.name,
      taskId,
    },
  });

  after(trelloSync(() => syncAssigneesToCard(taskId)));

  return NextResponse.json(assignee, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const { searchParams } = new URL(request.url);
  const assigneeId = searchParams.get("assigneeId");

  try {
    if (assigneeId) {
      await prisma.taskAssignee.delete({ where: { id: assigneeId } });
    } else {
      // Delete all assignees for this task
      await prisma.taskAssignee.deleteMany({ where: { taskId } });
    }
  } catch {
    return NextResponse.json({ error: "Assignee not found" }, { status: 404 });
  }

  after(trelloSync(() => syncAssigneesToCard(taskId)));

  return NextResponse.json({ success: true });
}
