import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/** DELETE /api/tasks/[taskId]/links/[linkId] — Remove a task link */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; linkId: string }> }
) {
  const { linkId } = await params;

  await prisma.taskLink.delete({ where: { id: linkId } });

  return NextResponse.json({ success: true });
}
