import type { Card } from "@/lib/types";

export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const SUITS = ["c", "d", "h", "s"] as const;

export const RANK_VALUE: Record<string, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export const SUIT_SYMBOL: Record<string, string> = {
  c: "♣",
  d: "♦",
  h: "♥",
  s: "♠",
};

export const SUIT_IS_RED: Record<string, boolean> = {
  c: false,
  s: false,
  d: true,
  h: true,
};

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(`${r}${s}`);
    }
  }
  return deck;
}

// Fisher–Yates shuffle using a cryptographically strong RNG when available.
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomInt(maxExclusive: number): number {
  // Prefer crypto for fairness; fall back to Math.random.
  const g: any = globalThis as any;
  if (g.crypto && typeof g.crypto.getRandomValues === "function") {
    const range = maxExclusive;
    const maxUint = 0xffffffff;
    const limit = maxUint - (maxUint % range);
    const buf = new Uint32Array(1);
    let x = 0;
    do {
      g.crypto.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return x % range;
  }
  return Math.floor(Math.random() * maxExclusive);
}

export function rankOf(card: Card): string {
  return card[0];
}

export function suitOf(card: Card): string {
  return card[1];
}
