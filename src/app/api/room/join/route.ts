import { ApiError, err, ok, sanitizeName } from "@/lib/api";
import { makeId, makeToken } from "@/lib/ids";
import { addPlayer, GameError, MAX_PLAYERS } from "@/lib/poker/engine";
import { getRoom, saveRoom, withRoomLock } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const name = sanitizeName(body.name);
    const code = String(body.code ?? "").trim().toUpperCase();
    if (!code) throw new ApiError("Enter a room code.");

    const result = await withRoomLock(code, async () => {
      const state = await getRoom(code);
      if (!state) throw new ApiError("No table found with that code.", 404);
      if (state.players.length >= MAX_PLAYERS) {
        throw new ApiError("That table is full.", 409);
      }
      const playerId = makeId();
      const token = makeToken();
      try {
        addPlayer(state, { id: playerId, token, name });
      } catch (e) {
        if (e instanceof GameError) throw new ApiError(e.message, 409);
        throw e;
      }
      state.version += 1;
      await saveRoom(state);
      return { code, playerId, token };
    });

    return ok(result);
  } catch (e) {
    if (e instanceof ApiError) return err(e.message, e.status);
    console.error(e);
    return err("Something went wrong joining the table.", 500);
  }
}
