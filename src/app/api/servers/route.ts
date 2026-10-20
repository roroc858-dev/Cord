import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createServerSchema } from "@/lib/validation";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const servers = await prisma.server.findMany({
    where: { members: { some: { userId: user.id } } },
    include: { channels: { take: 5 }, _count: { select: { members: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ servers });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const parsed = createServerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid server payload." }, { status: 400 });
  }

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
}
