/**
 * Trello integration — push-only sync with selective pull-back.
 *
 * Push: Every board mutation (create sprint, add/move/rename/complete tasks, etc.)
 *       fires a non-blocking Trello API call.
 * Pull: A polling endpoint checks Trello for renames, column moves, and completions,
 *       then applies those changes locally.
 *
 * If TRELLO_API_KEY / TRELLO_TOKEN are not set, all functions silently no-op.
 */

import { prisma } from "./prisma";

const API = "https://api.trello.com/1";

// ─── HTML → Markdown conversion ──────────────────────────────────────────────

/** Normalize a date to noon UTC so Trello displays the correct calendar day regardless of timezone. */
function dueDateToTrello(date: Date | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  // Extract the UTC date components and set to noon UTC
  const iso = d.toISOString().slice(0, 10); // "YYYY-MM-DD"
  return `${iso}T12:00:00.000Z`;
}

/** Convert HTML description to Trello-compatible Markdown. */
function htmlToMarkdown(html: string): string {
  if (!html) return "";
  let md = html;
  // Bold
  md = md.replace(/<(strong|b)>(.*?)<\/\1>/gi, "**$2**");
  // Italic
  md = md.replace(/<(em|i)>(.*?)<\/\1>/gi, "*$2*");
  // Links
  md = md.replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  // Ordered lists: number each <li> inside <ol>
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_match, inner: string) => {
    let idx = 0;
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: string, content: string) => {
      idx++;
      return `${idx}. ${content.trim()}\n`;
    });
    return "\n" + items.replace(/<[^>]+>/g, "").trim() + "\n";
  });
  // Unordered lists: bullet each <li> inside <ul>
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_match, inner: string) => {
    const items = inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m: string, content: string) => {
      return `- ${content.trim()}\n`;
    });
    return "\n" + items.replace(/<[^>]+>/g, "").trim() + "\n";
  });
  // Any remaining list items (outside wrappers)
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  // Strip any remaining list wrappers
  md = md.replace(/<\/?(?:ul|ol)[^>]*>/gi, "");
  // Line breaks
  md = md.replace(/<br\s*\/?>/gi, "\n");
  // Paragraphs
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n");
  // Strip remaining HTML tags
  md = md.replace(/<[^>]+>/g, "");
  // Decode common entities
  md = md.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  // Collapse multiple blank lines
  md = md.replace(/\n{3,}/g, "\n\n").trim();
  return md;
}

/** Convert Trello Markdown back to HTML for storage. */
function markdownToHtml(md: string): string {
  if (!md) return "";
  let html = md;
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic (single *)
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  // Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  // Ordered list blocks (consecutive numbered lines)
  html = html.replace(/((?:^|\n)\d+\.\s+.+(?:\n\d+\.\s+.+)*)/g, (_match, block: string) => {
    const items = block.trim().split("\n").map((line: string) =>
      "<li>" + line.replace(/^\d+\.\s+/, "") + "</li>"
    ).join("");
    return "<ol>" + items + "</ol>";
  });
  // Unordered list blocks (consecutive - lines)
  html = html.replace(/((?:^|\n)-\s+.+(?:\n-\s+.+)*)/g, (_match, block: string) => {
    const items = block.trim().split("\n").map((line: string) =>
      "<li>" + line.replace(/^-\s+/, "") + "</li>"
    ).join("");
    return "<ul>" + items + "</ul>";
  });
  // Paragraphs: wrap remaining non-tag lines
  html = html.split("\n").map((line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("<")) return trimmed;
    return "<p>" + trimmed + "</p>";
  }).filter(Boolean).join("");
  return html;
}

function getCredentials(): { key: string; token: string } | null {
  const key = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  if (!key || !token) return null;
  return { key, token };
}

function authParams(creds: { key: string; token: string }): string {
  return `key=${encodeURIComponent(creds.key)}&token=${encodeURIComponent(creds.token)}`;
}

