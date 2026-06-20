import type { ActionType, Card, GameState, Player, Pot, ShowdownEntry } from "@/lib/types";
import { makeDeck, shuffle } from "./cards";
import { compareRank, evaluateBest } from "./evaluator";

export const MAX_PLAYERS = 10;
export const ACTION_TIMEOUT_MS = 40_000;
export const HANDOVER_DELAY_MS = 6_000; // pause before auto-dealing the next hand
const LOG_CAP = 40;

export class GameError extends Error {}

// ---------- helpers ----------

function bySeat(state: GameState): Player[] {
  return [...state.players].sort((a, b) => a.seat - b.seat);
}

function playerBySeat(state: GameState, seat: number): Player | undefined {
  return state.players.find((p) => p.seat === seat);
}

function activeInHand(state: GameState): Player[] {
  return state.players.filter((p) => p.inHand && !p.folded);
}

function canActPlayers(state: GameState): Player[] {
  return state.players.filter((p) => p.inHand && !p.folded && !p.allIn && p.chips > 0);
}

// Next occupied seat after `fromSeat` whose player matches `pred`.
function nextSeat(
  state: GameState,
  fromSeat: number,
  pred: (p: Player) => boolean
): number {
  for (let i = 1; i <= MAX_PLAYERS; i++) {
    const seat = (fromSeat + i) % MAX_PLAYERS;
    const p = playerBySeat(state, seat);
    if (p && pred(p)) return seat;
  }
  return -1;
}

function log(state: GameState, msg: string) {
  state.log.push(msg);
  if (state.log.length > LOG_CAP) state.log.splice(0, state.log.length - LOG_CAP);
}

function recomputePot(state: GameState) {
  state.pot = state.players.reduce((sum, p) => sum + p.totalCommitted, 0);
}

// Commit chips from a player into the current round. Returns amount committed.
function commit(state: GameState, p: Player, amount: number): number {
  const actual = Math.min(amount, p.chips);
  p.chips -= actual;
  p.bet += actual;
  p.totalCommitted += actual;
  if (p.chips === 0) p.allIn = true;
  recomputePot(state);
  return actual;
}

// ---------- lobby ----------

export function createGame(opts: {
  code: string;
  hostId: string;
  hostToken: string;
  hostName: string;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
}): GameState {
  const now = Date.now();
  const host: Player = {
    id: opts.hostId,
    token: opts.hostToken,
    name: opts.hostName,
    seat: 0,
    chips: opts.startingChips,
    holeCards: [],
    folded: false,
    allIn: false,
    bet: 0,
    totalCommitted: 0,
    hasActed: false,
    inHand: false,
    sittingOut: false,
    connected: true,
    lastSeen: now,
    joinedDuringHand: false,
  };
  return {
    code: opts.code,
    hostId: opts.hostId,
    players: [host],
    deck: [],
    community: [],
    stage: "waiting",
    dealerSeat: 0,
    smallBlind: opts.smallBlind,
    bigBlind: opts.bigBlind,
    startingChips: opts.startingChips,
    currentBet: 0,
    minRaise: opts.bigBlind,
    toActSeat: -1,
    toActSince: 0,
    lastAggressorSeat: -1,
    pot: 0,
    pots: [],
    handNumber: 0,
    log: ["Table created. Waiting for players…"],
    showdown: [],
    winnersText: "",
    handOverAt: 0,
    version: 0,
    createdAt: now,
  };
}

export function addPlayer(state: GameState, opts: { id: string; token: string; name: string }): Player {
  if (state.players.length >= MAX_PLAYERS) {
    throw new GameError("Table is full (10 players max).");
  }
  if (state.players.some((p) => p.name.toLowerCase() === opts.name.toLowerCase())) {
    throw new GameError("That name is already taken at this table.");
  }
  const taken = new Set(state.players.map((p) => p.seat));
  let seat = 0;
  while (taken.has(seat)) seat++;
  const now = Date.now();
  const player: Player = {
    id: opts.id,
    token: opts.token,
    name: opts.name,
    seat,
    chips: state.startingChips,
    holeCards: [],
    folded: false,
    allIn: false,
    bet: 0,
    totalCommitted: 0,
    hasActed: false,
    inHand: false,
    sittingOut: false,
    connected: true,
    lastSeen: now,
    // If a hand is in progress they wait for the next one.
    joinedDuringHand: state.stage !== "waiting" && state.stage !== "handover",
  };
  state.players.push(player);
  log(state, `${opts.name} joined the table.`);
  return player;
}

