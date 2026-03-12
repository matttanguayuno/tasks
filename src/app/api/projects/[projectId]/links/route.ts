import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const links = await prisma.projectLink.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
  });
  return NextResponse.json(links);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = await request.json();
  const maxOrder = await prisma.projectLink.aggregate({
    where: { projectId },
    _max: { order: true },
  });
  const link = await prisma.projectLink.create({
    data: {
      name: body.name,
      url: body.url,
      order: (maxOrder._max.order ?? -1) + 1,
      projectId,
    },
  });
  return NextResponse.json(link, { status: 201 });
}
