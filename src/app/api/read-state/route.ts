import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { emitRealtime } from "@/lib/realtime";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const channelId = request.nextUrl.searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "A channel is required." }, { status: 400 });

  try {
    const membership = await prisma.serverMember.findFirst({
      where: { userId: user.id, server: { channels: { some: { id: channelId } } } },
      select: { serverId: true },
    });
    if (!membership) return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    const readStates = await prisma.messageReadState.findMany({
      where: { channelId, user: { memberships: { some: { serverId: membership.serverId } } } },
      select: {
        lastReadAt: true,
        user: { select: { id: true, username: true, displayName: true } },
      },
    });
    return NextResponse.json({ readStates });
  } catch (error) {
    console.error("get read states route error", error);
    return NextResponse.json({ error: "Unable to load read receipts." }, { status: 500 });
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
  if (!channelId) return NextResponse.json({ error: "A channel is required." }, { status: 400 });

  try {
    const membership = await prisma.channel.findFirst({
      where: { id: channelId, server: { members: { some: { userId: user.id } } } },
      select: { id: true },
    });
    if (!membership) return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    const state = await prisma.messageReadState.upsert({
      where: { userId_channelId: { userId: user.id, channelId } },
      create: { userId: user.id, channelId, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
      select: { lastReadAt: true },
    });
    await emitRealtime(`channel:${channelId}`, "channel:read", {
      channelId,
      userId: user.id,
      lastReadAt: state.lastReadAt.toISOString(),
    });
    return NextResponse.json({ lastReadAt: state.lastReadAt });
  } catch (error) {
    console.error("update read state route error", error);
    return NextResponse.json({ error: "Unable to save read receipt." }, { status: 500 });
  }
}
