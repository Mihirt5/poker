import type { PublicPlayer, ShowdownEntry } from "@/lib/types";
import PlayingCard from "./PlayingCard";

interface Props {
  player: PublicPlayer;
  isDealer: boolean;
  isCurrent: boolean;
  blindLabel: "SB" | "BB" | "";
  showdown?: ShowdownEntry;
  secondsLeft: number | null;
  reveal: boolean;
}

export default function PlayerSeat({
  player,
  isDealer,
  isCurrent,
  blindLabel,
  showdown,
  secondsLeft,
  reveal,
}: Props) {
  const folded = player.folded;
  const won = showdown && showdown.won > 0;
  const showCards = player.holeCards.length === 2;
  const hasHidden = player.hasCards && !showCards;

  return (
    <div
      className={`relative w-28 select-none rounded-xl border px-2 py-2 text-center shadow-lg transition sm:w-32 ${
        isCurrent
          ? "border-amber-300 bg-slate-800/95 animate-pulse-ring"
          : won
          ? "border-emerald-400 bg-emerald-900/70"
          : "border-slate-600/70 bg-slate-900/85"
      } ${folded ? "opacity-50" : ""}`}
    >
      {/* Cards above the nameplate */}
      <div className="absolute -top-9 left-1/2 flex -translate-x-1/2 gap-1">
        {showCards ? (
          player.holeCards.map((c, i) => <PlayingCard key={i} card={c} size="sm" dim={folded} />)
        ) : hasHidden ? (
          <>
            <PlayingCard faceDown size="sm" dim={folded} />
            <PlayingCard faceDown size="sm" dim={folded} />
          </>
        ) : null}
      </div>

      {/* Badges */}
      <div className="absolute -top-2 -right-2 flex gap-1">
        {isDealer && (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-black text-slate-900 shadow">
            D
          </span>
        )}
        {blindLabel && (
          <span className="flex h-6 items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white shadow">
            {blindLabel}
          </span>
        )}
      </div>

      <div className="flex items-center justify-center gap-1 truncate">
        <span className={`truncate text-sm font-semibold ${player.isYou ? "text-amber-300" : "text-slate-100"}`}>
          {player.name}
          {player.isYou && " (you)"}
        </span>
      </div>

      <div className="mt-0.5 flex items-center justify-center gap-1">
        <span className="text-xs font-bold text-emerald-300">
          {player.chips.toLocaleString()}
        </span>
      </div>

      {/* Status line */}
      <div className="mt-1 h-4 text-[11px]">
        {player.sittingOut && !player.inHand ? (
          <span className="text-slate-400">sitting out</span>
        ) : folded ? (
          <span className="text-rose-400">folded</span>
        ) : player.allIn ? (
          <span className="font-bold text-amber-300">ALL IN</span>
        ) : isCurrent && secondsLeft != null ? (
          <span className={secondsLeft <= 10 ? "text-rose-400" : "text-amber-200"}>
            {secondsLeft}s to act
          </span>
        ) : reveal && showdown ? (
          <span className="text-emerald-300">{showdown.handName}</span>
        ) : null}
      </div>

      {/* Current bet chip */}
      {player.bet > 0 && (
        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-bold text-amber-300 shadow ring-1 ring-amber-400/40">
          {player.bet.toLocaleString()}
        </div>
      )}

      {/* Winnings flash */}
      {won && (
        <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-500 px-2 py-0.5 text-[11px] font-bold text-emerald-950 shadow">
          +{showdown!.won.toLocaleString()}
        </div>
      )}
    </div>
  );
}
