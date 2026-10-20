import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const result = registerSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: result.error.issues[0]?.message ?? "Invalid registration data." }, { status: 400 });
    }

    const { email, username, password } = result.data;
    const emailLower = email.toLowerCase();
    const usernameLower = username.toLowerCase();

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ email: emailLower }, { username: usernameLower }] },
    });

    if (existingUser) {
      return NextResponse.json({ error: "An account with that email or username already exists." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.create({
      data: {
        email: emailLower,
        username: usernameLower,
        displayName: username,
        passwordHash,
        bio: "New to Cord.",
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("register route error", error);
    return NextResponse.json({ error: "Server error while creating your account." }, { status: 500 });
  }
}
