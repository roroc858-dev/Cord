import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createChannelSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }

  const serverId =
    typeof body === "object" && body !== null && "serverId" in body && typeof body.serverId === "string"
      ? body.serverId
      : null;
  const parsed = createChannelSchema.safeParse(body);
  if (serverId === null || !parsed.success) {
    return NextResponse.json(
      { error: parsed.success ? "A server is required." : parsed.error.issues[0]?.message ?? "Invalid channel." },
      { status: 400 },
    );
  }

  try {
    const membership = await prisma.serverMember.findFirst({
      where: {
        serverId,
        userId: user.id,
        role: { in: ["OWNER", "ADMIN", "MODERATOR"] },
      },
      select: { serverId: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Server not found or you cannot manage its channels." }, { status: 404 });
    }

    const channel = await prisma.channel.create({
      data: {
        serverId: membership.serverId,
        name: parsed.data.name,
        type: parsed.data.type,
      },
      select: { id: true, name: true, type: true },
    });

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "A channel with that name already exists." }, { status: 409 });
    }
    console.error("create channel route error", error);
    return NextResponse.json({ error: "Unable to create the channel right now." }, { status: 500 });
  }
}
