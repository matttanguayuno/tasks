import { prisma } from "@/lib/prisma";
import { taskListInclude } from "@/lib/prisma-includes";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const orderWhere = body.parentId
    ? { parentId: body.parentId }
    : { sectionId: body.sectionId, parentId: null };
  const maxOrder = await prisma.task.aggregate({
    where: orderWhere,
    _max: { order: true },
  });
  const task = await prisma.task.create({
    data: {
      title: body.title,
      description: body.description || "",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      priority: body.priority ?? null,
      requestedBy: body.requestedBy || null,
      order: (maxOrder._max.order ?? -1) + 1,
      sectionId: body.sectionId,
      parentId: body.parentId || null,
    },
    include: taskListInclude as Record<string, unknown>,
  });
  return NextResponse.json(task, { status: 201 });
}