export function removePlayer(state: GameState, playerId: string) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p) return;
  // If they are in an active hand, fold them first.
  if (p.inHand && !p.folded && isBettingStage(state)) {
    if (state.toActSeat === p.seat) {
      applyAction(state, playerId, "fold");
    } else {
      p.folded = true;
      p.hasActed = true;
    }
  }
  state.players = state.players.filter((x) => x.id !== playerId);
  log(state, `${p.name} left the table.`);
  if (p.id === state.hostId && state.players.length > 0) {
    state.hostId = state.players[0].id;
  }
  // If the table emptied out of a hand, reset to waiting.
  if (activeInHand(state).length < 2 && isBettingStage(state)) {
    const remaining = activeInHand(state)[0];
    if (remaining) awardUncontested(state, remaining.id);
  }
}

function isBettingStage(state: GameState): boolean {
  return ["preflop", "flop", "turn", "river"].includes(state.stage);
}

// ---------- hand lifecycle ----------

export function startHand(state: GameState) {
  // Eligible players: have chips and are not sitting out.
  const eligible = state.players.filter((p) => p.chips > 0 && !p.sittingOut);
  // Anyone with no chips sits out.
  for (const p of state.players) {
    if (p.chips <= 0) p.sittingOut = true;
    p.joinedDuringHand = false;
  }
  if (eligible.length < 2) {
    state.stage = "waiting";
    state.toActSeat = -1;
    state.toActSince = 0;
    log(state, "Need at least 2 funded players to start a hand.");
    return;
  }

  // Reset hand state.
  state.deck = shuffle(makeDeck());
  state.community = [];
  state.pots = [];
  state.showdown = [];
  state.winnersText = "";
  state.handOverAt = 0;
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
  state.lastAggressorSeat = -1;
  state.handNumber += 1;

  for (const p of state.players) {
    const playing = p.chips > 0 && !p.sittingOut;
    p.inHand = playing;
    p.folded = false;
    p.allIn = false;
    p.bet = 0;
    p.totalCommitted = 0;
    p.hasActed = false;
    p.holeCards = [];
  }

  // Advance the dealer button to the next eligible seat.
  const eligiblePred = (p: Player) => p.inHand;
  if (state.handNumber === 1) {
    // First hand: button on the lowest occupied eligible seat.
    const first = bySeat(state).find((p) => p.inHand);
    state.dealerSeat = first ? first.seat : 0;
  } else {
    const next = nextSeat(state, state.dealerSeat, eligiblePred);
    if (next !== -1) state.dealerSeat = next;
  }

  const inHandCount = activeInHand(state).length;
  const headsUp = inHandCount === 2;

  let sbSeat: number;
  let bbSeat: number;
  let firstToAct: number;

  if (headsUp) {
    // Heads-up: dealer is the small blind and acts first preflop.
    sbSeat = state.dealerSeat;
    bbSeat = nextSeat(state, state.dealerSeat, eligiblePred);
    firstToAct = sbSeat;
  } else {
    sbSeat = nextSeat(state, state.dealerSeat, eligiblePred);
    bbSeat = nextSeat(state, sbSeat, eligiblePred);
    firstToAct = nextSeat(state, bbSeat, eligiblePred);
  }

  // Deal two hole cards to each player, in seat order from the SB.
  const order: Player[] = [];
  let s = sbSeat;
  for (let i = 0; i < inHandCount; i++) {
    const p = playerBySeat(state, s)!;
    order.push(p);
    s = nextSeat(state, s, eligiblePred);
  }
  for (let round = 0; round < 2; round++) {
    for (const p of order) {
      p.holeCards.push(state.deck.pop()!);
    }
  }

  // Post blinds.
  const sb = playerBySeat(state, sbSeat)!;
  const bb = playerBySeat(state, bbSeat)!;
  const sbAmt = commit(state, sb, state.smallBlind);
  const bbAmt = commit(state, bb, state.bigBlind);
  log(state, `Hand #${state.handNumber} dealt. ${sb.name} posts SB ${sbAmt}, ${bb.name} posts BB ${bbAmt}.`);

  state.currentBet = state.bigBlind;
  state.minRaise = state.bigBlind;
  state.lastAggressorSeat = bbSeat;
  // Blind posters still owe an action (BB has the option to raise).
  sb.hasActed = false;
  bb.hasActed = false;

  state.stage = "preflop";
  // If everyone is already all-in from blinds (tiny stacks), run it out.
  if (canActPlayers(state).length === 0) {
    runOutAndShowdown(state);
    return;
  }
  setToAct(state, firstToAct);
}

