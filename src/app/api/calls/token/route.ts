import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

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
  if (!channelId) return NextResponse.json({ error: "A voice channel is required." }, { status: 400 });

  const livekitUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!livekitUrl || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Community calls are not configured yet. Set the LiveKit environment variables." }, { status: 503 });
  }

  try {
    const channel = await prisma.channel.findFirst({
      where: {
        id: channelId,
        type: "VOICE",
        server: { members: { some: { userId: user.id } } },
      },
      select: { id: true },
    });
    if (!channel) return NextResponse.json({ error: "Voice channel not found." }, { status: 404 });

    const token = new AccessToken(apiKey, apiSecret, {
      identity: user.id,
      name: user.displayName || user.username,
      ttl: "1h",
    });
    token.addGrant({
      roomJoin: true,
      room: `cord-channel-${channel.id}`,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });
    return NextResponse.json({ url: livekitUrl, token: await token.toJwt() });
  } catch (error) {
    console.error("create call token route error", error);
    return NextResponse.json({ error: "Unable to join the community call." }, { status: 500 });
  }
}
