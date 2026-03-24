import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("archived") === "true";

  const user = await getCurrentUser();
  const where: Record<string, unknown> = includeArchived ? { archived: true } : { archived: false };

  // Scope viewers to their assigned project
  if (user?.role === "VIEWER" && user.projectId) {
    where.id = user.projectId;
  }

  const projects = await prisma.project.findMany({
    where,
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
