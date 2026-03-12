import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import path from "path";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string; attachmentId: string }> }
) {
  const { attachmentId } = await params;
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
  });
  if (!attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete file from disk
  const filename = attachment.url.split("/").pop();
  if (filename) {
    try {
      await unlink(path.join(UPLOADS_DIR, filename));
    } catch {
      // File may already be deleted
    }
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });
  return NextResponse.json({ success: true });
}
