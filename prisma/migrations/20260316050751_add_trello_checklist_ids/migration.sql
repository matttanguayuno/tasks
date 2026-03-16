-- AlterTable
ALTER TABLE "SprintTask" ADD COLUMN "trelloChecklistId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "trelloCheckItemId" TEXT;
