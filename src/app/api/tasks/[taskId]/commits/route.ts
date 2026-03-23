import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/** GET /api/tasks/[taskId]/commits — Get all GitHub commits linked to a task */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;

  const commits = await prisma.taskCommit.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(commits);
}
