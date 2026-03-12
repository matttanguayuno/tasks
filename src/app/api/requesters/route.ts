import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  const results = await prisma.task.findMany({
    where: { requestedBy: { not: null } },
    select: { requestedBy: true },
    distinct: ["requestedBy"],
    orderBy: { requestedBy: "asc" },
  });
  const names = results.map((r) => r.requestedBy).filter(Boolean) as string[];
  return NextResponse.json(names);
}
