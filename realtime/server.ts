import { loadEnvConfig } from "@next/env";
import { createAdapter } from "@socket.io/redis-adapter";
import { jwtVerify } from "jose";
import { createServer } from "node:http";
import { createClient } from "redis";
import { Server } from "socket.io";
import { prisma } from "../src/lib/prisma";

loadEnvConfig(process.cwd());

const port = Number(process.env.PORT ?? process.env.REALTIME_PORT ?? 3001);
const origins = (process.env.REALTIME_ALLOWED_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const secret = process.env.AUTH_SECRET;
const redisUrl = process.env.REDIS_URL;

if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set to at least 32 characters.");
if (!redisUrl) throw new Error("REDIS_URL is required by the realtime service.");
if (!origins.length) throw new Error("Set REALTIME_ALLOWED_ORIGIN to the Cord web app origin.");

async function startRealtimeService() {
const redisPublisher = createClient({ url: redisUrl });
const redisSubscriber = redisPublisher.duplicate();
redisPublisher.on("error", (error) => console.error("realtime Redis publisher error", error));
redisSubscriber.on("error", (error) => console.error("realtime Redis subscriber error", error));
await Promise.all([redisPublisher.connect(), redisSubscriber.connect()]);

type SocketUser = { id: string; username: string };
const httpServer = createServer(async (request, response) => {
  if (request.url === "/health") {
    try {
      const [redisStatus] = await Promise.all([
        redisPublisher.ping(),
        prisma.$queryRaw`SELECT 1`,
      ]);
      if (redisStatus !== "PONG") throw new Error("Redis health check failed.");
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
    } catch (error) {
      console.error("realtime health check failed", error);
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "unavailable" }));
    }
    return;
  }
  response.writeHead(404);
  response.end();
});

const io = new Server(httpServer, {
  cors: { origin: origins, methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e5,
  adapter: createAdapter(redisPublisher, redisSubscriber),
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (typeof token !== "string") {
    next(new Error("Unauthorized"));
    return;
  }
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      issuer: "cord",
      audience: "cord-realtime",
    });
    if (typeof payload.sub !== "string") throw new Error("Invalid realtime identity.");
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, username: true },
    });
    if (!user) throw new Error("Account not found.");
    socket.data.user = user satisfies SocketUser;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

async function notifyFriends(user: SocketUser, event: string) {
  const friends = await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ fromId: user.id }, { toId: user.id }],
    },
    select: { fromId: true, toId: true },
  });
  for (const friendship of friends) {
    const friendId = friendship.fromId === user.id ? friendship.toId : friendship.fromId;
    io.to(`user:${friendId}`).emit("presence:changed", {
      userId: user.id,
      presence: event,
    });
  }
}

io.on("connection", (socket) => {
  const user = socket.data.user as SocketUser;
  const userRoom = `user:${user.id}`;
  socket.join(userRoom);

  void prisma.user.findUnique({ where: { id: user.id }, select: { presence: true } })
    .then(async (account) => {
      if (!account || account.presence === "DND" || account.presence === "INVISIBLE") return;
      await prisma.user.update({ where: { id: user.id }, data: { presence: "ONLINE" } });
      await notifyFriends(user, "ONLINE");
    })
    .catch((error: unknown) => console.error("realtime online presence update error", error));

  socket.on("channel:join", async (channelId: unknown, acknowledge?: (result: { ok: boolean }) => void) => {
    if (typeof channelId !== "string" || channelId.length > 64) {
      acknowledge?.({ ok: false });
      return;
    }
    try {
      const membership = await prisma.channel.findFirst({
        where: { id: channelId, server: { members: { some: { userId: user.id } } } },
        select: { id: true },
      });
      if (!membership) {
        acknowledge?.({ ok: false });
        return;
      }
      await socket.join(`channel:${channelId}`);
      acknowledge?.({ ok: true });
    } catch (error) {
      console.error("realtime channel authorization error", error);
      acknowledge?.({ ok: false });
    }
  });

  socket.on("channel:leave", (channelId: unknown) => {
    if (typeof channelId === "string" && channelId.length <= 64) {
      void socket.leave(`channel:${channelId}`);
    }
  });

  socket.on("channel:typing", (payload: unknown) => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("channelId" in payload) ||
      typeof payload.channelId !== "string" ||
      payload.channelId.length > 64 ||
      !("typing" in payload) ||
      typeof payload.typing !== "boolean" ||
      !socket.rooms.has(`channel:${payload.channelId}`)
    ) return;
    socket.to(`channel:${payload.channelId}`).emit("channel:typing", {
      channelId: payload.channelId,
      userId: user.id,
      username: user.username,
      typing: payload.typing,
    });
  });

  socket.on("conversation:join", async (conversationId: unknown, acknowledge?: (result: { ok: boolean }) => void) => {
    if (typeof conversationId !== "string" || conversationId.length > 64) {
      acknowledge?.({ ok: false });
      return;
    }
    try {
      const membership = await prisma.conversationMember.findFirst({
        where: { conversationId, userId: user.id },
        select: { conversationId: true },
      });
      if (!membership) {
        acknowledge?.({ ok: false });
        return;
      }
      await socket.join(`conversation:${conversationId}`);
      acknowledge?.({ ok: true });
    } catch (error) {
      console.error("realtime conversation authorization error", error);
      acknowledge?.({ ok: false });
    }
  });

  socket.on("conversation:leave", (conversationId: unknown) => {
    if (typeof conversationId === "string" && conversationId.length <= 64) {
      void socket.leave(`conversation:${conversationId}`);
    }
  });

  socket.on("conversation:typing", (payload: unknown) => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("conversationId" in payload) ||
      typeof payload.conversationId !== "string" ||
      payload.conversationId.length > 64 ||
      !("typing" in payload) ||
      typeof payload.typing !== "boolean" ||
      !socket.rooms.has(`conversation:${payload.conversationId}`)
    ) return;
    socket.to(`conversation:${payload.conversationId}`).emit("conversation:typing", {
      conversationId: payload.conversationId,
      userId: user.id,
      username: user.username,
      typing: payload.typing,
    });
  });

  socket.on("disconnecting", () => {
    for (const room of socket.rooms) {
      if (room.startsWith("channel:")) {
        io.to(room).emit("channel:typing", {
          channelId: room.slice("channel:".length),
          userId: user.id,
          username: user.username,
          typing: false,
        });
      } else if (room.startsWith("conversation:")) {
        io.to(room).emit("conversation:typing", {
          conversationId: room.slice("conversation:".length),
          userId: user.id,
          username: user.username,
          typing: false,
        });
      }
    }
  });

  socket.on("disconnect", () => {
    void (async () => {
      try {
        const remaining = await io.in(userRoom).fetchSockets();
        if (!remaining.length) {
          const updated = await prisma.user.updateMany({
            where: { id: user.id, presence: "ONLINE" },
            data: { presence: "OFFLINE" },
          });
          if (updated.count) await notifyFriends(user, "OFFLINE");
        }
      } catch (error) {
        console.error("realtime offline presence update error", error);
      }
    })();
  });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.info(`Cord realtime service listening on ${port}`);
});

async function shutdown() {
  io.close();
  await Promise.all([redisPublisher.quit(), redisSubscriber.quit(), prisma.$disconnect()]);
  process.exit(0);
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
}

void startRealtimeService().catch((error: unknown) => {
  console.error("Cord realtime service startup failed", error);
  process.exitCode = 1;
});
