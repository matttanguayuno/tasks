import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/** GET /api/tasks/[taskId]/sprint-history — Get sprint movement history for a task */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  const history = await prisma.taskSprintHistory.findMany({
    where: { taskId },
    orderBy: { movedAt: "asc" },
  });

  const result = await Promise.all(
    history.map(async (h) => {
      const fromSprint = h.fromSprintId
        ? await prisma.sprint.findUnique({ where: { id: h.fromSprintId }, select: { number: true } })
        : null;
      const toSprint = await prisma.sprint.findUnique({ where: { id: h.toSprintId }, select: { number: true } });
      return {
        fromSprint: fromSprint?.number ?? null,
        toSprint: toSprint?.number ?? 0,
        movedAt: h.movedAt.toISOString(),
      };
    })
  );

  return NextResponse.json(result);
}
