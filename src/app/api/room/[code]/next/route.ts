import { ApiError, authPlayer, err, ok } from "@/lib/api";
import { canDealNextHand, startHand } from "@/lib/poker/engine";
import { toPublicState } from "@/lib/poker/serialize";
import { getRoom, saveRoom, withRoomLock } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deal the next hand. Idempotent: only acts when a hand is over.
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = (await params).code.toUpperCase();
    const playerId = String(body.playerId ?? "");
    const token = String(body.token ?? "");

    const state = await withRoomLock(code, async () => {
      const s = await getRoom(code);
      if (!s) throw new ApiError("Table not found.", 404);
      authPlayer(s, playerId, token);
      // Host can deal immediately; others only once the handover delay passed.
      const isHost = s.hostId === playerId;
      if (s.stage === "handover" || s.stage === "waiting") {
        const force = isHost && s.stage !== "waiting";
        if (force || canDealNextHand(s, Date.now())) {
          const funded = s.players.filter((p) => p.chips > 0 && !p.sittingOut).length;
          if (funded >= 2) {
            startHand(s);
            s.version += 1;
            await saveRoom(s);
          }
        }
      }
      return s;
    });

    return ok(toPublicState(state, playerId));
  } catch (e) {
    if (e instanceof ApiError) return err(e.message, e.status);
    console.error(e);
    return err("Failed to deal the next hand.", 500);
  }
}
