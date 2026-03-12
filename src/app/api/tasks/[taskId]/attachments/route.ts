import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const attachments = await prisma.attachment.findMany({
    where: { taskId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(attachments);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const formData = await request.formData();
  const file = formData.get("file") as File;
  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  await mkdir(UPLOADS_DIR, { recursive: true });

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const uniqueName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const filePath = path.join(UPLOADS_DIR, uniqueName);
  await writeFile(filePath, buffer);

  const attachment = await prisma.attachment.create({
    data: {
      filename: file.name,
      url: `/api/uploads/${uniqueName}`,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      taskId,
    },
  });
  return NextResponse.json(attachment, { status: 201 });
}
