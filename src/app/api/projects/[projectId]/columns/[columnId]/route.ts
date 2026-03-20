import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { syncColumnName, archiveList, trelloSync } from "@/lib/trello";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; columnId: string }> }
) {
  const { columnId } = await params;
  const body = await request.json();

  const column = await prisma.boardColumn.update({
    where: { id: columnId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.order !== undefined && { order: body.order }),
    },
  });

  if (body.name !== undefined) {
    after(trelloSync(() => syncColumnName(columnId)));
  }

  return NextResponse.json(column);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; columnId: string }> }
) {
  const { columnId } = await params;
  const column = await prisma.boardColumn.findUnique({ where: { id: columnId } });
  await prisma.boardColumn.delete({ where: { id: columnId } });
  if (column?.trelloListId) {
    after(trelloSync(() => archiveList(column.trelloListId!)));
  }
  return NextResponse.json({ success: true });
}
