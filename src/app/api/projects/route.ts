import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { sections: true } } },
  });
  return NextResponse.json(projects);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const maxOrder = await prisma.project.aggregate({ _max: { order: true } });
  const project = await prisma.project.create({
    data: {
      name: body.name,
      color: body.color || "#6366f1",
      icon: body.icon || "folder",
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });
  return NextResponse.json(project, { status: 201 });
}
