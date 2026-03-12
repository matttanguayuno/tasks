import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(request: NextRequest) {
  const { name } = await request.json();
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Missing name" }, { status: 400 });
  }
  await prisma.task.updateMany({
    where: { requestedBy: name },
    data: { requestedBy: null },
  });
  return NextResponse.json({ success: true });
}
