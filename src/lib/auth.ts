import { createHash, randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const cookieName = "cord_session";
const sessionLifetime = 60 * 60 * 24 * 7;

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters.");
  return new TextEncoder().encode(secret);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${sessionLifetime}s`)
    .sign(secretKey());
  const jar = await cookies();
  jar.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: sessionLifetime,
  });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(cookieName);
}

export async function getSessionUser() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, username: true, displayName: true, avatarUrl: true, bio: true, presence: true, emailVerifiedAt: true, createdAt: true },
    });
  } catch {
    return null;
  }
}

export async function deliverAccountLink(email: string, subject: string, link: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (apiKey && from) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject, html: `<p>Continue to Cord:</p><p><a href="${link}">${link}</a></p>` }),
    });
    if (!response.ok) throw new Error(`Email provider rejected delivery (${response.status}).`);
    return;
  }
  if (process.env.NODE_ENV === "production") throw new Error("Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.");
  console.info(`[Cord email: ${subject}] ${link}`);
}
