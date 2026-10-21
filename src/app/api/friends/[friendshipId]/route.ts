import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { emitRealtime } from "@/lib/realtime";
import { prisma } from "@/lib/prisma";
import { friendActionSchema } from "@/lib/validation";

type RouteContext = { params: Promise<{ friendshipId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const parsed = friendActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid friend action." }, { status: 400 });
  }
  const { friendshipId } = await context.params;

  try {
    const friendship = await prisma.friendship.findFirst({
      where: { id: friendshipId, toId: user.id, status: "PENDING" },
    });
    if (!friendship) return NextResponse.json({ error: "Friend request not found." }, { status: 404 });
    const updated = await prisma.friendship.update({
      where: { id: friendship.id },
      data: { status: parsed.data.action === "accept" ? "ACCEPTED" : "REJECTED" },
    });
    if (parsed.data.action === "accept") {
      const conversationKey = [friendship.fromId, friendship.toId].sort().join(":");
      await prisma.directConversation.upsert({
        where: { conversationKey },
        create: {
          conversationKey,
          members: { create: [{ userId: friendship.fromId }, { userId: friendship.toId }] },
        },
        update: {},
      });
      await prisma.notification.create({
        data: {
          userId: friendship.fromId,
          type: "FRIEND_ACCEPTED",
          payload: { friendshipId: friendship.id, fromUserId: user.id, username: user.username },
        },
      });
      await emitRealtime(`user:${friendship.fromId}`, "friend:accepted", { friendshipId: friendship.id });
      await emitRealtime(`user:${friendship.fromId}`, "notification:new", { type: "FRIEND_ACCEPTED" });
    }
    return NextResponse.json({ friendship: updated });
  } catch (error) {
    console.error("update friend request route error", error);
    return NextResponse.json({ error: "Unable to update the friend request." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { friendshipId } = await context.params;

  try {
    const friendship = await prisma.friendship.findFirst({
      where: { id: friendshipId, OR: [{ fromId: user.id }, { toId: user.id }] },
      select: { id: true },
    });
    if (!friendship) return NextResponse.json({ error: "Friendship not found." }, { status: 404 });
    await prisma.friendship.delete({ where: { id: friendship.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("remove friend route error", error);
    return NextResponse.json({ error: "Unable to remove this friend." }, { status: 500 });
  }
}
