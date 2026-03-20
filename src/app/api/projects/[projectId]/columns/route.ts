import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const columns = await prisma.boardColumn.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(columns);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = await request.json();

  const maxOrder = await prisma.boardColumn.aggregate({
    where: { projectId },
    _max: { order: true },
  });

  const column = await prisma.boardColumn.create({
    data: {
      name: body.name,
      order: (maxOrder._max.order ?? -1) + 1,
      projectId,
    },
  });

  return NextResponse.json(column, { status: 201 });
}
