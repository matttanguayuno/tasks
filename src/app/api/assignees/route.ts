import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const assignees = await prisma.taskAssignee.findMany({
    select: { name: true },
    distinct: ["name"],
    orderBy: { name: "asc" },
  });
  return NextResponse.json(assignees.map((a) => a.name));
}
