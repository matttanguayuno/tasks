import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params;
  const body = await request.json();
  const member = await prisma.teamMember.update({
    where: { id: memberId },
    data: body,
  });
  return NextResponse.json(member);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params;
  await prisma.teamMember.delete({ where: { id: memberId } });
  return NextResponse.json({ success: true });
}
