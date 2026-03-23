import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

interface LineageNode {
  id: string;
  taskId: string;
  title: string;
  completed: boolean;
  inProgress: boolean;
  relation: "self" | "parent" | "subtask" | "linked" | "preceded_by" | "preceded";
  linkType?: string;
  sprintNumbers: number[];
  sprintHistory: { fromSprint: number | null; toSprint: number; movedAt: string }[];
  commitCount: number;
  children: LineageNode[];
}

/** GET /api/tasks/[taskId]/lineage — Build the full lineage tree for a task */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const visited = new Set<string>();

  const tree = await buildNode(taskId, "self", visited);
  if (!tree) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json(tree);
}

async function buildNode(
  taskId: string,
  relation: LineageNode["relation"],
  visited: Set<string>,
  linkType?: string,
): Promise<LineageNode | null> {
  if (visited.has(taskId)) return null;
  visited.add(taskId);

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      sprintTasks: { include: { sprint: { select: { number: true } } } },
      sprintHistory: {
        include: {
          task: { select: { id: true } },
        },
        orderBy: { movedAt: "asc" },
      },
      subtasks: { select: { id: true }, orderBy: { order: "asc" } },
      linksFrom: { select: { id: true, toTaskId: true, linkType: true } },
      linksTo: { select: { id: true, fromTaskId: true, linkType: true } },
      _count: { select: { commits: true } },
    },
  });

  if (!task) return null;

  // Get sprint numbers from sprint history
  const sprintHistoryEntries = await Promise.all(
    task.sprintHistory.map(async (h) => {
      const fromSprint = h.fromSprintId
        ? await prisma.sprint.findUnique({ where: { id: h.fromSprintId }, select: { number: true } })
        : null;
      const toSprint = await prisma.sprint.findUnique({ where: { id: h.toSprintId }, select: { number: true } });
      return {
        fromSprint: fromSprint?.number ?? null,
        toSprint: toSprint?.number ?? 0,
        movedAt: h.movedAt.toISOString(),
      };
    })
  );

  const node: LineageNode = {
    id: `${relation}-${taskId}`,
    taskId,
    title: task.title,
    completed: task.completed,
    inProgress: task.inProgress,
    relation,
    linkType,
    sprintNumbers: task.sprintTasks.map((st) => st.sprint.number).sort((a, b) => a - b),
    sprintHistory: sprintHistoryEntries,
    commitCount: task._count.commits,
    children: [],
  };

  // Traverse parent chain (upward)
  if (relation === "self" && task.parentId) {
    const parentNode = await buildNode(task.parentId, "parent", visited);
    if (parentNode) node.children.push(parentNode);
  }

  // Traverse subtasks (downward)
  for (const sub of task.subtasks) {
    const subNode = await buildNode(sub.id, "subtask", visited);
    if (subNode) node.children.push(subNode);
  }

  // Traverse links (bidirectional)
  for (const link of task.linksFrom) {
    const linkedRelation = link.linkType === "PRECEDED_BY" ? "preceded" as const : "linked" as const;
    const linkedNode = await buildNode(link.toTaskId, linkedRelation, visited, link.linkType);
    if (linkedNode) node.children.push(linkedNode);
  }
  for (const link of task.linksTo) {
    const linkedRelation = link.linkType === "PRECEDED_BY" ? "preceded_by" as const : "linked" as const;
    const linkedNode = await buildNode(link.fromTaskId, linkedRelation, visited, link.linkType);
    if (linkedNode) node.children.push(linkedNode);
  }

  return node;
}
