import { ApiError, authPlayer, err, isAdmin, ok } from "@/lib/api";
import { forceNextCards } from "@/lib/poker/engine";
import { makeDeck } from "@/lib/poker/cards";
import { toPublicState } from "@/lib/poker/serialize";
import type { Card, GameState, RigConfig } from "@/lib/types";
import { getRoom, saveRoom, withRoomLock } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALL_CARDS = new Set<Card>(makeDeck());

// Cards currently held by players or already on the board — can't be forced.
function cardsInUse(state: GameState): Set<Card> {
  const used = new Set<Card>(state.community);
  for (const p of state.players) for (const c of p.holeCards) used.add(c);
  return used;
}

function parseCards(raw: unknown): Card[] {
  if (!Array.isArray(raw)) return [];
  const out: Card[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const c = String(item ?? "").trim();
    // Normalize e.g. "as" -> "As", "10h" -> "Th".
    const norm = normalizeCard(c);
    if (norm && ALL_CARDS.has(norm) && !seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

function normalizeCard(c: string): Card | null {
  let s = c.replace(/\s+/g, "");
  if (!s) return null;
  s = s.replace(/^10/, "T");
  if (s.length !== 2) return null;
  const rank = s[0].toUpperCase();
  const suit = s[1].toLowerCase();
  return `${rank}${suit}`;
}

function ensureRig(state: GameState): RigConfig {
  if (!state.rig) state.rig = {};
  return state.rig;
}

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const body = await req.json().catch(() => ({}));
    const code = (await params).code.toUpperCase();
    const playerId = String(body.playerId ?? "");
    const token = String(body.token ?? "");
    const secret = String(body.secret ?? "");
    const command = body.command ?? {};
    const type = String(command.type ?? "");

    if (!isAdmin(secret)) throw new ApiError("Nope.", 403);

    const state = await withRoomLock(code, async () => {
      const s = await getRoom(code);
      if (!s) throw new ApiError("Table not found.", 404);
      authPlayer(s, playerId, token); // must still be seated at the table

      applyAdminCommand(s, type, command);

      s.version += 1;
      await saveRoom(s);
      return s;
    });

    return ok(toPublicState(state, playerId, { revealAll: true }));
  } catch (e) {
    if (e instanceof ApiError) return err(e.message, e.status);
    console.error(e);
    return err("Admin command failed.", 500);
  }
}

function applyAdminCommand(state: GameState, type: string, command: any) {
  switch (type) {
    case "setNextCommunity": {
      const wanted = parseCards(command.cards);
      const inUse = cardsInUse(state);
      const free = wanted.filter((c) => !inUse.has(c));
      if (free.length === 0) throw new ApiError("Those cards are already in play.");
      forceNextCards(state, free);
      state.log.push(`[admin] next cards set: ${free.join(" ")}`);
      break;
    }
    case "setRigHole": {
      const targetId = String(command.targetId ?? "");
      const target = state.players.find((p) => p.id === targetId);
      if (!target) throw new ApiError("Player not found.");
      const cards = parseCards(command.cards);
      if (cards.length !== 2) throw new ApiError("Provide exactly 2 valid cards.");
      const rig = ensureRig(state);
      rig.holeCards = { ...(rig.holeCards ?? {}), [targetId]: cards };
      state.log.push(`[admin] rigged ${target.name}'s next hole cards.`);
      break;
    }
    case "favorPlayer": {
      const targetId = command.targetId ? String(command.targetId) : null;
      const rig = ensureRig(state);
      rig.favorPlayerId = targetId;
      const name = state.players.find((p) => p.id === targetId)?.name;
      state.log.push(targetId ? `[admin] favoring ${name}.` : `[admin] favoring nobody.`);
      break;
    }
    case "setWeights": {
      const rig = ensureRig(state);
      const weights: Record<string, number> = {};
      const raw = command.weights ?? {};
      for (const [rank, w] of Object.entries(raw)) {
        const n = Number(w);
        if (Number.isFinite(n) && n > 0) weights[String(rank).toUpperCase()] = n;
      }
      rig.weights = weights;
      state.log.push(`[admin] card odds updated.`);
      break;
    }
    case "giveChips": {
      const targetId = String(command.targetId ?? "");
      const target = state.players.find((p) => p.id === targetId);
      if (!target) throw new ApiError("Player not found.");
      const amount = Math.floor(Number(command.amount));
      if (!Number.isFinite(amount)) throw new ApiError("Invalid amount.");
      target.chips = Math.max(0, target.chips + amount);
      state.log.push(`[admin] adjusted ${target.name}'s chips by ${amount}.`);
      break;
    }
    case "clearRig": {
      state.rig = undefined;
      state.log.push(`[admin] all rigs cleared.`);
      break;
    }
    default:
      throw new ApiError("Unknown admin command.");
  }
}
