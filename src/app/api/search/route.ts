import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json([]);
  }

  const tasks = await prisma.task.findMany({
    where: {
      OR: [
        { title: { contains: q } },
        { description: { contains: q } },
      ],
    },
    include: {
      section: {
        include: { project: { select: { id: true, name: true } } },
      },
      tags: { include: { tag: true } },
    },
    take: 20,
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(tasks);
}
