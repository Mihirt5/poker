"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createRoom,
  joinRoom,
  recallName,
  rememberName,
  saveIdentity,
} from "@/lib/client";

export default function HomePage() {
  const router = useRouter();
  const [tab, setTab] = useState<"join" | "create">("join");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [startingChips, setStartingChips] = useState(1000);
  const [bigBlind, setBigBlind] = useState(20);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(recallName());
    const url = new URL(window.location.href);
    const c = url.searchParams.get("code");
    if (c) {
      setCode(c.toUpperCase());
      setTab("join");
    }
  }, []);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      rememberName(name.trim());
      const res = await joinRoom({ code: code.trim().toUpperCase(), name: name.trim() });
      saveIdentity(res.code, { playerId: res.playerId, token: res.token, name: name.trim() });
      router.push(`/room/${res.code}`);
    } catch (err: any) {
      setError(err.message || "Could not join.");
      setBusy(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      rememberName(name.trim());
      const smallBlind = Math.max(1, Math.floor(bigBlind / 2));
      const res = await createRoom({
        name: name.trim(),
        startingChips,
        smallBlind,
        bigBlind,
      });
      saveIdentity(res.code, { playerId: res.playerId, token: res.token, name: name.trim() });
      router.push(`/room/${res.code}`);
    } catch (err: any) {
      setError(err.message || "Could not create a table.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <h1 className="text-5xl font-black tracking-tight">
          <span className="text-emerald-400">Hold</span>
          <span className="text-amber-400">&apos;em</span>
        </h1>
        <p className="mt-2 text-slate-300">Texas Hold&apos;em for up to 10 players. No sign-up.</p>
      </div>

      <div className="w-full rounded-2xl border border-slate-700/70 bg-slate-900/60 p-5 shadow-xl backdrop-blur">
        <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-slate-800 p-1">
          <button
            className={`rounded-md py-2 text-sm font-semibold transition ${
              tab === "join" ? "bg-emerald-500 text-emerald-950" : "text-slate-300"
            }`}
            onClick={() => setTab("join")}
          >
            Join a table
          </button>
          <button
            className={`rounded-md py-2 text-sm font-semibold transition ${
              tab === "create" ? "bg-emerald-500 text-emerald-950" : "text-slate-300"
            }`}
            onClick={() => setTab("create")}
          >
            Create a table
          </button>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium text-slate-300">Your name</label>
          <input
            className="input"
            value={name}
            maxLength={20}
            placeholder="e.g. Alex"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {tab === "join" ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Room code</label>
              <input
                className="input uppercase tracking-[0.3em]"
                value={code}
                maxLength={6}
                placeholder="ABCD"
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
            </div>
            <button className="btn-primary w-full" disabled={busy || !name.trim() || !code.trim()}>
              {busy ? "Joining…" : "Join table"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">
                  Starting chips
                </label>
                <input
                  className="input"
                  type="number"
                  min={100}
                  max={1000000}
                  step={100}
                  value={startingChips}
                  onChange={(e) => setStartingChips(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Big blind</label>
                <input
                  className="input"
                  type="number"
                  min={2}
                  step={2}
                  value={bigBlind}
                  onChange={(e) => setBigBlind(Number(e.target.value))}
                />
              </div>
            </div>
            <p className="text-xs text-slate-400">
              Small blind will be {Math.max(1, Math.floor(bigBlind / 2))}. You&apos;ll be the host
              and control when each hand starts.
            </p>
            <button className="btn-primary w-full" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create table"}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
        )}
      </div>

      <p className="max-w-sm text-center text-xs text-slate-500">
        Share the room code with friends so they can join from their own devices. Cards are dealt
        server-side — no one can see your hole cards.
      </p>
    </main>
  );
}
