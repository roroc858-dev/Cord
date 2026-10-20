import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.DEMO_EMAIL?.trim().toLowerCase();
  const username = process.env.DEMO_USERNAME?.trim().toLowerCase();
  const password = process.env.DEMO_PASSWORD;

  if (!email || !username || !password || password.length < 12) {
    throw new Error("Set DEMO_EMAIL, DEMO_USERNAME, and a DEMO_PASSWORD with at least 12 characters before seeding.");
  }

  const samplePassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      username,
      displayName: "Cord Demo",
      passwordHash: samplePassword,
      emailVerifiedAt: new Date(),
      presence: "ONLINE",
    },
    create: {
      email,
      username,
      displayName: "Cord Demo",
      bio: "Ready to test the Cord experience.",
      passwordHash: samplePassword,
      emailVerifiedAt: new Date(),
      presence: "ONLINE",
    },
  });

  const server = await prisma.server.upsert({
    where: { id: "demo-server" },
    update: {},
    create: {
      id: "demo-server",
      name: "Cord Community",
      description: "A polished demo space for launch feedback.",
      isPublic: true,
      ownerId: user.id,
      channels: {
        create: [{ name: "general", type: "TEXT" }, { name: "introductions", type: "TEXT" }],
      },
      members: {
        create: [{ userId: user.id, role: "OWNER" }],
      },
    },
  });

  console.info(`Seeded demo account ${user.email} and server ${server.name}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
