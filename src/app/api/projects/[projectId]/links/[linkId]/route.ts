import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; linkId: string }> }
) {
  const { linkId } = await params;
  const body = await request.json();
  const link = await prisma.projectLink.update({
    where: { id: linkId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.url !== undefined && { url: body.url }),
      ...(body.order !== undefined && { order: body.order }),
    },
  });
  return NextResponse.json(link);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; linkId: string }> }
) {
  const { linkId } = await params;
  await prisma.projectLink.delete({ where: { id: linkId } });
  return NextResponse.json({ success: true });
}
