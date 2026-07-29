import { ApiError, authPlayer, err, isAdmin, ok } from "@/lib/api";
import { ACTION_TIMEOUT_MS, applyTimeout, canDealNextHand, startHand } from "@/lib/poker/engine";
import { toPublicState } from "@/lib/poker/serialize";
import { getRoom, saveRoom, withRoomLock } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const url = new URL(req.url);
    const playerId = url.searchParams.get("playerId") ?? "";
    const token = url.searchParams.get("token") ?? "";
    const adminSecret = url.searchParams.get("admin") ?? "";
    const code = (await params).code.toUpperCase();

    let state = await getRoom(code);
    if (!state) throw new ApiError("Table not found. It may have expired.", 404);
    authPlayer(state, playerId, token);

    const now = Date.now();
    const needsTimeout =
      ["preflop", "flop", "turn", "river"].includes(state.stage) &&
      state.toActSeat >= 0 &&
      now - state.toActSince >= ACTION_TIMEOUT_MS;
    const needsDeal = canDealNextHand(state, now) && state.stage === "handover";

    if (needsTimeout || needsDeal) {
      state = await withRoomLock(code, async () => {
        const s = await getRoom(code);
        if (!s) throw new ApiError("Table not found.", 404);
        let changed = false;
        if (applyTimeout(s, Date.now())) changed = true;
        if (canDealNextHand(s, Date.now()) && s.stage === "handover") {
          startHand(s);
          changed = true;
        }
        if (changed) {
          s.version += 1;
          await saveRoom(s);
        }
        return s;
      });
    }

    return ok(toPublicState(state, playerId, { revealAll: isAdmin(adminSecret) }));
  } catch (e) {
    if (e instanceof ApiError) return err(e.message, e.status);
    console.error(e);
    return err("Failed to load table state.", 500);
  }
}
