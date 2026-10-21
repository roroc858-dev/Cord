import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { realtimeConfigured, realtimeUrl } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const secret = process.env.AUTH_SECRET;
  const url = realtimeUrl();
  if (!secret || secret.length < 32 || !url || !realtimeConfigured()) {
    return NextResponse.json({ enabled: false, url: null, token: null });
  }

  const token = await new SignJWT({ sub: user.id, username: user.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("cord")
    .setAudience("cord-realtime")
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ enabled: true, url, token });
}
