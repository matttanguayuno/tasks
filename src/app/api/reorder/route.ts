import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { syncReorderedCards, trelloSync } from "@/lib/trello";

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
                type === "projectLink" ? prisma.projectLink :
                type === "sprintTask" ? prisma.sprintTask :
                type === "boardColumn" ? prisma.boardColumn : null;

  if (!model) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const updates = items.map((item: { id: string; order: number; sectionId?: string; columnId?: string }) => {
    const data: Record<string, unknown> = { order: item.order };
    // Allow moving tasks between sections
    if (type === "task" && item.sectionId) {
      data.sectionId = item.sectionId;
    }
    // Allow moving sprint tasks between columns
    if (type === "sprintTask" && item.columnId) {
      data.columnId = item.columnId;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (model as any).update({ where: { id: item.id }, data });
  });

  await prisma.$transaction(updates);

  if (type === "sprintTask") {
    // syncReorderedCards internally checks for trelloCardId on each task
    after(trelloSync(() => syncReorderedCards(items)));
  }

  return NextResponse.json({ success: true });
}