async function trelloFetch(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const creds = getCredentials();
  if (!creds) return null;

  const separator = path.includes("?") ? "&" : "?";
  const url = `${API}${path}${separator}${authParams(creds)}`;

  try {
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      console.warn(`[Trello] ${method} ${path} → ${res.status} ${res.statusText}`);
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (err) {
    console.warn(`[Trello] ${method} ${path} failed:`, err);
    return null;
  }
}

// ─── Push helpers (fire-and-forget) ───────────────────────────────────────────

/**
 * Ensure a Trello board exists for a sprint. Creates one if needed.
 * Returns the Trello board ID.
 */
export async function ensureBoardForSprint(sprintId: string): Promise<string | null> {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: { project: true },
  });
  if (!sprint) return null;

  // Already have a board
  if (sprint.trelloBoardId) return sprint.trelloBoardId;

  const board = await trelloFetch("/boards", "POST", {
    name: `${sprint.project.name} — Sprint ${sprint.number}`,
    defaultLists: false,
  });
  if (!board) return null;

  const boardId = board.id as string;
  await prisma.sprint.update({
    where: { id: sprintId },
    data: { trelloBoardId: boardId },
  });

  // Create lists for each board column
  const columns = await prisma.boardColumn.findMany({
    where: { projectId: sprint.projectId },
    orderBy: { order: "asc" },
  });

  // Invite additional member if configured
  const inviteMember = process.env.TRELLO_INVITE_MEMBER;
  if (inviteMember) {
    await trelloFetch(`/boards/${boardId}/members/${inviteMember}`, "PUT", {
      type: "admin",
    });
  }

  // Trello creates lists in reverse order of API calls, so reverse iterate
  for (const col of [...columns].reverse()) {
    const list = await trelloFetch("/lists", "POST", {
      name: col.name,
      idBoard: boardId,
    });
    if (list) {
      await prisma.boardColumn.update({
        where: { id: col.id },
        data: { trelloListId: list.id as string },
      });
    }
  }

  return boardId;
}

/** Ensure a Trello list exists for a board column on a given sprint's board. */
async function ensureListForColumn(columnId: string, sprintId: string): Promise<string | null> {
  const column = await prisma.boardColumn.findUnique({ where: { id: columnId } });
  if (!column) return null;

  if (column.trelloListId) {
    // Verify the list is on the right board
    return column.trelloListId;
  }

  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint?.trelloBoardId) return null;

  const list = await trelloFetch("/lists", "POST", {
    name: column.name,
    idBoard: sprint.trelloBoardId,
  });
  if (!list) return null;

  const listId = list.id as string;
  await prisma.boardColumn.update({
    where: { id: columnId },
    data: { trelloListId: listId },
  });
  return listId;
}

/** Sync a sprint task to Trello — create card if needed, or update it. */
export async function syncCard(sprintTaskId: string): Promise<void> {
  const st = await prisma.sprintTask.findUnique({
    where: { id: sprintTaskId },
    include: { task: true, sprint: true },
  });
  if (!st) return;

  // Ensure board exists
  await ensureBoardForSprint(st.sprintId);

  const listId = await ensureListForColumn(st.columnId, st.sprintId);
  if (!listId) return;

  if (st.trelloCardId) {
    // Update existing card
    // Ensure a due date exists when completing — dueComplete requires a due date
    const due = dueDateToTrello(st.task.dueDate)
      || (st.task.completed ? dueDateToTrello(st.task.completedAt ?? new Date()) : null);
    await trelloFetch(`/cards/${st.trelloCardId}`, "PUT", {
      name: st.task.title,
      desc: htmlToMarkdown(st.task.description || ""),
      idList: listId,
      due,
      dueComplete: st.task.completed,
    });
  } else {
    // Create new card
    const card = await trelloFetch("/cards", "POST", {
      name: st.task.title,
      desc: htmlToMarkdown(st.task.description || ""),
      idList: listId,
      pos: "bottom",
      due: dueDateToTrello(st.task.dueDate),
    });
    if (card) {
      await prisma.sprintTask.update({
        where: { id: sprintTaskId },
        data: { trelloCardId: card.id as string },
      });
      // Sync subtasks as checklist items on the new card
      await syncChecklistToTrello(st.taskId);
    }
  }
}

