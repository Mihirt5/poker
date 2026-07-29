"use client";

import { useState } from "react";
import type { PublicState } from "@/lib/types";
import { RANKS } from "@/lib/poker/cards";
import PlayingCard from "./PlayingCard";

interface Props {
  state: PublicState;
  onCommand: (command: Record<string, unknown>) => void | Promise<void>;
  onClose: () => void;
}

// Parse a free-text card list like "As Kd, 10h" into tokens for the server.
function parseCardInput(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function AdminPanel({ state, onCommand, onClose }: Props) {
  const admin = state.admin!;
  const players = state.players;

  const [favorId, setFavorId] = useState<string>(admin.rig.favorPlayerId ?? "");
  const [rigTarget, setRigTarget] = useState<string>(players[0]?.id ?? "");
  const [rigCards, setRigCards] = useState<string>("");
  const [community, setCommunity] = useState<string>("");
  const [chipTarget, setChipTarget] = useState<string>(players[0]?.id ?? "");
  const [chipAmount, setChipAmount] = useState<string>("1000");
  const [weights, setWeights] = useState<Record<string, string>>(() => {
    const w: Record<string, string> = {};
    for (const r of RANKS) w[r] = String(admin.rig.weights?.[r] ?? 1);
    return w;
  });

  function applyWeights() {
    const out: Record<string, number> = {};
    for (const r of RANKS) {
      const n = Number(weights[r]);
      if (Number.isFinite(n) && n > 0) out[r] = n;
    }
    onCommand({ type: "setWeights", weights: out });
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-full flex-col gap-3 overflow-y-auto border-l border-rose-800 bg-slate-950/95 p-4 text-sm text-slate-200 shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black tracking-wide text-rose-400">👁 GOD MODE</h2>
        <button onClick={onClose} className="btn-neutral px-2 py-1 text-xs">
          Hide
        </button>
      </div>

      {/* Live X-ray of every hand */}
      <section className="rounded-lg bg-slate-900/70 p-3 ring-1 ring-slate-700">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Everyone's cards
        </h3>
        <div className="space-y-2">
          {players.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-semibold">
                  {p.name}
                  {p.isYou && <span className="ml-1 text-xs text-slate-500">you</span>}
                  {admin.rig.favorPlayerId === p.id && (
                    <span className="ml-1 text-xs text-amber-400">★ favored</span>
                  )}
                </div>
                <div className="text-xs text-emerald-300">{p.chips.toLocaleString()} chips</div>
              </div>
              <div className="flex gap-1">
                {p.holeCards.length > 0 ? (
                  p.holeCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" />)
                ) : (
                  <span className="text-xs text-slate-600">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming deck */}
      <section className="rounded-lg bg-slate-900/70 p-3 ring-1 ring-slate-700">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Next cards (deal order)
        </h3>
        <div className="flex flex-wrap gap-1">
          {admin.deck.slice(0, 12).map((c, i) => (
            <PlayingCard key={i} card={c} size="sm" />
          ))}
        </div>
      </section>

      {/* Favor a player */}
      <section className="rounded-lg bg-slate-900/70 p-3 ring-1 ring-slate-700">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Favor a player (premium hand each deal)
        </h3>
        <div className="flex gap-2">
          <select
            className="input flex-1"
            value={favorId}
            onChange={(e) => setFavorId(e.target.value)}
          >
            <option value="">— nobody —</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            className="btn-primary px-3"
            onClick={() => onCommand({ type: "favorPlayer", targetId: favorId || null })}
          >
            Set
          </button>
        </div>
      </section>

      {/* Rig hole cards */}
      <section className="rounded-lg bg-slate-900/70 p-3 ring-1 ring-slate-700">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Rig next hole cards
        </h3>
        <select
          className="input mb-2 w-full"
          value={rigTarget}
          onChange={(e) => setRigTarget(e.target.value)}
        >
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="e.g. As Kh"
            value={rigCards}
            onChange={(e) => setRigCards(e.target.value)}
          />
          <button
            className="btn-primary px-3"
            onClick={() =>
              onCommand({
                type: "setRigHole",
                targetId: rigTarget,
                cards: parseCardInput(rigCards),
              })
            }
          >
            Set
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Applies on the next hand dealt.</p>
      </section>

      {/* Set next community cards */}
      <section className="rounded-lg bg-slate-900/70 p-3 ring-1 ring-slate-700">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Set next community cards
        </h3>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="e.g. Ah Kh Qh"
            value={community}
            onChange={(e) => setCommunity(e.target.value)}
          />
          <button
            className="btn-primary px-3"
            onClick={() =>
              onCommand({ type: "setNextCommunity", cards: parseCardInput(community) })
            }
          >
            Set
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          These are the very next cards off the deck (flop/turn/river).
        </p>
      </section>

      {/* Card odds weighting */}
      <section className="rounded-lg bg-slate-900/70 p-3 ring-1 ring-slate-700">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Card odds (weight per rank)
        </h3>
        <div className="grid grid-cols-4 gap-1">
          {RANKS.map((r) => (
            <label key={r} className="flex items-center gap-1">
              <span className="w-4 text-right text-xs text-slate-400">
                {r === "T" ? "10" : r}
              </span>
              <input
                className="input w-full px-1 py-0.5 text-xs"
                type="number"
                min={0}
                step={0.5}
                value={weights[r]}
                onChange={(e) => setWeights((w) => ({ ...w, [r]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        <button className="btn-primary mt-2 w-full" onClick={applyWeights}>
          Apply odds (next hand)
        </button>
        <p className="mt-1 text-[11px] text-slate-500">1 = normal. Higher = dealt sooner/more.</p>
      </section>

      {/* Give chips */}
      <section className="rounded-lg bg-slate-900/70 p-3 ring-1 ring-slate-700">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Adjust chips
        </h3>
        <div className="flex gap-2">
          <select
            className="input flex-1"
            value={chipTarget}
            onChange={(e) => setChipTarget(e.target.value)}
          >
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            className="input w-24"
            type="number"
            value={chipAmount}
            onChange={(e) => setChipAmount(e.target.value)}
          />
          <button
            className="btn-primary px-3"
            onClick={() =>
              onCommand({
                type: "giveChips",
                targetId: chipTarget,
                amount: Number(chipAmount),
              })
            }
          >
            Add
          </button>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">Use a negative number to remove chips.</p>
      </section>

      <button
        className="btn-neutral mt-1 w-full"
        onClick={() => onCommand({ type: "clearRig" })}
      >
        Clear all rigs
      </button>
    </div>
  );
}
