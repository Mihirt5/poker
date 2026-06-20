import { SUIT_IS_RED, SUIT_SYMBOL } from "@/lib/poker/cards";

interface Props {
  card?: string; // e.g. "As"; undefined/"" => face down
  size?: "sm" | "md" | "lg";
  faceDown?: boolean;
  dim?: boolean;
}

const SIZES = {
  sm: "h-9 w-7 text-sm rounded",
  md: "h-14 w-10 text-lg rounded-md",
  lg: "h-20 w-14 text-2xl rounded-lg",
};

export default function PlayingCard({ card, size = "md", faceDown, dim }: Props) {
  const cls = SIZES[size];

  if (faceDown || !card) {
    return (
      <div
        className={`${cls} flex items-center justify-center border border-sky-900 bg-gradient-to-br from-sky-700 to-sky-900 shadow-md`}
        aria-label="face-down card"
      >
        <div className="h-2/3 w-2/3 rounded-sm border border-sky-400/40 bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.08)_0_4px,transparent_4px_8px)]" />
      </div>
    );
  }

  const rank = card[0] === "T" ? "10" : card[0];
  const suit = card[1];
  const red = SUIT_IS_RED[suit];

  return (
    <div
      className={`${cls} relative flex flex-col items-center justify-center border border-slate-300 bg-white font-bold shadow-md ${
        dim ? "opacity-50" : ""
      }`}
    >
      <span className={red ? "text-rose-600" : "text-slate-900"}>{rank}</span>
      <span className={`leading-none ${red ? "text-rose-600" : "text-slate-900"}`}>
        {SUIT_SYMBOL[suit]}
      </span>
    </div>
  );
}
