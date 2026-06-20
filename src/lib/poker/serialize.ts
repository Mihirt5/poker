import type { GameState, PublicPlayer, PublicState } from "@/lib/types";
import { ACTION_TIMEOUT_MS } from "./engine";

// Build the view of the game that a specific player is allowed to see.
export function toPublicState(state: GameState, viewerId: string): PublicState {
  const now = Date.now();
  const reveal = state.stage === "showdown" || state.stage === "handover";

  const players: PublicPlayer[] = [...state.players]
    .sort((a, b) => a.seat - b.seat)
    .map((p) => {
      const isYou = p.id === viewerId;
      const showCards =
        p.holeCards.length > 0 && (isYou || (reveal && p.inHand && !p.folded));
      return {
        id: p.id,
        name: p.name,
        seat: p.seat,
        chips: p.chips,
        folded: p.folded,
        allIn: p.allIn,
        bet: p.bet,
        totalCommitted: p.totalCommitted,
        hasActed: p.hasActed,
        inHand: p.inHand,
        sittingOut: p.sittingOut,
        connected: p.connected,
        lastSeen: p.lastSeen,
        joinedDuringHand: p.joinedDuringHand,
        holeCards: showCards ? p.holeCards : [],
        hasCards: p.holeCards.length > 0,
        isYou,
      };
    });

  const you = state.players.find((p) => p.id === viewerId);
  const isYourTurn = !!you && you.seat === state.toActSeat && isBetting(state.stage);
  const toCall = you ? Math.max(0, state.currentBet - you.bet) : 0;
  const callAmount = you ? Math.min(toCall, you.chips) : 0;
  const canCheck = isYourTurn && toCall === 0;
  const minRaiseTo = Math.min(
    state.currentBet + state.minRaise,
    you ? you.bet + you.chips : 0
  );
  const maxRaiseTo = you ? you.bet + you.chips : 0;
  const canRaise = isYourTurn && !!you && you.chips > toCall;

  return {
    code: state.code,
    hostId: state.hostId,
    youId: viewerId,
    isHost: state.hostId === viewerId,
    players,
    community: state.community,
    stage: state.stage,
    dealerSeat: state.dealerSeat,
    smallBlind: state.smallBlind,
    bigBlind: state.bigBlind,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    toActSeat: state.toActSeat,
    pot: state.pot,
    handNumber: state.handNumber,
    log: state.log,
    showdown: state.showdown,
    winnersText: state.winnersText,
    handOverAt: state.handOverAt,
    toActSince: state.toActSince,
    actionTimeoutMs: ACTION_TIMEOUT_MS,
    serverNow: now,
    version: state.version,
    yourSeat: you ? you.seat : -1,
    isYourTurn,
    callAmount,
    canCheck,
    canRaise,
    minRaiseTo,
    maxRaiseTo,
  };
}

function isBetting(stage: string): boolean {
  return ["preflop", "flop", "turn", "river"].includes(stage);
}