function setToAct(state: GameState, seat: number) {
  // Find the next seat from `seat` (inclusive) that can act.
  let target = seat;
  const p = playerBySeat(state, target);
  if (!p || !(p.inHand && !p.folded && !p.allIn && p.chips > 0)) {
    target = nextSeat(state, seat, (x) => x.inHand && !x.folded && !x.allIn && x.chips > 0);
  }
  state.toActSeat = target;
  state.toActSince = Date.now();
}

// ---------- actions ----------

export function applyAction(
  state: GameState,
  playerId: string,
  action: ActionType,
  amount?: number
) {
  if (!isBettingStage(state)) throw new GameError("No betting is open right now.");
  const p = state.players.find((x) => x.id === playerId);
  if (!p) throw new GameError("Player not found.");
  if (p.seat !== state.toActSeat) throw new GameError("It's not your turn.");
  if (!p.inHand || p.folded || p.allIn) throw new GameError("You can't act on this hand.");

  const toCall = state.currentBet - p.bet;

  switch (action) {
    case "fold": {
      p.folded = true;
      p.hasActed = true;
      log(state, `${p.name} folds.`);
      break;
    }
    case "check": {
      if (toCall > 0) throw new GameError("You can't check — there's a bet to call.");
      p.hasActed = true;
      log(state, `${p.name} checks.`);
      break;
    }
    case "call": {
      if (toCall <= 0) throw new GameError("Nothing to call — check instead.");
      const paid = commit(state, p, toCall);
      p.hasActed = true;
      log(state, p.allIn ? `${p.name} calls ${paid} (all-in).` : `${p.name} calls ${paid}.`);
      break;
    }
    case "raise":
    case "allin": {
      let raiseTo: number;
      if (action === "allin") {
        raiseTo = p.bet + p.chips;
      } else {
        if (amount == null || !Number.isFinite(amount)) throw new GameError("Invalid raise amount.");
        raiseTo = Math.floor(amount);
      }
      const maxTo = p.bet + p.chips;
      if (raiseTo > maxTo) throw new GameError("You don't have enough chips for that.");
      if (raiseTo <= state.currentBet) {
        // Not actually a raise.
        if (raiseTo === maxTo && toCall > 0) {
          // All-in call for less than the current bet.
          const paid = commit(state, p, p.chips);
          p.hasActed = true;
          log(state, `${p.name} calls ${paid} (all-in).`);
          break;
        }
        throw new GameError("Raise must be greater than the current bet.");
      }

      const minRaiseTo = state.currentBet + state.minRaise;
      const isAllIn = raiseTo === maxTo;
      if (raiseTo < minRaiseTo && !isAllIn) {
        throw new GameError(`Minimum raise is to ${minRaiseTo}.`);
      }

      const raiseIncrement = raiseTo - state.currentBet;
      const delta = raiseTo - p.bet;
      commit(state, p, delta);
      const fullRaise = raiseIncrement >= state.minRaise;
      const prevBet = state.currentBet;
      state.currentBet = p.bet;
      if (fullRaise) {
        state.minRaise = raiseIncrement;
        state.lastAggressorSeat = p.seat;
        // Reopen the action: everyone else must respond.
        for (const other of state.players) {
          if (other.id !== p.id && other.inHand && !other.folded && !other.allIn) {
            other.hasActed = false;
          }
        }
        log(
          state,
          prevBet === 0
            ? `${p.name} bets ${state.currentBet}${p.allIn ? " (all-in)" : ""}.`
            : `${p.name} raises to ${state.currentBet}${p.allIn ? " (all-in)" : ""}.`
        );
      } else {
        // Short all-in raise — does not reopen betting for those already acted.
        log(state, `${p.name} raises to ${state.currentBet} (all-in, short).`);
      }
      p.hasActed = true;
      break;
    }
    default:
      throw new GameError("Unknown action.");
  }

  advanceAfterAction(state, p.seat);
}

