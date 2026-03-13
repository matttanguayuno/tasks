import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  // body: { items: [{ id, order }], type: "task" | "section" | "project" }
  const { items, type } = body;

  if (!Array.isArray(items) || !type) {
    return NextResponse.json({ error: "items array and type required" }, { status: 400 });
  }

  const model = type === "task" ? prisma.task :
                type === "section" ? prisma.section :
                type === "project" ? prisma.project :
                type === "projectLink" ? prisma.projectLink : null;

  if (!model) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const updates = items.map((item: { id: string; order: number; sectionId?: string }) => {
    const data: Record<string, unknown> = { order: item.order };
    // Allow moving tasks between sections
    if (type === "task" && item.sectionId) {
      data.sectionId = item.sectionId;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (model as any).update({ where: { id: item.id }, data });
  });

  await prisma.$transaction(updates);
  return NextResponse.json({ success: true });
}
