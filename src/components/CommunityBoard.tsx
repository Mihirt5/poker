import type { PublicState } from "@/lib/types";
import PlayingCard from "./PlayingCard";

export default function CommunityBoard({ state }: { state: PublicState }) {
  const cards = state.community;
  const slots = 5;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex gap-1.5 sm:gap-2">
        {Array.from({ length: slots }).map((_, i) => {
          const card = cards[i];
          return card ? (
            <div key={i} className="animate-deal">
              <PlayingCard card={card} size="lg" />
            </div>
          ) : (
            <div
              key={i}
              className="h-20 w-14 rounded-lg border border-white/15 bg-black/20"
            />
          );
        })}
      </div>
      <div className="rounded-full bg-black/35 px-4 py-1 text-center shadow">
        <span className="text-xs uppercase tracking-wide text-amber-300/80">Pot</span>{" "}
        <span className="font-bold text-amber-300">{state.pot.toLocaleString()}</span>
      </div>
    </div>
  );
}
