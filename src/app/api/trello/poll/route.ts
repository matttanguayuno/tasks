import { NextRequest, NextResponse } from "next/server";
import { pullChangesFromTrello, isTrelloConfigured } from "@/lib/trello";

/** POST /api/trello/poll — Pull changes from Trello for a sprint */
export async function POST(request: NextRequest) {
  if (!isTrelloConfigured()) {
    return NextResponse.json({ configured: false, changes: [] });
  }

  const { sprintId } = await request.json();
  if (!sprintId) {
    return NextResponse.json({ error: "sprintId required" }, { status: 400 });
  }

  const changes = await pullChangesFromTrello(sprintId);
  return NextResponse.json({ configured: true, changes });
}

/** GET /api/trello/poll — Check if Trello is configured */
export async function GET() {
  return NextResponse.json({ configured: isTrelloConfigured() });
}
