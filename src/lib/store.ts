import { Redis } from "@upstash/redis";
import type { GameState } from "./types";

const ROOM_TTL_SECONDS = 60 * 60 * 12; // rooms expire after 12h idle
const LOCK_TTL_MS = 5_000;
const LOCK_WAIT_MS = 4_000;

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const useRedis = Boolean(url && token);

let redis: Redis | null = null;
if (useRedis) {
  redis = new Redis({ url: url!, token: token! });
}

// ---- In-memory fallback (single-process only; for local dev) ----
type MemEntry = { value: string; expiresAt: number };
const mem = new Map<string, MemEntry>();
const memLocks = new Map<string, number>(); // key -> lock expiry ms

if (!useRedis && typeof console !== "undefined") {
  // Warn once at module load.
  console.warn(
    "[store] UPSTASH_REDIS_REST_URL/TOKEN not set — using in-memory store. " +
      "This only works for a single dev server and resets on restart. " +
      "Set Upstash credentials for real multiplayer / Vercel."
  );
}

function memGet(key: string): string | null {
  const e = mem.get(key);
  if (!e) return null;
  if (e.expiresAt < Date.now()) {
    mem.delete(key);
    return null;
  }
  return e.value;
}

function memSet(key: string, value: string, ttlSeconds: number) {
  mem.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// ---- Public API ----

function roomKey(code: string): string {
  return `room:${code.toUpperCase()}`;
}

export async function getRoom(code: string): Promise<GameState | null> {
  const key = roomKey(code);
  if (redis) {
    const raw = await redis.get<string>(key);
    if (!raw) return null;
    return typeof raw === "string" ? (JSON.parse(raw) as GameState) : (raw as GameState);
  }
  const raw = memGet(key);
  return raw ? (JSON.parse(raw) as GameState) : null;
}

export async function saveRoom(state: GameState): Promise<void> {
  const key = roomKey(state.code);
  const payload = JSON.stringify(state);
  if (redis) {
    await redis.set(key, payload, { ex: ROOM_TTL_SECONDS });
    return;
  }
  memSet(key, payload, ROOM_TTL_SECONDS);
}

export async function roomExists(code: string): Promise<boolean> {
  const key = roomKey(code);
  if (redis) {
    return (await redis.exists(key)) === 1;
  }
  return memGet(key) !== null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Acquire a short-lived lock for a room, run fn, release. Retries briefly.
export async function withRoomLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
  const lockKey = `lock:${roomKey(code)}`;
  const deadline = Date.now() + LOCK_WAIT_MS;
  const token = Math.random().toString(36).slice(2);

  while (Date.now() < deadline) {
    const acquired = await acquireLock(lockKey, token);
    if (acquired) {
      try {
        return await fn();
      } finally {
        await releaseLock(lockKey, token);
      }
    }
    await sleep(50 + Math.floor(Math.random() * 50));
  }
  throw new Error("Server busy — please try again.");
}

async function acquireLock(lockKey: string, token: string): Promise<boolean> {
  if (redis) {
    const res = await redis.set(lockKey, token, { nx: true, px: LOCK_TTL_MS });
    return res === "OK";
  }
  const now = Date.now();
  const exp = memLocks.get(lockKey);
  if (exp && exp > now) return false;
  memLocks.set(lockKey, now + LOCK_TTL_MS);
  return true;
}

async function releaseLock(lockKey: string, token: string): Promise<void> {
  if (redis) {
    // Best-effort: only delete if we still own it.
    const current = await redis.get<string>(lockKey);
    if (current === token) await redis.del(lockKey);
    return;
  }
  memLocks.delete(lockKey);
}
