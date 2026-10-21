import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { emitRealtime } from "@/lib/realtime";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    return NextResponse.json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("list notifications route error", error);
    return NextResponse.json({ error: "Unable to load notifications." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
  }
  const notificationId =
    typeof body === "object" && body !== null && "notificationId" in body &&
    typeof body.notificationId === "string" ? body.notificationId : null;

  try {
    const result = notificationId
      ? await prisma.notification.updateMany({
          where: { id: notificationId, userId: user.id, readAt: null },
          data: { readAt: new Date() },
        })
      : await prisma.notification.updateMany({
          where: { userId: user.id, readAt: null },
          data: { readAt: new Date() },
        });
    await emitRealtime(`user:${user.id}`, "notification:read", { notificationId });
    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error("mark notifications read route error", error);
    return NextResponse.json({ error: "Unable to update notifications." }, { status: 500 });
  }
}
