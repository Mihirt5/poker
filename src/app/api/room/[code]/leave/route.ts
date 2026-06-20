import { ApiError, authPlayer, err, ok } from "@/lib/api";
import { removePlayer } from "@/lib/poker/engine";
import { getRoom, saveRoom, withRoomLock } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = (await params).code.toUpperCase();
    const playerId = String(body.playerId ?? "");
    const token = String(body.token ?? "");

    await withRoomLock(code, async () => {
      const s = await getRoom(code);
      if (!s) return;
      authPlayer(s, playerId, token);
      removePlayer(s, playerId);
      s.version += 1;
      await saveRoom(s);
    });

    return ok({ ok: true });
  } catch (e) {
    if (e instanceof ApiError) return err(e.message, e.status);
    console.error(e);
    return err("Failed to leave the table.", 500);
  }
}
