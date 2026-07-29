"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import type { PublicState } from "@/lib/types";
import {
  clearIdentity,
  fetchState,
  joinRoom,
  leaveTable,
  loadIdentity,
  nextHand,
  recallName,
  rememberName,
  saveIdentity,
  sendAction,
  sendAdmin,
  startGame,
  type Identity,
} from "@/lib/client";
import CommunityBoard from "@/components/CommunityBoard";
import PlayerSeat from "@/components/PlayerSeat";
import ActionControls from "@/components/ActionControls";
import AdminPanel from "@/components/AdminPanel";

const POLL_MS = 1800;

// Type this on the table to reveal the hidden god-mode panel.
const UNLOCK_SEQUENCE = "godmode";

function adminKey(code: string) {
  return `holdem:admin:${code.toUpperCase()}`;
}

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code as string).toUpperCase();
  const router = useRouter();

  const [identity, setIdentity] = useState<Identity | null>(null);
  const [state, setState] = useState<PublicState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clockOffset, setClockOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);

  // Hidden god-mode: secret unlocked via the keystroke sequence.
  const [adminSecret, setAdminSecret] = useState<string | null>(null);

  // Join form (when no identity yet)
  const [joinName, setJoinName] = useState("");
  const [joining, setJoining] = useState(false);

  const pollingRef = useRef(false);

  useEffect(() => {
    setIdentity(loadIdentity(code));
    setJoinName(recallName());
    // Restore a previously entered admin secret for this room (session only).
    try {
      const saved = sessionStorage.getItem(adminKey(code));
      if (saved) setAdminSecret(saved);
    } catch {
      /* ignore */
    }
  }, [code]);

  // Listen for the secret unlock sequence typed anywhere on the table.
  useEffect(() => {
    let buffer = "";
    function onKey(e: KeyboardEvent) {
      if (e.key.length !== 1) return; // ignore modifiers/arrows/etc.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      buffer = (buffer + e.key.toLowerCase()).slice(-UNLOCK_SEQUENCE.length);
      if (buffer === UNLOCK_SEQUENCE) {
        buffer = "";
        const existing = adminSecret ?? sessionStorage.getItem(adminKey(code)) ?? "";
        const secret = window.prompt("God-mode passcode:", existing);
        if (secret) {
          try {
            sessionStorage.setItem(adminKey(code), secret);
          } catch {
            /* ignore */
          }
          setAdminSecret(secret);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [code, adminSecret]);

  const refresh = useCallback(async () => {
    if (!identity || pollingRef.current) return;
    pollingRef.current = true;
    try {
      const s = await fetchState(code, identity, adminSecret ?? undefined);
      setState(s);
      setClockOffset(s.serverNow - Date.now());
      setError("");
    } catch (e: any) {
      setError(e.message || "Connection lost.");
      if (/not seated|not found|expired/i.test(e.message || "")) {
        // Identity invalid — drop it so the join form appears.
        clearIdentity(code);
        setIdentity(null);
      }
    } finally {
      pollingRef.current = false;
    }
  }, [code, identity, adminSecret]);

  // Poll loop
  useEffect(() => {
    if (!identity) return;
    refresh();
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [identity, refresh]);

  // 1s clock for the countdown timer
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const serverNow = now + clockOffset;

  async function doJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoining(true);
    setError("");
    try {
      rememberName(joinName.trim());
      const res = await joinRoom({ code, name: joinName.trim() });
      const id = { playerId: res.playerId, token: res.token, name: joinName.trim() };
      saveIdentity(code, id);
      setIdentity(id);
    } catch (e: any) {
      setError(e.message || "Could not join.");
    } finally {
      setJoining(false);
    }
  }

  const act = useCallback(
    async (action: string, amount?: number) => {
      if (!identity) return;
      setBusy(true);
      try {
        const s = await sendAction(code, identity, action, amount);
        setState(s);
        setClockOffset(s.serverNow - Date.now());
        setError("");
      } catch (e: any) {
        setError(e.message || "Action failed.");
        refresh();
      } finally {
        setBusy(false);
      }
    },
    [code, identity, refresh]
  );

  async function handleStart() {
    if (!identity) return;
    setBusy(true);
    try {
      const s = await startGame(code, identity);
      setState(s);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleNext() {
    if (!identity) return;
    setBusy(true);
    try {
      const s = await nextHand(code, identity);
      setState(s);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLeave() {
    if (identity) {
      try {
        await leaveTable(code, identity);
      } catch {
        /* ignore */
      }
      clearIdentity(code);
    }
    router.push("/");
  }

  const doAdmin = useCallback(
    async (command: Record<string, unknown>) => {
      if (!identity || !adminSecret) return;
      try {
        const s = await sendAdmin(code, identity, adminSecret, command);
        setState(s);
        setError("");
      } catch (e: any) {
        setError(e.message || "Admin command failed.");
      }
    },
    [code, identity, adminSecret]
  );

  function lockAdmin() {
    setAdminSecret(null);
    try {
      sessionStorage.removeItem(adminKey(code));
    } catch {
      /* ignore */
    }
  }

  function copyInvite() {
    const link = `${window.location.origin}/?code=${code}`;
    navigator.clipboard?.writeText(link).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  }

  // ----- No identity: inline join -----
  if (!identity) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4">
        <div className="w-full rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
          <h1 className="mb-1 text-2xl font-bold">
            Join table <span className="text-amber-400">{code}</span>
          </h1>
          <p className="mb-4 text-sm text-slate-400">Pick a name to take a seat.</p>
          <form onSubmit={doJoin} className="space-y-3">
            <input
              className="input"
              value={joinName}
              maxLength={20}
              placeholder="Your name"
              onChange={(e) => setJoinName(e.target.value)}
            />
            <button className="btn-primary w-full" disabled={joining || !joinName.trim()}>
              {joining ? "Joining…" : "Take a seat"}
            </button>
          </form>
          {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
          <button className="mt-4 text-sm text-slate-400 underline" onClick={() => router.push("/")}>
            Back to home
          </button>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="text-slate-400">{error || "Loading table…"}</div>
      </main>
    );
  }

  return (
    <>
      <GameView
        state={state}
        serverNow={serverNow}
        busy={busy}
        error={error}
        copied={copied}
        onAct={act}
        onStart={handleStart}
        onNext={handleNext}
        onLeave={handleLeave}
        onCopy={copyInvite}
      />
      {adminSecret && state.admin && (
        <AdminPanel state={state} onCommand={doAdmin} onClose={lockAdmin} />
      )}
    </>
  );
}

// ---------------- Game view ----------------

function seatPositions(n: number, myIndex: number) {
  // Place players around an ellipse with "me" at the bottom-center.
  const positions: { left: string; top: string }[] = [];
  for (let i = 0; i < n; i++) {
    const offset = (i - myIndex + n) % n;
    const angle = (Math.PI / 2) + (offset / n) * 2 * Math.PI; // 90° = bottom
    const x = 50 + 44 * Math.cos(angle);
    const y = 52 + 46 * Math.sin(angle);
    positions.push({ left: `${x}%`, top: `${y}%` });
  }
  return positions;
}

function GameView({
  state,
  serverNow,
  busy,
  error,
  copied,
  onAct,
  onStart,
  onNext,
  onLeave,
  onCopy,
}: {
  state: PublicState;
  serverNow: number;
  busy: boolean;
  error: string;
  copied: boolean;
  onAct: (a: string, amt?: number) => void;
  onStart: () => void;
  onNext: () => void;
  onLeave: () => void;
  onCopy: () => void;
}) {
  const players = state.players;
  const myIndex = Math.max(0, players.findIndex((p) => p.isYou));
  const positions = useMemo(
    () => seatPositions(players.length, myIndex),
    [players.length, myIndex]
  );

  const inLobby = state.stage === "waiting";
  const fundedCount = players.filter((p) => p.chips > 0).length;
  const gameOver = state.stage === "handover" && fundedCount < 2;

  // Blind seats (for badges) — derive from dealer for display only.
  const seatsInHand = players.filter((p) => p.inHand).map((p) => p.seat).sort((a, b) => a - b);
  const { sbSeat, bbSeat } = deriveBlindSeats(state.dealerSeat, seatsInHand);

  const reveal = state.stage === "showdown" || state.stage === "handover";
  const showdownById = new Map(state.showdown.map((s) => [s.playerId, s]));

  const secondsLeft =
    state.toActSeat >= 0 && ["preflop", "flop", "turn", "river"].includes(state.stage)
      ? Math.max(0, Math.ceil((state.toActSince + state.actionTimeoutMs - serverNow) / 1000))
      : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-3 py-3">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button onClick={onLeave} className="btn-neutral px-3 py-1.5 text-sm">
            Leave
          </button>
          <div>
            <div className="text-xs text-slate-400">Room</div>
            <div className="text-xl font-black tracking-[0.2em] text-amber-300">{state.code}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onCopy} className="btn-gold px-3 py-1.5 text-sm">
            {copied ? "Copied!" : "Invite link"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-2 rounded-lg bg-rose-500/15 px-3 py-1.5 text-sm text-rose-300">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="relative w-full" style={{ paddingBottom: "62%" }}>
        <div className="absolute inset-0">
          <div className="felt absolute inset-x-2 inset-y-4 rounded-[45%]" />

          {/* Center: community + status */}
          <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
            {inLobby ? (
              <LobbyCenter
                state={state}
                onStart={onStart}
                busy={busy}
              />
            ) : (
              <>
                <CommunityBoard state={state} />
                {(reveal || gameOver) && state.winnersText && (
                  <div className="max-w-xs animate-fade-in rounded-lg bg-black/60 px-4 py-2 text-center text-sm font-semibold text-amber-200 shadow">
                    {state.winnersText}
                  </div>
                )}
                <div className="text-[11px] uppercase tracking-widest text-emerald-200/60">
                  {stageLabel(state.stage)} · Hand #{state.handNumber}
                </div>
              </>
            )}
          </div>

          {/* Seats */}
          {players.map((p, i) => (
            <div
              key={p.id}
              className="absolute"
              style={{
                left: positions[i].left,
                top: positions[i].top,
                transform: "translate(-50%, -50%)",
              }}
            >
              <PlayerSeat
                player={p}
                isDealer={p.seat === state.dealerSeat && !inLobby}
                isCurrent={p.seat === state.toActSeat}
                blindLabel={
                  inLobby ? "" : p.seat === sbSeat ? "SB" : p.seat === bbSeat ? "BB" : ""
                }
                showdown={showdownById.get(p.id)}
                secondsLeft={p.seat === state.toActSeat ? secondsLeft : null}
                reveal={reveal}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Controls / status row */}
      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {gameOver ? (
            <GameOver state={state} onNext={onNext} busy={busy} />
          ) : inLobby ? (
            <LobbyInfo state={state} onCopy={onCopy} copied={copied} />
          ) : state.stage === "handover" ? (
            <HandOver state={state} onNext={onNext} busy={busy} serverNow={serverNow} />
          ) : (
            <ActionControls state={state} busy={busy} onAction={onAct} />
          )}
        </div>
        <LogPanel state={state} />
      </div>
    </main>
  );
}

function LobbyCenter({
  state,
  onStart,
  busy,
}: {
  state: PublicState;
  onStart: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="text-sm uppercase tracking-widest text-emerald-100/70">Waiting room</div>
      <div className="text-4xl font-black tracking-[0.3em] text-amber-300">{state.code}</div>
      <div className="text-xs text-slate-200/80">
        {state.players.length} / 10 seated · {state.bigBlind}/{state.smallBlind} blinds
      </div>
      {state.isHost ? (
        <button
          className="btn-primary px-6"
          onClick={onStart}
          disabled={busy || state.players.length < 2}
        >
          {state.players.length < 2 ? "Need 2+ players" : "Deal first hand"}
        </button>
      ) : (
        <div className="text-sm text-slate-200/80">Waiting for the host to start…</div>
      )}
    </div>
  );
}

function LobbyInfo({
  state,
  onCopy,
  copied,
}: {
  state: PublicState;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-900/80 p-4 ring-1 ring-slate-700">
      <h3 className="mb-2 font-semibold text-slate-200">Players at the table</h3>
      <ul className="mb-3 grid grid-cols-2 gap-1 text-sm">
        {state.players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-slate-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            {p.name}
            {p.id === state.hostId && <span className="text-xs text-amber-300">host</span>}
            {p.isYou && <span className="text-xs text-slate-500">you</span>}
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-400">
        Share the room code <span className="font-bold text-amber-300">{state.code}</span> or{" "}
        <button onClick={onCopy} className="underline">
          {copied ? "link copied!" : "copy the invite link"}
        </button>
        . Up to 10 players.
      </p>
    </div>
  );
}

function HandOver({
  state,
  onNext,
  busy,
  serverNow,
}: {
  state: PublicState;
  onNext: () => void;
  busy: boolean;
  serverNow: number;
}) {
  const wait = Math.max(0, Math.ceil((state.handOverAt + 6000 - serverNow) / 1000));
  return (
    <div className="flex h-[88px] flex-col items-center justify-center gap-2 rounded-xl bg-slate-900/80 ring-1 ring-slate-700">
      <div className="text-sm font-semibold text-amber-200">{state.winnersText}</div>
      {state.isHost ? (
        <button className="btn-primary px-5 py-1.5 text-sm" onClick={onNext} disabled={busy}>
          Deal next hand
        </button>
      ) : (
        <div className="text-xs text-slate-400">Next hand in {wait}s…</div>
      )}
    </div>
  );
}

function GameOver({
  state,
  onNext,
  busy,
}: {
  state: PublicState;
  onNext: () => void;
  busy: boolean;
}) {
  const ranked = [...state.players].sort((a, b) => b.chips - a.chips);
  return (
    <div className="rounded-xl bg-slate-900/80 p-4 ring-1 ring-slate-700">
      <h3 className="mb-2 text-lg font-bold text-amber-300">🏆 Game over</h3>
      <ol className="mb-3 space-y-1 text-sm">
        {ranked.map((p, i) => (
          <li key={p.id} className="flex justify-between text-slate-300">
            <span>
              {i + 1}. {p.name} {p.isYou && "(you)"}
            </span>
            <span className="font-bold text-emerald-300">{p.chips.toLocaleString()}</span>
          </li>
        ))}
      </ol>
      {state.isHost && (
        <button className="btn-primary text-sm" onClick={onNext} disabled={busy}>
          Start a new hand
        </button>
      )}
    </div>
  );
}

function LogPanel({ state }: { state: PublicState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [state.log.length]);
  return (
    <div className="rounded-xl bg-slate-900/80 p-3 ring-1 ring-slate-700">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Hand log
      </h3>
      <div
        ref={ref}
        className="scrollbar-thin h-32 overflow-y-auto text-xs leading-relaxed text-slate-300 lg:h-[88px]"
      >
        {state.log.slice(-30).map((line, i) => (
          <div key={i}>{line}</div>
        ))}
      </div>
    </div>
  );
}

function stageLabel(stage: string): string {
  switch (stage) {
    case "preflop":
      return "Pre-flop";
    case "flop":
      return "Flop";
    case "turn":
      return "Turn";
    case "river":
      return "River";
    case "showdown":
      return "Showdown";
    case "handover":
      return "Hand complete";
    default:
      return stage;
  }
}

function deriveBlindSeats(dealerSeat: number, seatsInHand: number[]) {
  if (seatsInHand.length < 2) return { sbSeat: -1, bbSeat: -1 };
  const ordered = [...seatsInHand].sort((a, b) => a - b);
  const idxAfter = (seat: number) => {
    for (let i = 1; i <= 10; i++) {
      const cand = ordered.find((s) => s === (seat + i) % 10);
      if (cand !== undefined) return cand;
    }
    return ordered[0];
  };
  if (seatsInHand.length === 2) {
    // Heads-up: dealer is SB.
    return { sbSeat: dealerSeat, bbSeat: idxAfter(dealerSeat) };
  }
  const sbSeat = idxAfter(dealerSeat);
  const bbSeat = idxAfter(sbSeat);
  return { sbSeat, bbSeat };
}
