-- AlterTable
ALTER TABLE "BoardColumn" ADD COLUMN "trelloListId" TEXT;

-- AlterTable
ALTER TABLE "Sprint" ADD COLUMN "trelloBoardId" TEXT;

-- AlterTable
ALTER TABLE "SprintTask" ADD COLUMN "trelloCardId" TEXT;
