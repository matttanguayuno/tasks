import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { unlink } from "fs/promises";
import path from "path";
import { syncAttachmentsToCard, trelloSync } from "@/lib/trello";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string; attachmentId: string }> }
) {
  const { taskId, attachmentId } = await params;
  const body = await request.json();
  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (attachment.mimeType !== "text/x-uri") {
    return NextResponse.json({ error: "Only link attachments can be edited" }, { status: 400 });
  }
  const data: { filename?: string; url?: string } = {};
  if (typeof body.name === "string") data.filename = body.name;
  if (typeof body.url === "string") data.url = body.url;
  const updated = await prisma.attachment.update({ where: { id: attachmentId }, data });
  after(trelloSync(() => syncAttachmentsToCard(taskId)));
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; attachmentId: string }> }
) {
  const { taskId, attachmentId } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only delete file from disk for uploaded files (not link attachments)
  if (attachment.mimeType !== "text/x-uri") {
    const filename = attachment.url.split("/").pop();
    if (filename) {
      try {
        await unlink(path.join(UPLOADS_DIR, filename));
      } catch {
        // File may already be deleted
      }
    }
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });
  after(trelloSync(() => syncAttachmentsToCard(taskId)));
  return NextResponse.json({ success: true });
}