/** Sync all cards for a sprint — useful after bulk operations. */
export async function syncAllCards(sprintId: string): Promise<void> {
  await ensureBoardForSprint(sprintId);
  const tasks = await prisma.sprintTask.findMany({ where: { sprintId } });
  for (const st of tasks) {
    await syncCard(st.id);
  }
}

/** Archive/delete a Trello card when a task is removed from the board. */
export async function archiveCard(trelloCardId: string): Promise<void> {
  if (!trelloCardId) return;
  await trelloFetch(`/cards/${trelloCardId}`, "PUT", { closed: true });
}

/** Update a Trello card when the underlying task changes (rename, description, complete). */
export async function syncTaskToCards(taskId: string): Promise<void> {
  const sprintTasks = await prisma.sprintTask.findMany({
    where: { taskId },
    include: { task: true },
  });
  for (const st of sprintTasks) {
    if (!st.trelloCardId) continue;
    const listId = await ensureListForColumn(st.columnId, st.sprintId);
    // Ensure a due date exists when completing — dueComplete requires a due date
    const due = dueDateToTrello(st.task.dueDate)
      || (st.task.completed ? dueDateToTrello(st.task.completedAt ?? new Date()) : null);
    await trelloFetch(`/cards/${st.trelloCardId}`, "PUT", {
      name: st.task.title,
      desc: htmlToMarkdown(st.task.description || ""),
      idList: listId || undefined,
      due,
      dueComplete: st.task.completed,
    });
  }
}

/**
 * Tracks the last time subtasks were pushed to Trello per parent taskId.
 * Used by pullChangesFromTrello to skip checklist processing during race windows.
 */
const lastChecklistPushTime = new Map<string, number>();
const CHECKLIST_PUSH_GRACE_MS = 30_000; // 30 seconds

/** Sync subtasks → Trello checklist items on all cards for this task. */
export async function syncChecklistToTrello(taskId: string): Promise<void> {
  lastChecklistPushTime.set(taskId, Date.now());
  const sprintTasks = await prisma.sprintTask.findMany({
    where: { taskId },
  });
  const subtasks = await prisma.task.findMany({
    where: { parentId: taskId },
    orderBy: { order: "asc" },
  });

  for (const st of sprintTasks) {
    if (!st.trelloCardId) continue;

    // Ensure a checklist exists on this card
    let checklistId = st.trelloChecklistId;
    if (!checklistId) {
      const cl = await trelloFetch("/checklists", "POST", {
        idCard: st.trelloCardId,
        name: "Subtasks",
      });
      if (!cl) continue;
      checklistId = cl.id as string;
      await prisma.sprintTask.update({
        where: { id: st.id },
        data: { trelloChecklistId: checklistId },
      });
    }

    // Get existing check items on the checklist
    const existingItems = (await trelloFetch(
      `/checklists/${checklistId}/checkItems`
    )) as Array<{ id: string; name: string; state: string }> | null;

    const existingById = new Map(
      (existingItems ?? []).map((item) => [item.id, item])
    );

    for (const sub of subtasks) {
      const state = sub.completed ? "complete" : "incomplete";
      if (sub.trelloCheckItemId && existingById.has(sub.trelloCheckItemId)) {
        // Update existing check item
        const existing = existingById.get(sub.trelloCheckItemId)!;
        if (existing.name !== sub.title || existing.state !== state) {
          await trelloFetch(
            `/cards/${st.trelloCardId}/checkItem/${sub.trelloCheckItemId}`,
            "PUT",
            { name: sub.title, state }
          );
        }
        existingById.delete(sub.trelloCheckItemId);
      } else if (!sub.trelloCheckItemId) {
        // Create new check item
        const item = await trelloFetch(
          `/checklists/${checklistId}/checkItems`,
          "POST",
          { name: sub.title, checked: sub.completed }
        );
        if (item) {
          await prisma.task.update({
            where: { id: sub.id },
            data: { trelloCheckItemId: item.id as string },
          });
        }
      }
    }

    // Remove check items that no longer have a matching subtask
    const localCheckItemIds = new Set(
      subtasks.filter((s) => s.trelloCheckItemId).map((s) => s.trelloCheckItemId)
    );
    for (const [itemId] of existingById) {
      if (!localCheckItemIds.has(itemId)) {
        await trelloFetch(`/checklists/${checklistId}/checkItems/${itemId}`, "DELETE");
      }
    }
  }
}

