import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const tags = await prisma.tag.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { tasks: true } } },
  });
  return NextResponse.json(tags);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const tag = await prisma.tag.create({
    data: {
      name: body.name,
      color: body.color || "#6366f1",
    },
  });
  return NextResponse.json(tag, { status: 201 });
}
