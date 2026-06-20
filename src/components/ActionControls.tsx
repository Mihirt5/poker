"use client";

import { useEffect, useState } from "react";
import type { PublicState } from "@/lib/types";

interface Props {
  state: PublicState;
  busy: boolean;
  onAction: (action: string, amount?: number) => void;
}

export default function ActionControls({ state, busy, onAction }: Props) {
  const me = state.players.find((p) => p.isYou);
  const minTo = state.minRaiseTo;
  const maxTo = state.maxRaiseTo;
  const canFullRaise = state.canRaise && maxTo > minTo;
  const onlyAllInRaise = state.canRaise && maxTo <= minTo && maxTo > state.currentBet;

  const [raiseTo, setRaiseTo] = useState(minTo);

  useEffect(() => {
    // Reset the slider whenever it becomes my turn or the bet level changes.
    setRaiseTo(Math.min(Math.max(minTo, state.currentBet + state.minRaise), maxTo));
  }, [state.toActSince, minTo, maxTo, state.currentBet, state.minRaise]);

  if (!state.isYourTurn || !me) {
    return (
      <div className="flex h-[88px] items-center justify-center rounded-xl bg-slate-900/70 text-sm text-slate-400">
        Waiting for other players…
      </div>
    );
  }

  const callLabel =
    state.callAmount <= 0
      ? "Check"
      : state.callAmount >= me.chips
      ? `Call ${me.chips.toLocaleString()} (all-in)`
      : `Call ${state.callAmount.toLocaleString()}`;

  const isBet = state.currentBet === 0;

  function quick(fraction: number) {
    const potAfterCall = state.pot + state.callAmount;
    const target = state.currentBet + Math.round(potAfterCall * fraction);
    setRaiseTo(clamp(target, minTo, maxTo));
  }

  function clamp(v: number, lo: number, hi: number) {
    return Math.min(hi, Math.max(lo, v));
  }

  return (
    <div className="space-y-3 rounded-xl bg-slate-900/80 p-3 shadow-lg ring-1 ring-slate-700">
      {(canFullRaise || onlyAllInRaise) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-300">{isBet ? "Bet" : "Raise to"}</span>
            <span className="font-bold text-amber-300">{raiseTo.toLocaleString()}</span>
          </div>
          {canFullRaise && (
            <>
              <input
                type="range"
                className="chip-slider w-full"
                min={minTo}
                max={maxTo}
                step={Math.max(1, state.bigBlind / 2)}
                value={raiseTo}
                onChange={(e) => setRaiseTo(Number(e.target.value))}
              />
              <div className="flex gap-2">
                <button className="btn-neutral flex-1 py-1 text-xs" onClick={() => quick(0.5)}>
                  ½ Pot
                </button>
                <button className="btn-neutral flex-1 py-1 text-xs" onClick={() => quick(1)}>
                  Pot
                </button>
                <button className="btn-neutral flex-1 py-1 text-xs" onClick={() => setRaiseTo(maxTo)}>
                  Max
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <button className="btn-danger" disabled={busy} onClick={() => onAction("fold")}>
          Fold
        </button>
        <button
          className="btn-neutral"
          disabled={busy}
          onClick={() => onAction(state.canCheck ? "check" : "call")}
        >
          {callLabel}
        </button>
        {canFullRaise ? (
          <button className="btn-gold" disabled={busy} onClick={() => onAction("raise", raiseTo)}>
            {isBet ? "Bet" : "Raise"} {raiseTo.toLocaleString()}
          </button>
        ) : (
          <button className="btn-gold" disabled={busy} onClick={() => onAction("allin")}>
            All-in {me.chips.toLocaleString()}
          </button>
        )}
      </div>
    </div>
  );
}