function advanceAfterAction(state: GameState, fromSeat: number) {
  // Everyone folded but one → award and finish.
  const remaining = activeInHand(state);
  if (remaining.length === 1) {
    awardUncontested(state, remaining[0].id);
    return;
  }

  if (isBettingRoundComplete(state)) {
    endBettingRound(state);
    return;
  }

  const next = nextSeat(state, fromSeat, (p) => p.inHand && !p.folded && !p.allIn && p.chips > 0);
  if (next === -1) {
    // No one left to act — run out the board.
    runOutAndShowdown(state);
    return;
  }
  state.toActSeat = next;
  state.toActSince = Date.now();
}

function isBettingRoundComplete(state: GameState): boolean {
  const inHand = activeInHand(state);
  if (inHand.length <= 1) return true;
  const allMatched = inHand.every((p) => p.allIn || p.bet === state.currentBet);
  if (!allMatched) return false;
  const canAct = inHand.filter((p) => !p.allIn && p.chips > 0);
  return canAct.every((p) => p.hasActed);
}

function endBettingRound(state: GameState) {
  // If at most one player can still act, no further betting is possible.
  const canAct = canActPlayers(state);
  if (canAct.length <= 1 && activeInHand(state).length >= 2) {
    // Verify all bets are matched (they should be) then run out the board.
    const inHand = activeInHand(state);
    const allMatched = inHand.every((p) => p.allIn || p.bet === state.currentBet);
    if (allMatched && state.stage !== "river") {
      runOutAndShowdown(state);
      return;
    }
  }

  if (state.stage === "river") {
    showdown(state);
    return;
  }

  // Move bets into the pot conceptually (we track totalCommitted), reset round.
  for (const p of state.players) {
    p.bet = 0;
    p.hasActed = false;
  }
  state.currentBet = 0;
  state.minRaise = state.bigBlind;
  state.lastAggressorSeat = -1;

  dealNextStreet(state);

  // First to act after the dealer button who can act.
  const first = nextSeat(state, state.dealerSeat, (p) => p.inHand && !p.folded && !p.allIn && p.chips > 0);
  if (first === -1) {
    runOutAndShowdown(state);
    return;
  }
  state.toActSeat = first;
  state.toActSince = Date.now();
}

function dealNextStreet(state: GameState) {
  if (state.stage === "preflop") {
    state.community.push(state.deck.pop()!, state.deck.pop()!, state.deck.pop()!);
    state.stage = "flop";
    log(state, `Flop: ${state.community.join(" ")}`);
  } else if (state.stage === "flop") {
    state.community.push(state.deck.pop()!);
    state.stage = "turn";
    log(state, `Turn: ${state.community[3]}`);
  } else if (state.stage === "turn") {
    state.community.push(state.deck.pop()!);
    state.stage = "river";
    log(state, `River: ${state.community[4]}`);
  }
}

function runOutAndShowdown(state: GameState) {
  // Deal any remaining community cards with no further betting, then showdown.
  while (state.community.length < 5) {
    if (state.stage === "preflop") {
      state.community.push(state.deck.pop()!, state.deck.pop()!, state.deck.pop()!);
      state.stage = "flop";
      log(state, `Flop: ${state.community.join(" ")}`);
    } else if (state.stage === "flop") {
      state.community.push(state.deck.pop()!);
      state.stage = "turn";
      log(state, `Turn: ${state.community[3]}`);
    } else if (state.stage === "turn") {
      state.community.push(state.deck.pop()!);
      state.stage = "river";
      log(state, `River: ${state.community[4]}`);
    } else {
      break;
    }
  }
  showdown(state);
}

// ---------- pots & showdown ----------

