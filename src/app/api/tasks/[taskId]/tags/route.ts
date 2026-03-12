import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const body = await request.json();
  await prisma.taskTag.create({
    data: { taskId, tagId: body.tagId },
  });
  const tags = await prisma.taskTag.findMany({
    where: { taskId },
    include: { tag: true },
  });
  return NextResponse.json(tags, { status: 201 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const { searchParams } = new URL(request.url);
  const tagId = searchParams.get("tagId");
  if (!tagId) {
    return NextResponse.json({ error: "tagId required" }, { status: 400 });
  }
  await prisma.taskTag.delete({
    where: { taskId_tagId: { taskId, tagId } },
  });
  return NextResponse.json({ success: true });
}
