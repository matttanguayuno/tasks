import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { syncCommentToCards, deleteCommentFromCards, fireAndForget } from "@/lib/trello";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string; commentId: string }> }
) {
  const { taskId, commentId } = await params;
  const body = await request.json();
  const comment = await prisma.comment.update({
    where: { id: commentId },
    data: { content: body.content },
  });

  fireAndForget(() => syncCommentToCards(taskId, commentId, body.content));

  return NextResponse.json(comment);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; commentId: string }> }
) {
  const { taskId, commentId } = await params;
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (comment?.trelloCommentId) {
    fireAndForget(() => deleteCommentFromCards(taskId, comment.trelloCommentId!));
  }
  await prisma.comment.delete({ where: { id: commentId } });
  return NextResponse.json({ success: true });
}
