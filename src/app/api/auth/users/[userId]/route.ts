import { prisma } from "@/lib/prisma";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await params;
  const body = await request.json();

  const data: Record<string, unknown> = {};
  if (body.role !== undefined) data.role = body.role;
  if (body.projectId !== undefined) data.projectId = body.projectId || null;
  if (body.password) data.password = await hashPassword(body.password);

  const user = await prisma.appUser.update({
    where: { id: userId },
    data,
    select: { id: true, username: true, role: true, projectId: true, createdAt: true },
  });

  return NextResponse.json(user);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const currentUser = await getCurrentUser();
  if (!currentUser || currentUser.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { userId } = await params;

  // Prevent deleting yourself
  if (userId === currentUser.id) {
    return NextResponse.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  await prisma.session.deleteMany({ where: { userId } });
  await prisma.appUser.delete({ where: { id: userId } });

  return NextResponse.json({ success: true });
}
