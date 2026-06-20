import { ApiError, err, ok, sanitizeName } from "@/lib/api";
import { makeId, makeRoomCode, makeToken } from "@/lib/ids";
import { createGame } from "@/lib/poker/engine";
import { roomExists, saveRoom } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = sanitizeName(body.name);
    const startingChips = clampInt(body.startingChips, 1000, 100, 1_000_000);
    let bigBlind = clampInt(body.bigBlind, 20, 2, Math.max(2, Math.floor(startingChips / 2)));
    let smallBlind = clampInt(body.smallBlind, Math.floor(bigBlind / 2), 1, bigBlind);
    if (smallBlind > bigBlind) smallBlind = Math.floor(bigBlind / 2) || 1;

    // Find an unused room code.
    let code = "";
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = makeRoomCode(4 + (attempt >= 4 ? 1 : 0));
      if (!(await roomExists(candidate))) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new ApiError("Could not allocate a room. Try again.", 500);

    const hostId = makeId();
    const hostToken = makeToken();
    const state = createGame({
      code,
      hostId,
      hostToken,
      hostName: name,
      startingChips,
      smallBlind,
      bigBlind,
    });
    await saveRoom(state);

    return ok({ code, playerId: hostId, token: hostToken });
  } catch (e) {
    if (e instanceof ApiError) return err(e.message, e.status);
    console.error(e);
    return err("Something went wrong creating the table.", 500);
  }
}