function computeSidePots(state: GameState): Pot[] {
  const contributors = state.players
    .filter((p) => p.totalCommitted > 0)
    .map((p) => ({ id: p.id, contrib: p.totalCommitted, folded: p.folded }));

  const pots: Pot[] = [];
  while (contributors.some((c) => c.contrib > 0)) {
    const min = Math.min(...contributors.filter((c) => c.contrib > 0).map((c) => c.contrib));
    let amount = 0;
    const eligible: string[] = [];
    for (const c of contributors) {
      if (c.contrib > 0) {
        amount += min;
        c.contrib -= min;
        if (!c.folded) eligible.push(c.id);
      }
    }
    // Merge with the previous pot if the eligible set is identical.
    const prev = pots[pots.length - 1];
    if (prev && sameSet(prev.eligible, eligible)) {
      prev.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
  }
  return pots;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every((x) => sa.has(x));
}

function showdown(state: GameState) {
  state.stage = "showdown";
  state.pots = computeSidePots(state);

  const winShare: Record<string, number> = {};
  const handNames: Record<string, string> = {};
  const bestCards: Record<string, Card[]> = {};

  for (const pot of state.pots) {
    const contenders = pot.eligible
      .map((id) => state.players.find((p) => p.id === id)!)
      .filter((p) => p && !p.folded);
    if (contenders.length === 0) continue;

    let best: { rank: ReturnType<typeof evaluateBest>; players: Player[] } | null = null;
    for (const p of contenders) {
      const rank = evaluateBest([...p.holeCards, ...state.community]);
      handNames[p.id] = rank.name;
      bestCards[p.id] = rank.cards;
      if (!best) {
        best = { rank, players: [p] };
      } else {
        const cmp = compareRank(rank, best.rank);
        if (cmp > 0) best = { rank, players: [p] };
        else if (cmp === 0) best.players.push(p);
      }
    }
    if (!best) continue;

    const winners = best.players;
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    // Give odd chips to the first winner by seat order from the SB.
    const ordered = [...winners].sort((a, b) => a.seat - b.seat);
    for (const w of ordered) {
      let amt = share;
      if (remainder > 0) {
        amt += 1;
        remainder -= 1;
      }
      w.chips += amt;
      winShare[w.id] = (winShare[w.id] ?? 0) + amt;
    }
  }

  // Build showdown entries for everyone still in the hand.
  const entries: ShowdownEntry[] = [];
  for (const p of activeInHand(state)) {
    entries.push({
      playerId: p.id,
      cards: bestCards[p.id] ?? [...p.holeCards, ...state.community].slice(0, 5),
      handName: handNames[p.id] ?? "",
      won: winShare[p.id] ?? 0,
    });
  }
  state.showdown = entries;

  const winnerNames = Object.entries(winShare)
    .filter(([, amt]) => amt > 0)
    .map(([id, amt]) => {
      const pl = state.players.find((p) => p.id === id)!;
      const hn = handNames[id] ? ` with ${handNames[id]}` : "";
      return `${pl.name} wins ${amt}${hn}`;
    });
  state.winnersText = winnerNames.join(" · ") || "Hand complete.";
  for (const line of winnerNames) log(state, line);

  finishHand(state);
}

function awardUncontested(state: GameState, winnerId: string) {
  state.stage = "showdown";
  state.pots = computeSidePots(state);
  const winner = state.players.find((p) => p.id === winnerId)!;
  const total = state.pot;
  winner.chips += total;
  state.showdown = [
    { playerId: winner.id, cards: [], handName: "", won: total },
  ];
  state.winnersText = `${winner.name} wins ${total} (uncontested).`;
  log(state, state.winnersText);
  finishHand(state);
}

function finishHand(state: GameState) {
  state.toActSeat = -1;
  state.toActSince = 0;
  state.currentBet = 0;
  state.pot = 0; // chips have been distributed back to winners
  state.stage = "handover";
  state.handOverAt = Date.now();
  // Players who busted will sit out next hand.
  for (const p of state.players) {
    if (p.chips <= 0) {
      p.sittingOut = true;
      p.inHand = false;
    }
  }
}

// Whether enough time has passed (and enough funded players exist) to deal again.
export function canDealNextHand(state: GameState, now: number): boolean {
  if (state.stage !== "handover" && state.stage !== "waiting") return false;
  const funded = state.players.filter((p) => p.chips > 0).length;
  if (funded < 2) return false;
  if (state.stage === "handover" && now - state.handOverAt < HANDOVER_DELAY_MS) return false;
  return true;
}

// Auto-act for a player who has timed out (treat as check, else fold).
export function applyTimeout(state: GameState, now: number): boolean {
  if (!isBettingStage(state)) return false;
  if (state.toActSeat < 0) return false;
  if (now - state.toActSince < ACTION_TIMEOUT_MS) return false;
  const p = playerBySeat(state, state.toActSeat);
  if (!p) return false;
  const toCall = state.currentBet - p.bet;
  if (toCall > 0) {
    applyAction(state, p.id, "fold");
    log(state, `${p.name} timed out and folds.`);
  } else {
    applyAction(state, p.id, "check");
    log(state, `${p.name} timed out and checks.`);
  }
  return true;
}
