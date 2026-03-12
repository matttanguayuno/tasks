import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  const { tagId } = await params;
  const body = await request.json();
  const tag = await prisma.tag.update({
    where: { id: tagId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.color !== undefined && { color: body.color }),
    },
  });
  return NextResponse.json(tag);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  const { tagId } = await params;
  await prisma.tag.delete({ where: { id: tagId } });
  return NextResponse.json({ success: true });
}