/** Rename a Trello list when a board column is renamed. */
export async function syncColumnName(columnId: string): Promise<void> {
  const column = await prisma.boardColumn.findUnique({ where: { id: columnId } });
  if (!column?.trelloListId) return;
  await trelloFetch(`/lists/${column.trelloListId}`, "PUT", { name: column.name });
}

/** Sync link attachments to Trello cards. */
export async function syncAttachmentsToCard(taskId: string): Promise<void> {
  const sprintTasks = await prisma.sprintTask.findMany({
    where: { taskId },
  });

  const linkAttachments = await prisma.attachment.findMany({
    where: { taskId, mimeType: "text/x-uri" },
  });

  for (const st of sprintTasks) {
    if (!st.trelloCardId) continue;

    // Get existing Trello attachments
    const trelloAttachments = (await trelloFetch(
      `/cards/${st.trelloCardId}/attachments`
    )) as Array<{ id: string; url: string; name: string }> | null;
    if (!trelloAttachments) continue;

    const existingUrls = new Set(trelloAttachments.map((a) => a.url));
    const desiredUrls = new Set(linkAttachments.map((a) => a.url));

    // Add missing link attachments
    for (const att of linkAttachments) {
      if (!existingUrls.has(att.url)) {
        await trelloFetch(`/cards/${st.trelloCardId}/attachments`, "POST", {
          url: att.url,
          name: att.filename,
        });
      }
    }

    // Remove Trello attachments that no longer exist locally
    for (const ta of trelloAttachments) {
      if (ta.url.startsWith("http") && !desiredUrls.has(ta.url)) {
        await trelloFetch(`/cards/${st.trelloCardId}/attachments/${ta.id}`, "DELETE");
      }
    }
  }
}

/** Archive a Trello list when a board column is deleted. */
export async function archiveList(trelloListId: string): Promise<void> {
  if (!trelloListId) return;
  await trelloFetch(`/lists/${trelloListId}`, "PUT", { closed: true });
}

/** Close a Trello board when a sprint is closed. */
export async function closeTrelloBoard(sprintId: string): Promise<void> {
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint?.trelloBoardId) return;
  await trelloFetch(`/boards/${sprint.trelloBoardId}`, "PUT", { closed: true });
}

/** Delete a Trello board when a sprint is deleted. */
export async function deleteTrelloBoard(trelloBoardId: string): Promise<void> {
  if (!trelloBoardId) return;
  await trelloFetch(`/boards/${trelloBoardId}`, "DELETE");
}

/** Sync cards when sprint tasks are reordered / moved between columns. */
export async function syncReorderedCards(
  items: { id: string; columnId?: string }[]
): Promise<void> {
  for (const item of items) {
    if (!item.columnId) continue;
    const st = await prisma.sprintTask.findUnique({
      where: { id: item.id },
      include: { task: true },
    });
    if (!st?.trelloCardId) continue;
    const listId = await ensureListForColumn(item.columnId, st.sprintId);
    if (listId) {
      await trelloFetch(`/cards/${st.trelloCardId}`, "PUT", { idList: listId });
    }
  }
}

// ─── Comment sync ────────────────────────────────────────────────────────────

