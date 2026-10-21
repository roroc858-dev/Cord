import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { attachUploadTickets } from "@/lib/message-attachments";
import { emitRealtime } from "@/lib/realtime";
import { prisma } from "@/lib/prisma";
import { createDownloadUrl, storageConfigured } from "@/lib/storage";
import { directMessageSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { conversationId } = await context.params;

  try {
    const membership = await prisma.conversationMember.findFirst({
      where: { conversationId, userId: user.id },
      select: {
        conversationId: true,
        conversation: { select: { members: { select: { userId: true } } } },
      },
    });
    if (!membership) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const otherUserId = membership.conversation.members.find(({ userId }) => userId !== user.id)?.userId;
    const friendship = otherUserId
      ? await prisma.friendship.findFirst({
          where: {
            status: "ACCEPTED",
            OR: [{ fromId: user.id, toId: otherUserId }, { fromId: otherUserId, toId: user.id }],
          },
          select: { id: true },
        })
      : null;
    if (!friendship) return NextResponse.json({ error: "This direct conversation is no longer available." }, { status: 403 });

    const [newestMessages] = await Promise.all([
      prisma.directMessage.findMany({
        where: { conversationId, deletedAt: null },
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
      }),
      prisma.conversationMember.update({
        where: { conversationId_userId: { conversationId, userId: user.id } },
        data: { lastReadAt: new Date() },
      }),
    ]);

    const messages = await Promise.all(newestMessages.reverse().map(async (message) => ({
      ...message,
      attachments: await Promise.all(message.attachments.map(async ({ storageKey, ...attachment }) => ({
        ...attachment,
        url: await createDownloadUrl(storageKey),
      }))),
    })));
    await emitRealtime(`conversation:${conversationId}`, "conversation:read", {
      conversationId,
      userId: user.id,
      lastReadAt: new Date().toISOString(),
    });
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("list direct messages route error", error);
    return NextResponse.json({ error: "Unable to load direct messages." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { conversationId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const parsed = directMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid direct message." }, { status: 400 });
  }
  if (parsed.data.attachmentTicketIds.length && !storageConfigured()) {
    return NextResponse.json({ error: "File storage is not configured." }, { status: 503 });
  }

  try {
    const membership = await prisma.conversationMember.findFirst({
      where: { conversationId, userId: user.id },
      select: { conversation: { select: { members: { select: { userId: true } } } } },
    });
    if (!membership) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const recipientIds = membership.conversation.members
      .map(({ userId }) => userId)
      .filter((userId) => userId !== user.id);
    if (!recipientIds.length) return NextResponse.json({ error: "Conversation has no recipient." }, { status: 400 });

    const [friendship, recipientSettings] = await Promise.all([
      prisma.friendship.findFirst({
        where: {
          status: "ACCEPTED",
          OR: recipientIds.map((recipientId) => ({
            OR: [{ fromId: user.id, toId: recipientId }, { fromId: recipientId, toId: user.id }],
          })),
        },
        select: { id: true },
      }),
      prisma.userSettings.findMany({
        where: { userId: { in: recipientIds }, allowDirectMessages: false },
        select: { userId: true },
      }),
    ]);
    if (!friendship || recipientSettings.length || recipientIds.length !== 1) {
      return NextResponse.json({ error: "Direct messages are unavailable for this conversation." }, { status: 403 });
    }

    const message = await prisma.$transaction(async (transaction) => {
      const created = await transaction.directMessage.create({
        data: { conversationId, authorId: user.id, content: parsed.data.content },
        select: { id: true },
      });
      await attachUploadTickets(transaction, user.id, parsed.data.attachmentTicketIds, { directMessageId: created.id });
      return transaction.directMessage.findUniqueOrThrow({
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

    const result = {
      ...message,
      attachments: await Promise.all(message.attachments.map(async ({ storageKey, ...attachment }) => ({
        ...attachment,
        url: await createDownloadUrl(storageKey),
      }))),
    };
    await prisma.notification.createMany({
      data: recipientIds.map((userId) => ({
        userId,
        type: "DIRECT_MESSAGE",
        payload: { conversationId, messageId: message.id, authorId: user.id },
      })),
    });
    await emitRealtime(`conversation:${conversationId}`, "conversation:message", { conversationId, message: result });
    await Promise.all(recipientIds.map((userId) =>
      emitRealtime(`user:${userId}`, "notification:new", {
        type: "DIRECT_MESSAGE",
        conversationId,
        messageId: message.id,
        authorId: user.id,
      }),
    ));
    return NextResponse.json({ message: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("upload")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("send direct message route error", error);
    return NextResponse.json({ error: "Unable to send the direct message." }, { status: 500 });
  }
}
