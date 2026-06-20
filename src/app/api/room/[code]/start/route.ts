import { ApiError, authPlayer, err, ok } from "@/lib/api";
import { startHand } from "@/lib/poker/engine";
import { toPublicState } from "@/lib/poker/serialize";
import { getRoom, saveRoom, withRoomLock } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = (await params).code.toUpperCase();
    const playerId = String(body.playerId ?? "");
    const token = String(body.token ?? "");

    const state = await withRoomLock(code, async () => {
      const s = await getRoom(code);
      if (!s) throw new ApiError("Table not found.", 404);
      const p = authPlayer(s, playerId, token);
      if (s.hostId !== p.id) throw new ApiError("Only the host can start the game.", 403);
      if (s.stage !== "waiting" && s.stage !== "handover") {
        throw new ApiError("A hand is already in progress.", 409);
      }
      const funded = s.players.filter((x) => x.chips > 0 && !x.sittingOut).length;
      if (funded < 2) throw new ApiError("Need at least 2 players to start.", 409);
      startHand(s);
      s.version += 1;
      await saveRoom(s);
      return s;
    });

    return ok(toPublicState(state, playerId));
  } catch (e) {
    if (e instanceof ApiError) return err(e.message, e.status);
    console.error(e);
    return err("Failed to start the hand.", 500);
  }
}