/** Push a comment to all Trello cards for a task. Returns the trelloCommentId for the first card. */
export async function syncCommentToCards(
  taskId: string,
  commentId: string,
  content: string
): Promise<void> {
  const sprintTasks = await prisma.sprintTask.findMany({
    where: { taskId },
  });

  const text = htmlToMarkdown(content);

  for (const st of sprintTasks) {
    if (!st.trelloCardId) continue;

    // Check if this comment already has a Trello ID
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) continue;

    if (comment.trelloCommentId) {
      // Update existing Trello comment
      await trelloFetch(
        `/cards/${st.trelloCardId}/actions/${comment.trelloCommentId}/comments`,
        "PUT",
        { text }
      );
    } else {
      // Create new Trello comment
      const result = await trelloFetch(
        `/cards/${st.trelloCardId}/actions/comments`,
        "POST",
        { text }
      );
      if (result) {
        await prisma.comment.update({
          where: { id: commentId },
          data: { trelloCommentId: result.id as string },
        });
      }
    }
  }
}

/** Delete a comment from all Trello cards for a task. */
export async function deleteCommentFromCards(
  taskId: string,
  trelloCommentId: string
): Promise<void> {
  if (!trelloCommentId) return;
  const sprintTasks = await prisma.sprintTask.findMany({
    where: { taskId },
  });
  for (const st of sprintTasks) {
    if (!st.trelloCardId) continue;
    await trelloFetch(
      `/cards/${st.trelloCardId}/actions/${trelloCommentId}/comments`,
      "DELETE"
    );
  }
}

// ─── Assignee / Member sync ─────────────────────────────────────────────────

/** Sync task assignees to Trello card members (best-effort name matching). */
export async function syncAssigneesToCard(taskId: string): Promise<void> {
  const sprintTasks = await prisma.sprintTask.findMany({
    where: { taskId },
    include: { sprint: true },
  });

  const assignees = await prisma.taskAssignee.findMany({ where: { taskId } });
  if (assignees.length === 0 && sprintTasks.length === 0) return;

  for (const st of sprintTasks) {
    if (!st.trelloCardId || !st.sprint.trelloBoardId) continue;

    // Get board members
    const boardMembers = (await trelloFetch(
      `/boards/${st.sprint.trelloBoardId}/members`
    )) as Array<{ id: string; fullName: string; username: string }> | null;
    if (!boardMembers) continue;

    // Get current card members
    const cardMembers = (await trelloFetch(
      `/cards/${st.trelloCardId}/members`
    )) as Array<{ id: string }> | null;
    const currentMemberIds = new Set((cardMembers || []).map((m) => m.id));

    // Match assignee names to board members (case-insensitive)
    const targetMemberIds = new Set<string>();
    for (const assignee of assignees) {
      const match = boardMembers.find(
        (m) =>
          m.fullName.toLowerCase() === assignee.name.toLowerCase() ||
          m.username.toLowerCase() === assignee.name.toLowerCase()
      );
      if (match) targetMemberIds.add(match.id);
    }

    // Add missing members
    for (const memberId of targetMemberIds) {
      if (!currentMemberIds.has(memberId)) {
        await trelloFetch(`/cards/${st.trelloCardId}/idMembers`, "POST", {
          value: memberId,
        });
      }
    }

    // Remove members no longer assigned
    for (const memberId of currentMemberIds) {
      if (!targetMemberIds.has(memberId)) {
        await trelloFetch(
          `/cards/${st.trelloCardId}/idMembers/${memberId}`,
          "DELETE"
        );
      }
    }
  }
}

// ─── Pull helpers (polling) ──────────────────────────────────────────────────

interface TrelloPullChange {
  type: "rename" | "move" | "complete" | "reopen" | "comment" | "attachment" | "dueDate" | "description" | "checklist";
  taskId: string;
  taskTitle?: string;
  newTitle?: string;
  newColumnId?: string;
  newColumnName?: string;
  commentText?: string;
  attachmentName?: string;
  attachmentUrl?: string;
  newDueDate?: string | null;
  checklistAction?: string;
}

/**
 * Poll Trello for changes on a sprint's board and apply them locally.
 * Only pulls: renames, column moves, and archive/unarchive (complete/reopen).
 */
