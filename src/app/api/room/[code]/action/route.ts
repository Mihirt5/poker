import { ApiError, authPlayer, err, ok } from "@/lib/api";
import { applyAction, GameError } from "@/lib/poker/engine";
import { toPublicState } from "@/lib/poker/serialize";
import type { ActionType } from "@/lib/types";
import { getRoom, saveRoom, withRoomLock } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID: ActionType[] = ["fold", "check", "call", "raise", "allin"];

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = (await params).code.toUpperCase();
    const playerId = String(body.playerId ?? "");
    const token = String(body.token ?? "");
    const action = String(body.action ?? "") as ActionType;
    const amount = body.amount != null ? Number(body.amount) : undefined;

    if (!VALID.includes(action)) throw new ApiError("Invalid action.");

    const state = await withRoomLock(code, async () => {
      const s = await getRoom(code);
      if (!s) throw new ApiError("Table not found.", 404);
      const p = authPlayer(s, playerId, token);
      try {
        applyAction(s, p.id, action, amount);
      } catch (e) {
        if (e instanceof GameError) throw new ApiError(e.message, 409);
        throw e;
      }
      s.version += 1;
      await saveRoom(s);
      return s;
    });

    return ok(toPublicState(state, playerId));
  } catch (e) {
    if (e instanceof ApiError) return err(e.message, e.status);
    console.error(e);
    return err("Failed to apply your action.", 500);
  }
}
