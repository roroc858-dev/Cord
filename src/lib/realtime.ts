import { Emitter } from "@socket.io/redis-emitter";
import { createClient, type RedisClientType } from "redis";

type RealtimeGlobals = typeof globalThis & {
  cordRedisEmitter?: Promise<Emitter>;
};

const realtimeGlobals = globalThis as RealtimeGlobals;
let warnedMissingRedis = false;

export function realtimeConfigured() {
  return Boolean(process.env.REDIS_URL && process.env.REALTIME_URL);
}

async function getRedisEmitter() {
  if (!realtimeGlobals.cordRedisEmitter) {
    const client: RedisClientType = createClient({ url: process.env.REDIS_URL });
    client.on("error", (error) => console.error("realtime Redis client error", error));
    const emitterPromise = client.connect().then(() => new Emitter(client));
    realtimeGlobals.cordRedisEmitter = emitterPromise;
    try {
      return await emitterPromise;
    } catch (error) {
      if (realtimeGlobals.cordRedisEmitter === emitterPromise) {
        delete realtimeGlobals.cordRedisEmitter;
      }
      throw error;
    }
  }
  return realtimeGlobals.cordRedisEmitter;
}

export async function emitRealtime(room: string, event: string, payload: unknown) {
  if (!process.env.REDIS_URL) {
    if (!warnedMissingRedis) {
      console.warn("Realtime events are not being published because REDIS_URL is not configured.");
      warnedMissingRedis = true;
    }
    return false;
  }
  try {
    const emitter = await getRedisEmitter();
    emitter.to(room).emit(event, payload);
    return true;
  } catch (error) {
    console.error("realtime event publish error", error);
    return false;
  }
}

export function realtimeUrl() {
  return process.env.REALTIME_URL ?? null;
}
