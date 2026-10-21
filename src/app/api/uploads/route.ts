import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { uploadSchema } from "@/lib/validation";
import { createStorageKey, createUploadUrl, storageConfigured } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!storageConfigured()) {
    return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid upload." }, { status: 400 });
  }

  try {
    const storageKey = createStorageKey(user.id, parsed.data.fileName, parsed.data.mimeType);
    const uploadUrl = await createUploadUrl(storageKey, parsed.data.mimeType, parsed.data.size);
    const ticket = await prisma.uploadTicket.create({
      data: {
        userId: user.id,
        storageKey,
        fileName: parsed.data.fileName,
        mimeType: parsed.data.mimeType,
        size: parsed.data.size,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      select: { id: true },
    });
    return NextResponse.json({ ticketId: ticket.id, uploadUrl }, { status: 201 });
  } catch (error) {
    console.error("create upload route error", error);
    return NextResponse.json({ error: "Unable to prepare the file upload." }, { status: 500 });
  }
}
