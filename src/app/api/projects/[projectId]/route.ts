import { prisma } from "@/lib/prisma";
import { taskListInclude } from "@/lib/prisma-includes";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      sections: {
        orderBy: { order: "asc" },
        include: {
          tasks: {
            where: { parentId: null },
            orderBy: { order: "asc" },
            include: taskListInclude as Record<string, unknown>,
          },
        },
      },
      links: {
        orderBy: { order: "asc" },
      },
    },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const body = await request.json();
  const project = await prisma.project.update({
    where: { id: projectId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.icon !== undefined && { icon: body.icon }),
      ...(body.order !== undefined && { order: body.order }),
    },
  });
  return NextResponse.json(project);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  await prisma.project.delete({ where: { id: projectId } });
  return NextResponse.json({ success: true });
}
