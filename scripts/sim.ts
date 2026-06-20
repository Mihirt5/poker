// Engine simulation tests. Run with: npx tsx scripts/sim.ts
import { addPlayer, applyAction, createGame, startHand } from "../src/lib/poker/engine";
import type { GameState } from "../src/lib/types";
import { evaluateBest, compareRank } from "../src/lib/poker/evaluator";

let pass = 0;
let fail = 0;
function check(cond: boolean, msg: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error("  ✗ FAIL:", msg);
  }
}

function totalChips(s: GameState): number {
  return s.players.reduce((a, p) => a + p.chips, 0) + s.pot;
}

function makeTable(n: number, chips = 1000): GameState {
  const s = createGame({
    code: "TEST",
    hostId: "p0",
    hostToken: "t0",
    hostName: "P0",
    startingChips: chips,
    smallBlind: 10,
    bigBlind: 20,
  });
  // host already added as p0 — override id/seat consistency
  s.players[0].id = "p0";
  for (let i = 1; i < n; i++) {
    addPlayer(s, { id: `p${i}`, token: `t${i}`, name: `P${i}` });
  }
  return s;
}

function currentPlayer(s: GameState) {
  return s.players.find((p) => p.seat === s.toActSeat)!;
}

// ---- Test 1: evaluator correctness ----
console.log("Test 1: hand evaluator");
{
  const royal = evaluateBest(["As", "Ks", "Qs", "Js", "Ts", "2c", "3d"]);
  check(royal.name === "Straight Flush", "royal flush detected");

  const quads = evaluateBest(["9s", "9d", "9h", "9c", "Ks", "2c", "3d"]);
  check(quads.name === "Four of a Kind", "quads detected");

  const boat = evaluateBest(["9s", "9d", "9h", "Kc", "Ks", "2c", "3d"]);
  check(boat.name === "Full House", "full house detected");

  const wheel = evaluateBest(["As", "2d", "3h", "4c", "5s", "Kc", "Qd"]);
  check(wheel.name === "Straight", "wheel straight (A-5) detected");

  const flush = evaluateBest(["As", "9s", "7s", "4s", "2s", "Kc", "Qd"]);
  check(flush.name === "Flush", "flush detected");

  // Compare: higher kicker wins
  const a = evaluateBest(["As", "Ad", "Kh", "Qc", "Js", "2c", "3d"]); // pair of aces, KQJ
  const b = evaluateBest(["As", "Ad", "Kh", "Qc", "9s", "2c", "3d"]); // pair of aces, KQ9
  check(compareRank(a, b) > 0, "pair of aces with better kicker wins");

  const t1 = evaluateBest(["Ks", "Kd", "Qh", "Qc", "Js", "2c", "3d"]);
  const t2 = evaluateBest(["Ks", "Kd", "Qh", "Qc", "Js", "2c", "3d"]);
  check(compareRank(t1, t2) === 0, "identical hands tie");
}

// ---- Test 2: full hand, all call/check to showdown, chips conserved ----
console.log("Test 2: full hand to showdown, chip conservation");
{
  const s = makeTable(4);
  const before = totalChips(s);
  startHand(s);
  let guard = 0;
  while (s.stage !== "handover" && guard++ < 200) {
    const p = currentPlayer(s);
    const toCall = s.currentBet - p.bet;
    if (toCall > 0) applyAction(s, p.id, "call");
    else applyAction(s, p.id, "check");
  }
  check(s.stage === "handover", "hand reached handover");
  check(totalChips(s) === before, `chips conserved (${totalChips(s)} vs ${before})`);
  check(s.community.length === 5, "5 community cards dealt");
}

// ---- Test 3: everyone folds to one player ----
console.log("Test 3: fold-out awards uncontested");
{
  const s = makeTable(4);
  const before = totalChips(s);
  startHand(s);
  let guard = 0;
  while (s.stage !== "handover" && guard++ < 200) {
    const p = currentPlayer(s);
    applyAction(s, p.id, "fold");
  }
  check(s.stage === "handover", "hand ended on folds");
  check(totalChips(s) === before, "chips conserved after fold-out");
  const winners = s.players.filter((p) => p.chips > 1000 - 20); // someone gained
  check(s.winnersText.includes("uncontested"), "winner is uncontested");
}

// ---- Test 4: all-in side pots, chips conserved ----
console.log("Test 4: all-in side pots");
{
  const s = createGame({
    code: "T2",
    hostId: "p0",
    hostToken: "t0",
    hostName: "P0",
    startingChips: 100,
    smallBlind: 5,
    bigBlind: 10,
  });
  // Give players different stack sizes.
  s.players[0].chips = 100;
  addPlayer(s, { id: "p1", token: "t1", name: "P1" });
  addPlayer(s, { id: "p2", token: "t2", name: "P2" });
  s.players[1].chips = 50;
  s.players[2].chips = 200;
  const before = totalChips(s);
  startHand(s);
  let guard = 0;
  while (s.stage !== "handover" && guard++ < 200) {
    const p = currentPlayer(s);
    applyAction(s, p.id, "allin");
  }
  check(s.stage === "handover", "all-in hand resolved");
  check(totalChips(s) === before, `chips conserved with side pots (${totalChips(s)} vs ${before})`);
  check(s.pots.length >= 1, "side pots computed");
}

// ---- Test 5: minimum raise enforcement ----
console.log("Test 5: raise validation");
{
  const s = makeTable(3);
  startHand(s);
  const p = currentPlayer(s);
  let threw = false;
  try {
    applyAction(s, p.id, "raise", s.currentBet + 1); // below min raise
  } catch {
    threw = true;
  }
  check(threw, "below-minimum raise rejected");
  // A legal min raise should work
  const minTo = s.currentBet + s.minRaise;
  applyAction(s, p.id, "raise", minTo);
  check(s.currentBet === minTo, "legal min-raise accepted");
}

// ---- Test 6: many hands in a row, 10 players ----
console.log("Test 6: 10 players, 20 hands");
{
  const s = makeTable(10);
  const before = totalChips(s);
  for (let hand = 0; hand < 20; hand++) {
    const funded = s.players.filter((p) => p.chips > 0).length;
    if (funded < 2) break;
    startHand(s);
    if (s.stage === "waiting") break;
    let guard = 0;
    while (s.stage !== "handover" && guard++ < 500) {
      const p = currentPlayer(s);
      const toCall = s.currentBet - p.bet;
      // Random-ish but deterministic behaviour.
      const r = (hand + p.seat) % 5;
      if (r === 0 && toCall > 0) applyAction(s, p.id, "fold");
      else if (toCall > 0) applyAction(s, p.id, "call");
      else applyAction(s, p.id, "check");
    }
    check(totalChips(s) === before, `chips conserved after hand ${hand + 1}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
