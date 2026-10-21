import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { emitRealtime } from "@/lib/realtime";
import { prisma } from "@/lib/prisma";
import { friendRequestSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const friendships = await prisma.friendship.findMany({
      where: { OR: [{ fromId: user.id }, { toId: user.id }] },
      include: {
        from: { select: { id: true, username: true, displayName: true, presence: true } },
        to: { select: { id: true, username: true, displayName: true, presence: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({
      friends: friendships
        .filter((friendship) => friendship.status === "ACCEPTED")
        .map((friendship) => ({
          id: friendship.id,
          user: friendship.fromId === user.id ? friendship.to : friendship.from,
        })),
      incoming: friendships
        .filter((friendship) => friendship.status === "PENDING" && friendship.toId === user.id)
        .map((friendship) => ({ id: friendship.id, user: friendship.from, createdAt: friendship.createdAt })),
      outgoing: friendships
        .filter((friendship) => friendship.status === "PENDING" && friendship.fromId === user.id)
        .map((friendship) => ({ id: friendship.id, user: friendship.to, createdAt: friendship.createdAt })),
    });
  } catch (error) {
    console.error("list friends route error", error);
    return NextResponse.json({ error: "Unable to load friends right now." }, { status: 500 });
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
  const parsed = friendRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid friend request." }, { status: 400 });
  }

  try {
    const target = await prisma.user.findUnique({
      where: { username: parsed.data.username.toLowerCase() },
      select: { id: true, username: true, displayName: true },
    });
    if (!target) return NextResponse.json({ error: "No user matches that username." }, { status: 404 });
    if (target.id === user.id) return NextResponse.json({ error: "You cannot add yourself." }, { status: 400 });

    const [blockedByUser, blockedTarget] = await Promise.all([
      prisma.blockedUser.findUnique({ where: { blockerId_blockedId: { blockerId: user.id, blockedId: target.id } } }),
      prisma.blockedUser.findUnique({ where: { blockerId_blockedId: { blockerId: target.id, blockedId: user.id } } }),
    ]);
    if (blockedByUser || blockedTarget) {
      return NextResponse.json({ error: "This friend request is not available." }, { status: 403 });
    }

    const settings = await prisma.userSettings.findUnique({
      where: { userId: target.id },
      select: { allowFriendRequests: true },
    });
    if (settings?.allowFriendRequests === false) {
      return NextResponse.json({ error: "This user is not accepting friend requests." }, { status: 403 });
    }

    const reverse = await prisma.friendship.findUnique({
      where: { fromId_toId: { fromId: target.id, toId: user.id } },
    });
    if (reverse?.status === "PENDING") {
      const [friendship] = await prisma.$transaction(async (transaction) => {
        const accepted = await transaction.friendship.update({
          where: { id: reverse.id },
          data: { status: "ACCEPTED" },
        });
        const conversationKey = [user.id, target.id].sort().join(":");
        await transaction.directConversation.upsert({
          where: { conversationKey },
          create: {
            conversationKey,
            members: { create: [{ userId: user.id }, { userId: target.id }] },
          },
          update: {},
        });
        await transaction.notification.create({
          data: {
            userId: target.id,
            type: "FRIEND_ACCEPTED",
            payload: { friendshipId: accepted.id, fromUserId: user.id, username: user.username },
          },
        });
        return [accepted] as const;
      });
      await emitRealtime(`user:${target.id}`, "friend:accepted", { friendshipId: friendship.id });
      await emitRealtime(`user:${target.id}`, "notification:new", { type: "FRIEND_ACCEPTED" });
      return NextResponse.json({ friendship, accepted: true });
    }
    if (reverse?.status === "ACCEPTED") {
      return NextResponse.json({ error: "You are already friends." }, { status: 409 });
    }

    const friendship = await prisma.friendship.upsert({
      where: { fromId_toId: { fromId: user.id, toId: target.id } },
      create: { fromId: user.id, toId: target.id },
      update: { status: "PENDING" },
    });
    await prisma.notification.create({
      data: {
        userId: target.id,
        type: "FRIEND_REQUEST",
        payload: { friendshipId: friendship.id, fromUserId: user.id, username: user.username },
      },
    });
    await emitRealtime(`user:${target.id}`, "notification:new", {
      type: "FRIEND_REQUEST",
      friendshipId: friendship.id,
      username: user.username,
    });
    return NextResponse.json({ friendship }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A friend request already exists." }, { status: 409 });
    }
    console.error("create friend request route error", error);
    return NextResponse.json({ error: "Unable to send the friend request." }, { status: 500 });
  }
}
