import { NextRequest, NextResponse } from "next/server";
import { ensureBoardForSprint, syncAllCards, deleteTrelloBoard, isTrelloConfigured } from "@/lib/trello";
import { prisma } from "@/lib/prisma";

/** POST /api/trello/sync — Enable Trello sync for a sprint */
export async function POST(request: NextRequest) {
  if (!isTrelloConfigured()) {
    return NextResponse.json({ error: "Trello not configured" }, { status: 400 });
  }

  const { sprintId } = await request.json();
  if (!sprintId) {
    return NextResponse.json({ error: "sprintId required" }, { status: 400 });
  }

  const boardId = await ensureBoardForSprint(sprintId);
  if (!boardId) {
    return NextResponse.json({ error: "Failed to create Trello board" }, { status: 500 });
  }

  // Sync all existing cards to the board
  await syncAllCards(sprintId);

  return NextResponse.json({ success: true, boardId });
}

/** DELETE /api/trello/sync — Disable Trello sync for a sprint */
export async function DELETE(request: NextRequest) {
  const { sprintId } = await request.json();
  if (!sprintId) {
    return NextResponse.json({ error: "sprintId required" }, { status: 400 });
  }

  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint?.trelloBoardId) {
    return NextResponse.json({ success: true });
  }

  // Delete the Trello board
  await deleteTrelloBoard(sprint.trelloBoardId);

  // Clear Trello IDs from sprint and its tasks
  await prisma.sprint.update({
    where: { id: sprintId },
    data: { trelloBoardId: null },
  });
  await prisma.sprintTask.updateMany({
    where: { sprintId },
    data: { trelloCardId: null },
  });

  // Clear trelloListId from columns used by this sprint's project
  if (sprint.projectId) {
    await prisma.boardColumn.updateMany({
      where: { projectId: sprint.projectId },
      data: { trelloListId: null },
    });
  }

  return NextResponse.json({ success: true });
}
