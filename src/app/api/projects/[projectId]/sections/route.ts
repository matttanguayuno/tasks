import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const sections = await prisma.section.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: { _count: { select: { tasks: true } } },
  });
  return NextResponse.json(sections);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = await request.json();
  const maxOrder = await prisma.section.aggregate({
    where: { projectId },
    _max: { order: true },
  });
  const section = await prisma.section.create({
    data: {
      name: body.name,
      order: (maxOrder._max.order ?? -1) + 1,
      projectId,
    },
  });
  return NextResponse.json(section, { status: 201 });
}