export async function pullChangesFromTrello(sprintId: string): Promise<TrelloPullChange[]> {
  const creds = getCredentials();
  if (!creds) return [];

  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: {
      sprintTasks: {
        include: {
          task: {
            include: {
              subtasks: { orderBy: { order: "asc" } },
            },
          },
          column: true,
        },
      },
    },
  });
  if (!sprint?.trelloBoardId) return [];

  // Get all cards on the board (including archived so we can detect Trello-side completions)
  const cards = (await trelloFetch(
    `/boards/${sprint.trelloBoardId}/cards?filter=all&fields=name,desc,idList,closed,due,dueComplete`
  )) as Array<{ id: string; name: string; desc: string; idList: string; closed: boolean; due: string | null; dueComplete: boolean }> | null;

  if (!cards) return [];

  // Build lookup: Trello list ID → BoardColumn
  const columns = await prisma.boardColumn.findMany({
    where: { projectId: sprint.projectId },
  });
  const listToColumn = new Map(
    columns.filter((c) => c.trelloListId).map((c) => [c.trelloListId!, c])
  );

  const changes: TrelloPullChange[] = [];

  // Build card→sprintTask lookup for matched cards only
  const matchedCards: Array<{
    card: (typeof cards)[0];
    st: (typeof sprint.sprintTasks)[0];
  }> = [];
  for (const card of cards) {
    const st = sprint.sprintTasks.find((s) => s.trelloCardId === card.id);
    if (st) matchedCards.push({ card, st });
  }

  // Fetch comments, attachments, and checklists for all cards in parallel
  const [commentResults, attachmentResults, checklistResults] = await Promise.all([
    Promise.all(
      matchedCards.map(({ card }) =>
        trelloFetch(
          `/cards/${card.id}/actions?filter=commentCard&fields=data,idMemberCreator,date`
        ) as Promise<Array<{ id: string; data: { text: string }; idMemberCreator: string; date: string }> | null>
      )
    ),
    Promise.all(
      matchedCards.map(({ card }) =>
        trelloFetch(`/cards/${card.id}/attachments`) as Promise<
          Array<{ id: string; url: string; name: string; bytes: number | null }> | null
        >
      )
    ),
    Promise.all(
      matchedCards.map(({ card }) =>
        trelloFetch(`/cards/${card.id}/checklists`) as Promise<
          Array<{ id: string; name: string; checkItems: Array<{ id: string; name: string; state: string }> }> | null
        >
      )
    ),
  ]);

  for (let i = 0; i < matchedCards.length; i++) {
    const { card, st } = matchedCards[i];

    // Check description change
    const trelloDesc = (card.desc || "").trim();
    const localHtml = (st.task.description || "").trim();
    const localDescMd = htmlToMarkdown(localHtml).trim();
    // If Trello still has raw HTML (from before markdown conversion was added),
    // push the converted markdown to Trello to normalise it.
    if (trelloDesc === localHtml && trelloDesc !== localDescMd) {
      await trelloFetch(`/cards/${card.id}`, "PUT", { desc: localDescMd });
    } else if (trelloDesc !== localDescMd) {
      // Trello has a genuinely different description — pull it
      const newDescHtml = markdownToHtml(card.desc);
      await prisma.task.update({
        where: { id: st.taskId },
        data: { description: newDescHtml },
      });
      changes.push({
        type: "description",
        taskId: st.taskId,
        taskTitle: st.task.title,
      });
    }

    // Check rename
    if (card.name !== st.task.title) {
      await prisma.task.update({
        where: { id: st.taskId },
        data: { title: card.name },
      });
      changes.push({
        type: "rename",
        taskId: st.taskId,
        taskTitle: st.task.title,
        newTitle: card.name,
      });
    }

    // Check column move
    const targetColumn = listToColumn.get(card.idList);
    if (targetColumn && targetColumn.id !== st.columnId) {
      await prisma.sprintTask.update({
        where: { id: st.id },
        data: { columnId: targetColumn.id },
      });
      changes.push({
        type: "move",
        taskId: st.taskId,
        taskTitle: st.task.title,
        newColumnId: targetColumn.id,
        newColumnName: targetColumn.name,
      });
    }

    // Check due date
    const trelloDue = card.due ? new Date(card.due) : null;
    const localDue = st.task.dueDate ? new Date(st.task.dueDate) : null;
    const trelloDueDay = trelloDue ? trelloDue.toISOString().slice(0, 10) : null;
    const localDueDay = localDue ? localDue.toISOString().slice(0, 10) : null;
    if (trelloDueDay !== localDueDay) {
      const normalizedDue = trelloDue ? new Date(`${trelloDueDay}T12:00:00.000Z`) : null;
      await prisma.task.update({
        where: { id: st.taskId },
        data: { dueDate: normalizedDue },
      });
      changes.push({
        type: "dueDate",
        taskId: st.taskId,
        taskTitle: st.task.title,
        newDueDate: trelloDue ? trelloDue.toISOString() : null,
      });
    }

    // Check completed (dueComplete in Trello, or archived)
    const trelloCompleted = card.dueComplete || card.closed;
    if (trelloCompleted && !st.task.completed) {
      await prisma.task.update({
        where: { id: st.taskId },
        data: { completed: true, completedAt: new Date(), inProgress: false },
      });
      changes.push({ type: "complete", taskId: st.taskId, taskTitle: st.task.title });
    } else if (!card.dueComplete && !card.closed && st.task.completed) {
      await prisma.task.update({
        where: { id: st.taskId },
        data: { completed: false, completedAt: null, inProgress: false },
      });
      changes.push({ type: "reopen", taskId: st.taskId, taskTitle: st.task.title });
    }

    // Pull comments (already fetched in parallel above)
    const trelloComments = commentResults[i];
    if (trelloComments) {
      const existingComments = await prisma.comment.findMany({
        where: { taskId: st.taskId },
      });
      const knownTrelloIds = new Set(
        existingComments.filter((c) => c.trelloCommentId).map((c) => c.trelloCommentId)
      );

      for (const tc of trelloComments) {
        if (knownTrelloIds.has(tc.id)) continue;

        await prisma.comment.create({
          data: {
            content: tc.data.text,
            trelloCommentId: tc.id,
            taskId: st.taskId,
            createdAt: new Date(tc.date),
          },
        });
        changes.push({
          type: "comment",
          taskId: st.taskId,
          taskTitle: st.task.title,
          commentText: tc.data.text,
        });
      }
    }

    // Pull link attachments (already fetched in parallel above)
    const trelloAttachments = attachmentResults[i];
    if (trelloAttachments) {
      const localAttachments = await prisma.attachment.findMany({
        where: { taskId: st.taskId, mimeType: "text/x-uri" },
      });
      const localUrls = new Set(localAttachments.map((a) => a.url));

      for (const ta of trelloAttachments) {
        if (!ta.url || !ta.url.startsWith("http") || localUrls.has(ta.url)) continue;

        await prisma.attachment.create({
          data: {
            filename: ta.name || ta.url,
            url: ta.url,
            size: 0,
            mimeType: "text/x-uri",
            taskId: st.taskId,
          },
        });
        changes.push({
          type: "attachment",
          taskId: st.taskId,
          taskTitle: st.task.title,
          attachmentName: ta.name || ta.url,
          attachmentUrl: ta.url,
        });
      }
    }

    // Pull checklists → subtasks (already fetched in parallel above)
    const trelloChecklists = checklistResults[i];
    if (trelloChecklists && trelloChecklists.length > 0) {
      // Skip checklist processing if a local push is in-flight (within grace period)
      const lastPush = lastChecklistPushTime.get(st.taskId) ?? 0;
      if (Date.now() - lastPush < CHECKLIST_PUSH_GRACE_MS) continue;

      // Use the first checklist (or the one matching our stored ID)
      const checklist = st.trelloChecklistId
        ? trelloChecklists.find((cl) => cl.id === st.trelloChecklistId) ?? trelloChecklists[0]
        : trelloChecklists[0];

      // Store checklist ID if we don't have it yet
      if (!st.trelloChecklistId) {
        await prisma.sprintTask.update({
          where: { id: st.id },
          data: { trelloChecklistId: checklist.id },
        });
      }

      const localSubtasks = st.task.subtasks;
      const localByCheckItemId = new Map(
        localSubtasks.filter((s) => s.trelloCheckItemId).map((s) => [s.trelloCheckItemId!, s])
      );

      for (const item of checklist.checkItems) {
        const localSub = localByCheckItemId.get(item.id);
        const isComplete = item.state === "complete";

        if (localSub) {
          // Existing subtask — check for name or completion changes
          // Skip if subtask was modified locally within grace period
          const recentlyModified = (Date.now() - new Date(localSub.updatedAt).getTime()) < CHECKLIST_PUSH_GRACE_MS;
          if (recentlyModified) continue;

          const titleChanged = item.name !== localSub.title;
          const completionChanged = isComplete !== localSub.completed;
          if (titleChanged || completionChanged) {
            await prisma.task.update({
              where: { id: localSub.id },
              data: {
                ...(titleChanged ? { title: item.name } : {}),
                ...(completionChanged
                  ? { completed: isComplete, completedAt: isComplete ? new Date() : null }
                  : {}),
              },
            });
            changes.push({
              type: "checklist",
              taskId: st.taskId,
              taskTitle: st.task.title,
              checklistAction: titleChanged ? `renamed subtask to "${item.name}"` : (isComplete ? "completed subtask" : "reopened subtask"),
            });
          }
        } else {
          // No match by checkItemId — check for an unlinked subtask with same name
          // (likely a recently-pushed subtask whose trelloCheckItemId hasn't been saved yet)
          const unlinkedMatch = localSubtasks.find(
            (s) => !s.trelloCheckItemId && s.title === item.name
          );
          if (unlinkedMatch) {
            // Link the existing subtask to this check item instead of creating a duplicate
            await prisma.task.update({
              where: { id: unlinkedMatch.id },
              data: { trelloCheckItemId: item.id },
            });
          } else {
            // Genuinely new check item from Trello — create a local subtask
            const maxOrder = await prisma.task.aggregate({
              where: { parentId: st.taskId },
              _max: { order: true },
            });
            await prisma.task.create({
              data: {
                title: item.name,
                completed: isComplete,
                completedAt: isComplete ? new Date() : null,
                order: (maxOrder._max.order ?? -1) + 1,
                parentId: st.taskId,
                sectionId: st.task.sectionId,
                trelloCheckItemId: item.id,
              },
            });
            changes.push({
              type: "checklist",
              taskId: st.taskId,
              taskTitle: st.task.title,
              checklistAction: `added subtask "${item.name}"`,
            });
          }
        }
      }

      // Check for check items deleted from Trello — remove local subtasks
      const trelloItemIds = new Set(checklist.checkItems.map((item) => item.id));
      for (const sub of localSubtasks) {
        if (sub.trelloCheckItemId && !trelloItemIds.has(sub.trelloCheckItemId)) {
          // Skip if subtask was modified locally within grace period
          const recentlyModified = (Date.now() - new Date(sub.updatedAt).getTime()) < CHECKLIST_PUSH_GRACE_MS;
          if (recentlyModified) continue;

          await prisma.task.delete({ where: { id: sub.id } });
          changes.push({
            type: "checklist",
            taskId: st.taskId,
            taskTitle: st.task.title,
            checklistAction: `removed subtask "${sub.title}"`,
          });
        }
      }
    }
  }

  return changes;
}

/** Check whether Trello sync is configured. */
export function isTrelloConfigured(): boolean {
  return getCredentials() !== null;
}

/**
 * Fire-and-forget wrapper — logs errors but never throws.
 * Use this to call sync functions from API routes without blocking the response.
 */
export function fireAndForget(fn: () => Promise<unknown>): void {
  fn().catch((err) => console.warn("[Trello] background sync error:", err));
}
