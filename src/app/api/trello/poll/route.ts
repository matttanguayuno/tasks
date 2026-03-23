import { NextRequest, NextResponse } from "next/server";
import { pullChangesFromTrello, syncMissingCards, isTrelloConfigured } from "@/lib/trello";

/** POST /api/trello/poll — Push missing cards then pull changes from Trello for a sprint */
export async function POST(request: NextRequest) {
  if (!isTrelloConfigured()) {
    return NextResponse.json({ configured: false, changes: [] });
  }

  const { sprintId } = await request.json();
  if (!sprintId) {
    return NextResponse.json({ error: "sprintId required" }, { status: 400 });
  }

  // Push only cards that don't exist in Trello yet (new tasks).
  // We must NOT update existing cards here — that would overwrite
  // Trello-side changes (e.g. column moves) before pullChangesFromTrello
  // gets a chance to detect them.
  await syncMissingCards(sprintId);

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
