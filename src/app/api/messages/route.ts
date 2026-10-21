import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { attachUploadTickets } from "@/lib/message-attachments";
import { prisma } from "@/lib/prisma";
import { emitRealtime } from "@/lib/realtime";
import { createDownloadUrl, storageConfigured } from "@/lib/storage";
import { sendMessageSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const channelId = request.nextUrl.searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "A channel is required." }, { status: 400 });

  try {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        server: { members: { some: { userId: user.id } } },
      },
      select: { id: true },
    });
    if (!channel) return NextResponse.json({ error: "Channel not found." }, { status: 404 });

    const newestMessages = await prisma.message.findMany({
      where: { channelId: channel.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        content: true,
        createdAt: true,
        author: { select: { id: true, username: true, displayName: true } },
        attachments: {
          select: { id: true, fileName: true, mimeType: true, size: true, storageKey: true },
        },
      },
    });

    const messages = await Promise.all(newestMessages.reverse().map(async (message) => ({
      ...message,
      attachments: await Promise.all(message.attachments.map(async ({ storageKey, ...attachment }) => ({
        ...attachment,
        url: await createDownloadUrl(storageKey),
      }))),
    })));
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("list messages route error", error);
    return NextResponse.json({ error: "Unable to load messages right now." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const channelId =
    typeof body === "object" && body !== null && "channelId" in body && typeof body.channelId === "string"
      ? body.channelId
      : null;
  const parsed = sendMessageSchema.safeParse(body);
  if (channelId === null || !parsed.success) {
    return NextResponse.json(
      { error: parsed.success ? "A channel is required." : parsed.error.issues[0]?.message ?? "Invalid message." },
      { status: 400 },
    );
  }
  if (parsed.data.attachmentTicketIds.length && !storageConfigured()) {
    return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
  }

  try {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        type: "TEXT",
        server: { members: { some: { userId: user.id } } },
      },
      select: { id: true },
    });
    if (!channel) return NextResponse.json({ error: "Channel not found." }, { status: 404 });

    const message = await prisma.$transaction(async (transaction) => {
      const created = await transaction.message.create({
        data: { channelId: channel.id, authorId: user.id, content: parsed.data.content },
        select: { id: true },
      });
      await attachUploadTickets(transaction, user.id, parsed.data.attachmentTicketIds, { messageId: created.id });
      return transaction.message.findUniqueOrThrow({
        where: { id: created.id },
        select: {
          id: true,
          content: true,
          createdAt: true,
          author: { select: { id: true, username: true, displayName: true } },
          attachments: {
            select: { id: true, fileName: true, mimeType: true, size: true, storageKey: true },
          },
        },
      });
    });

    const serverMembers = await prisma.serverMember.findMany({
      where: { server: { channels: { some: { id: channel.id } } }, userId: { not: user.id } },
      select: { userId: true },
    });
    await prisma.notification.createMany({
      data: serverMembers.map(({ userId }) => ({
        userId,
        type: "CHANNEL_MESSAGE",
        payload: { channelId: channel.id, messageId: message.id, authorId: user.id },
      })),
    });
    const result = {
      ...message,
      attachments: await Promise.all(message.attachments.map(async ({ storageKey, ...attachment }) => ({
        ...attachment,
        url: await createDownloadUrl(storageKey),
      }))),
    };
    await emitRealtime(`channel:${channel.id}`, "message:new", { channelId: channel.id, message: result });
    await Promise.all(serverMembers.map(({ userId }) =>
      emitRealtime(`user:${userId}`, "notification:new", {
        type: "CHANNEL_MESSAGE",
        channelId: channel.id,
        messageId: message.id,
        authorId: user.id,
      }),
    ));
    return NextResponse.json({ message: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("upload")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("create message route error", error);
    return NextResponse.json({ error: "Unable to send your message right now." }, { status: 500 });
  }
}
