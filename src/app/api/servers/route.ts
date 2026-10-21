import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createServerSchema } from "@/lib/validation";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const servers = await prisma.server.findMany({
      where: { members: { some: { userId: user.id } } },
      include: {
        channels: { orderBy: { createdAt: "asc" } },
        members: {
          select: {
            role: true,
            user: { select: { id: true, username: true, displayName: true, presence: true } },
          },
          orderBy: { joinedAt: "asc" },
        },
        _count: { select: { members: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ servers });
  } catch (error) {
    console.error("list servers route error", error);
    return NextResponse.json({ error: "Unable to load your servers right now." }, { status: 500 });
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
  const parsed = createServerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid server payload." }, { status: 400 });
  }

  try {
    const server = await prisma.server.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        isPublic: parsed.data.isPublic,
        ownerId: user.id,
        members: {
          create: [{ userId: user.id, role: "OWNER" }],
        },
        channels: {
          create: [{ name: "general", type: "TEXT" }],
        },
      },
      include: { channels: true },
    });

    return NextResponse.json({ server }, { status: 201 });
  } catch (error) {
    console.error("create server route error", error);
    return NextResponse.json({ error: "Unable to create your server right now." }, { status: 500 });
  }
}
