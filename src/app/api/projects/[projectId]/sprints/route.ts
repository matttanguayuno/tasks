import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_COLUMNS = ["To Do", "In Progress", "In Review", "Complete"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const sprints = await prisma.sprint.findMany({
    where: { projectId },
    orderBy: { number: "asc" },
  });
  return NextResponse.json(sprints);
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  });

  // Ensure default board columns exist
  const existingColumns = await prisma.boardColumn.count({ where: { projectId } });
  if (existingColumns === 0) {
    await prisma.boardColumn.createMany({
      data: DEFAULT_COLUMNS.map((name, i) => ({
        name,
        order: i,
        projectId,
      })),
    });
  }

  // Find the latest sprint to determine the next number and dates
  const latestSprint = await prisma.sprint.findFirst({
    where: { projectId },
    orderBy: { number: "desc" },
  });

  const nextNumber = (latestSprint?.number ?? 0) + 1;

  // Calculate start date
  let startDate: Date;
  if (latestSprint) {
    // Next sprint starts the day after the last sprint ends
    startDate = new Date(latestSprint.endDate);
    startDate.setDate(startDate.getDate() + 1);
  } else {
    // First sprint: find the most recent start day (e.g., Monday)
    const now = new Date();
    const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // Convert Sunday from 0 to 7
    const daysToSubtract = (currentDay - project.sprintStartDay + 7) % 7;
    startDate = new Date(now);
    startDate.setDate(now.getDate() - daysToSubtract);
  }
  startDate.setHours(0, 0, 0, 0);

  // Calculate end date
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + project.sprintDuration - 1);
  endDate.setHours(23, 59, 59, 999);

  const sprint = await prisma.sprint.create({
    data: {
      number: nextNumber,
      startDate,
      endDate,
      projectId,
    },
  });

  return NextResponse.json(sprint, { status: 201 });
}
