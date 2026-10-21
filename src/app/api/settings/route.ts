import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("get account settings route error", error);
    return NextResponse.json({ error: "Unable to load account settings." }, { status: 500 });
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
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid settings." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;

  const allowed = ["allowFriendRequests", "allowDirectMessages", "emailNotifications", "browserNotifications"] as const;
  const data: Partial<Record<(typeof allowed)[number], boolean>> = {};
  for (const key of allowed) {
    if (key in input) {
      if (typeof input[key] !== "boolean") {
        return NextResponse.json({ error: `${key} must be true or false.` }, { status: 400 });
      }
      data[key] = input[key];
    }
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "No settings were provided." }, { status: 400 });

  try {
    const settings = await prisma.userSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("update account settings route error", error);
    return NextResponse.json({ error: "Unable to save account settings." }, { status: 500 });
  }
}
