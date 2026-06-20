import type { Card } from "@/lib/types";
import { RANK_VALUE } from "./cards";

// Hand categories, higher is better.
export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

const CATEGORY_NAME: Record<HandCategory, string> = {
  [HandCategory.HighCard]: "High Card",
  [HandCategory.Pair]: "Pair",
  [HandCategory.TwoPair]: "Two Pair",
  [HandCategory.ThreeOfAKind]: "Three of a Kind",
  [HandCategory.Straight]: "Straight",
  [HandCategory.Flush]: "Flush",
  [HandCategory.FullHouse]: "Full House",
  [HandCategory.FourOfAKind]: "Four of a Kind",
  [HandCategory.StraightFlush]: "Straight Flush",
};

export interface HandRank {
  category: HandCategory;
  // Tiebreak vector: compared lexicographically after category.
  tiebreak: number[];
  name: string;
  cards: Card[]; // the 5 cards forming this hand
}

// Compare two hand ranks. Positive if a beats b, negative if b beats a, 0 tie.
export function compareRank(a: HandRank, b: HandRank): number {
  if (a.category !== b.category) return a.category - b.category;
  const len = Math.max(a.tiebreak.length, b.tiebreak.length);
  for (let i = 0; i < len; i++) {
    const av = a.tiebreak[i] ?? 0;
    const bv = b.tiebreak[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// Evaluate exactly 5 cards.
function evaluate5(cards: Card[]): HandRank {
  const values = cards.map((c) => RANK_VALUE[c[0]]).sort((x, y) => y - x);
  const suits = cards.map((c) => c[1]);

  const isFlush = suits.every((s) => s === suits[0]);

  // Build straight detection (handle wheel A-2-3-4-5).
  const uniqueDesc = Array.from(new Set(values)).sort((x, y) => y - x);
  let straightHigh = 0;
  if (uniqueDesc.length === 5) {
    if (uniqueDesc[0] - uniqueDesc[4] === 4) {
      straightHigh = uniqueDesc[0];
    } else if (
      uniqueDesc[0] === 14 &&
      uniqueDesc[1] === 5 &&
      uniqueDesc[2] === 4 &&
      uniqueDesc[3] === 3 &&
      uniqueDesc[4] === 2
    ) {
      straightHigh = 5; // wheel
    }
  }

  // Count rank multiplicities.
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // Sort by count desc, then value desc.
  const grouped = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });
  const countShape = grouped.map((g) => g[1]).join(""); // e.g. "32", "22", "4"

  let category: HandCategory;
  let tiebreak: number[];

  if (straightHigh && isFlush) {
    category = HandCategory.StraightFlush;
    tiebreak = [straightHigh];
  } else if (countShape === "41") {
    category = HandCategory.FourOfAKind;
    tiebreak = [grouped[0][0], grouped[1][0]];
  } else if (countShape === "32") {
    category = HandCategory.FullHouse;
    tiebreak = [grouped[0][0], grouped[1][0]];
  } else if (isFlush) {
    category = HandCategory.Flush;
    tiebreak = values;
  } else if (straightHigh) {
    category = HandCategory.Straight;
    tiebreak = [straightHigh];
  } else if (countShape === "311") {
    category = HandCategory.ThreeOfAKind;
    tiebreak = [grouped[0][0], grouped[1][0], grouped[2][0]];
  } else if (countShape === "221") {
    category = HandCategory.TwoPair;
    tiebreak = [grouped[0][0], grouped[1][0], grouped[2][0]];
  } else if (countShape === "2111") {
    category = HandCategory.Pair;
    tiebreak = [grouped[0][0], grouped[1][0], grouped[2][0], grouped[3][0]];
  } else {
    category = HandCategory.HighCard;
    tiebreak = values;
  }

  return {
    category,
    tiebreak,
    name: CATEGORY_NAME[category],
    cards: cards.slice(),
  };
}

// All 5-card combinations of indices from a 7-card set.
const COMBOS_7C5: number[][] = (() => {
  const res: number[][] = [];
  const n = 7;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) res.push([a, b, c, d, e]);
  return res;
})();

// Evaluate the best 5-card hand out of up to 7 cards.
export function evaluateBest(cards: Card[]): HandRank {
  if (cards.length < 5) {
    throw new Error("Need at least 5 cards to evaluate");
  }
  if (cards.length === 5) return evaluate5(cards);

  let best: HandRank | null = null;
  if (cards.length === 7) {
    for (const combo of COMBOS_7C5) {
      const five = [
        cards[combo[0]],
        cards[combo[1]],
        cards[combo[2]],
        cards[combo[3]],
        cards[combo[4]],
      ];
      const r = evaluate5(five);
      if (!best || compareRank(r, best) > 0) best = r;
    }
    return best!;
  }

  // Generic fallback for 6 cards.
  const idx = cards.map((_, i) => i);
  const combos = combinations(idx, 5);
  for (const combo of combos) {
    const five = combo.map((i) => cards[i]);
    const r = evaluate5(five);
    if (!best || compareRank(r, best) > 0) best = r;
  }
  return best!;
}

function combinations<T>(arr: T[], k: number): T[][] {
  const res: T[][] = [];
  const helper = (start: number, combo: T[]) => {
    if (combo.length === k) {
      res.push(combo.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      helper(i + 1, combo);
      combo.pop();
    }
  };
  helper(0, []);
  return res;
}

export function handDisplayName(rank: HandRank): string {
  return rank.name;
}
