import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const acceptedFriendships = await prisma.friendship.findMany({
      where: { status: "ACCEPTED", OR: [{ fromId: user.id }, { toId: user.id }] },
      select: { fromId: true, toId: true },
    });
    const friendIds = new Set(
      acceptedFriendships.map(({ fromId, toId }) => fromId === user.id ? toId : fromId),
    );
    const conversations = await prisma.directConversation.findMany({
      where: { members: { some: { userId: user.id } } },
      include: {
        members: {
          where: { userId: { not: user.id } },
          select: {
            lastReadAt: true,
            user: { select: { id: true, username: true, displayName: true, presence: true } },
          },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, content: true, createdAt: true, authorId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      conversations: conversations.filter((conversation) =>
        conversation.members.some((member) => friendIds.has(member.user.id)),
      ).map((conversation) => ({
        id: conversation.id,
        isGroup: conversation.isGroup,
        members: conversation.members.map((member) => ({
          ...member.user,
          lastReadAt: member.lastReadAt,
        })),
        latestMessage: conversation.messages[0] ?? null,
      })),
    });
  } catch (error) {
    console.error("list conversations route error", error);
    return NextResponse.json({ error: "Unable to load direct messages." }, { status: 500 });
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
  const friendId =
    typeof body === "object" && body !== null && "friendId" in body && typeof body.friendId === "string"
      ? body.friendId
      : null;
  if (!friendId || friendId === user.id) {
    return NextResponse.json({ error: "Choose a valid friend to message." }, { status: 400 });
  }

  try {
    const friendship = await prisma.friendship.findFirst({
      where: {
        status: "ACCEPTED",
        OR: [{ fromId: user.id, toId: friendId }, { fromId: friendId, toId: user.id }],
      },
      select: { id: true },
    });
    if (!friendship) return NextResponse.json({ error: "Direct messages are only available to friends." }, { status: 403 });

    const settings = await prisma.userSettings.findUnique({
      where: { userId: friendId },
      select: { allowDirectMessages: true },
    });
    if (settings?.allowDirectMessages === false) {
      return NextResponse.json({ error: "This user is not accepting direct messages." }, { status: 403 });
    }

    const conversationKey = [user.id, friendId].sort().join(":");
    const conversation = await prisma.directConversation.upsert({
      where: { conversationKey },
      create: {
        conversationKey,
        members: { create: [{ userId: user.id }, { userId: friendId }] },
      },
      update: {},
      include: {
        members: {
          select: {
            lastReadAt: true,
            user: { select: { id: true, username: true, displayName: true, presence: true } },
          },
        },
      },
    });
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    console.error("create conversation route error", error);
    return NextResponse.json({ error: "Unable to start a direct message." }, { status: 500 });
  }
}
