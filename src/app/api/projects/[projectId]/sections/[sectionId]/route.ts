import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; sectionId: string }> }
) {
  const { sectionId } = await params;
  const body = await request.json();
  const section = await prisma.section.update({
    where: { id: sectionId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.order !== undefined && { order: body.order }),
    },
  });
  return NextResponse.json(section);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; sectionId: string }> }
) {
  const { sectionId } = await params;
  await prisma.section.delete({ where: { id: sectionId } });
  return NextResponse.json({ success: true });
}
