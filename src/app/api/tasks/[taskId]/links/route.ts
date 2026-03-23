import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/** GET /api/tasks/[taskId]/links — Get all linked tasks (both directions) */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;

    const [linksFrom, linksTo] = await Promise.all([
      prisma.taskLink.findMany({
        where: { fromTaskId: taskId },
        include: { toTask: { select: { id: true, title: true, completed: true, parentId: true } } },
      }),
      prisma.taskLink.findMany({
        where: { toTaskId: taskId },
        include: { fromTask: { select: { id: true, title: true, completed: true, parentId: true } } },
      }),
    ]);

    const links = [
      ...linksFrom.map((l) => ({
        id: l.id,
        linkType: l.linkType,
        direction: "outgoing" as const,
        task: l.toTask,
        createdAt: l.createdAt,
      })),
      ...linksTo.map((l) => ({
        id: l.id,
        linkType: l.linkType,
        direction: "incoming" as const,
        task: l.fromTask,
        createdAt: l.createdAt,
      })),
    ];

    return NextResponse.json(links);
  } catch (error) {
    console.error("GET /api/tasks/[taskId]/links error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

/** POST /api/tasks/[taskId]/links — Create a link to another task */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;
    const { targetTaskId, linkType = "RELATED" } = await request.json();

    if (!targetTaskId) {
      return NextResponse.json({ error: "targetTaskId required" }, { status: 400 });
    }
    if (targetTaskId === taskId) {
      return NextResponse.json({ error: "Cannot link a task to itself" }, { status: 400 });
    }

    // Check for existing link in either direction
    const existing = await prisma.taskLink.findFirst({
      where: {
        OR: [
          { fromTaskId: taskId, toTaskId: targetTaskId },
          { fromTaskId: targetTaskId, toTaskId: taskId },
        ],
      },
    });
    if (existing) {
      return NextResponse.json({ error: "Link already exists" }, { status: 409 });
    }

    const link = await prisma.taskLink.create({
      data: {
        fromTaskId: taskId,
        toTaskId: targetTaskId,
        linkType,
      },
      include: {
        toTask: { select: { id: true, title: true, completed: true, parentId: true } },
      },
    });

    return NextResponse.json(link);
  } catch (error) {
    console.error("POST /api/tasks/[taskId]/links error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
