// Shared types for the poker game.

export type Card = string; // e.g. "As", "Td", "2c", "Kh"

export type Stage =
  | "waiting" // lobby, no hand in progress
  | "preflop"
  | "flop"
  | "turn"
  | "river"
  | "showdown" // hand evaluated, winners decided, brief display
  | "handover"; // pot awarded, waiting to deal next hand

export interface Player {
  id: string;
  token: string; // secret, never sent to other players
  name: string;
  seat: number; // 0-9
  chips: number;
  holeCards: Card[]; // length 0 or 2
  folded: boolean;
  allIn: boolean;
  bet: number; // chips committed in the CURRENT betting round
  totalCommitted: number; // chips committed across the whole hand (for side pots)
  hasActed: boolean; // has acted since the last raise in this round
  inHand: boolean; // dealt into the current hand
  sittingOut: boolean; // busted or chose to sit out — skipped when dealing
  connected: boolean;
  lastSeen: number; // epoch ms of last poll
  joinedDuringHand: boolean;
}

export interface Pot {
  amount: number;
  eligible: string[]; // player ids eligible to win this pot
}

export interface ShowdownEntry {
  playerId: string;
  cards: Card[]; // best 5-card hand
  handName: string;
  won: number; // chips won
}

export interface GameState {
  code: string;
  hostId: string;
  players: Player[];
  deck: Card[];
  community: Card[];
  stage: Stage;
  dealerSeat: number;
  smallBlind: number;
  bigBlind: number;
  startingChips: number;
  currentBet: number; // highest total bet committed in this round
  minRaise: number; // minimum legal raise increment
  toActSeat: number; // seat whose turn it is, -1 if none
  toActSince: number; // epoch ms when the current turn began (drives AFK timeout)
  lastAggressorSeat: number;
  pot: number; // total chips in the pot (display)
  pots: Pot[]; // computed side pots (populated at showdown)
  handNumber: number;
  log: string[]; // most-recent-last, capped
  showdown: ShowdownEntry[]; // populated during showdown/handover
  winnersText: string; // human readable summary for handover banner
  handOverAt: number; // epoch ms when hand ended (drives auto next-hand)
  version: number;
  createdAt: number;
}

// What a client receives — other players' hole cards are stripped.
export type PublicPlayer = Omit<Player, "token" | "holeCards"> & {
  holeCards: Card[]; // your own cards, or hidden ("??") for others
  isYou: boolean;
  hasCards: boolean; // whether they hold (hidden) cards
};

export interface PublicState {
  code: string;
  hostId: string;
  youId: string;
  isHost: boolean;
  players: PublicPlayer[];
  community: Card[];
  stage: Stage;
  dealerSeat: number;
  smallBlind: number;
  bigBlind: number;
  currentBet: number;
  minRaise: number;
  toActSeat: number;
  pot: number;
  handNumber: number;
  log: string[];
  showdown: ShowdownEntry[];
  winnersText: string;
  handOverAt: number;
  toActSince: number;
  actionTimeoutMs: number;
  serverNow: number;
  version: number;
  // Convenience fields for the acting player:
  yourSeat: number;
  isYourTurn: boolean;
  callAmount: number; // chips needed to call
  canCheck: boolean;
  canRaise: boolean;
  minRaiseTo: number; // smallest legal "raise to" total
  maxRaiseTo: number; // all-in "raise to" total
}

export type ActionType = "fold" | "check" | "call" | "raise" | "allin";
