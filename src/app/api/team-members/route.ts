import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  try {
    const members = await prisma.teamMember.findMany({
      orderBy: { order: "asc" },
    });
    return NextResponse.json(members);
  } catch (err) {
    console.error("GET /api/team-members error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const maxOrder = await prisma.teamMember.aggregate({ _max: { order: true } });
    const member = await prisma.teamMember.create({
      data: {
        name: body.name || "New Member",
        role: body.role || "",
        discord: body.discord || "",
        email: body.email || "",
        notes: body.notes || "",
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
    return NextResponse.json(member, { status: 201 });
  } catch (err) {
    console.error("POST /api/team-members error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
