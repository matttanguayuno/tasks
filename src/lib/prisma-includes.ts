/* Recursive Prisma include for deeply nested subtasks */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDeepSubtasks(depth: number): any {
  if (depth <= 0) {
    return {
      orderBy: { order: "asc" },
      include: {
        tags: { include: { tag: true } },
        _count: { select: { comments: true, attachments: true, subtasks: true } },
      },
    };
  }
  return {
    orderBy: { order: "asc" },
    include: {
      subtasks: buildDeepSubtasks(depth - 1),
      tags: { include: { tag: true } },
      _count: { select: { comments: true, attachments: true, subtasks: true } },
    },
  };
}

/** Include for task list queries — subtasks nested up to 6 levels deep */
export const taskListInclude = {
  subtasks: buildDeepSubtasks(5),
  tags: { include: { tag: true } },
  _count: { select: { comments: true, attachments: true, subtasks: true } },
};
