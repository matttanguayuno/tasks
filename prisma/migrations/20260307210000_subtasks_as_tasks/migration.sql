-- Add parentId column to Task
ALTER TABLE "Task" ADD COLUMN "parentId" TEXT;

-- Migrate existing subtasks into the Task table
-- Each subtask becomes a Task with parentId pointing to its former parent task
-- We use the same sectionId as the parent task
INSERT INTO "Task" ("id", "title", "description", "dueDate", "priority", "order", "completed", "completedAt", "createdAt", "updatedAt", "sectionId", "parentId")
SELECT
  s."id",
  s."title",
  '',
  NULL,
  NULL,
  s."order",
  s."completed",
  NULL,
  s."createdAt",
  s."updatedAt",
  t."sectionId",
  s."taskId"
FROM "Subtask" s
JOIN "Task" t ON s."taskId" = t."id";

-- Drop the Subtask table
DROP TABLE "Subtask";

-- Create index on parentId
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");
