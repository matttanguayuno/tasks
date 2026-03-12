import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string; commentId: string }> }
) {
  const { commentId } = await params;
  const body = await request.json();
  const comment = await prisma.comment.update({
    where: { id: commentId },
    data: { content: body.content },
  });
  return NextResponse.json(comment);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; commentId: string }> }
) {
  const { commentId } = await params;
  await prisma.comment.delete({ where: { id: commentId } });
  return NextResponse.json({ success: true });
}
