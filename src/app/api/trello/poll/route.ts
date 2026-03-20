import { NextRequest, NextResponse } from "next/server";
import { pullChangesFromTrello, syncAllCards, isTrelloConfigured } from "@/lib/trello";

/** POST /api/trello/poll — Push missing cards then pull changes from Trello for a sprint */
export async function POST(request: NextRequest) {
  if (!isTrelloConfigured()) {
    return NextResponse.json({ configured: false, changes: [] });
  }

  const { sprintId } = await request.json();
  if (!sprintId) {
    return NextResponse.json({ error: "sprintId required" }, { status: 400 });
  }

  // Push first: create/update Trello cards for any local tasks missing them
  await syncAllCards(sprintId);

  // Then pull: detect renames, moves, completions, comments etc. from Trello
  const result = await pullChangesFromTrello(sprintId);
  if (result && 'authError' in result) {
    return NextResponse.json({ configured: true, changes: [], authError: true });
  }
  return NextResponse.json({ configured: true, changes: result });
}

/** GET /api/trello/poll — Check if Trello is configured */
export async function GET() {
  return NextResponse.json({ configured: isTrelloConfigured() });
}
