"use client";

import type { PublicState } from "./types";

// Per-room identity persisted in the browser so refreshes keep your seat.
export interface Identity {
  playerId: string;
  token: string;
  name: string;
}

function key(code: string) {
  return `holdem:identity:${code.toUpperCase()}`;
}

export function saveIdentity(code: string, id: Identity) {
  try {
    localStorage.setItem(key(code), JSON.stringify(id));
  } catch {
    /* ignore */
  }
}

export function loadIdentity(code: string): Identity | null {
  try {
    const raw = localStorage.getItem(key(code));
    return raw ? (JSON.parse(raw) as Identity) : null;
  } catch {
    return null;
  }
}

export function clearIdentity(code: string) {
  try {
    localStorage.removeItem(key(code));
  } catch {
    /* ignore */
  }
}

export function rememberName(name: string) {
  try {
    localStorage.setItem("holdem:name", name);
  } catch {
    /* ignore */
  }
}

export function recallName(): string {
  try {
    return localStorage.getItem("holdem:name") ?? "";
  } catch {
    return "";
  }
}

async function parse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function createRoom(input: {
  name: string;
  startingChips: number;
  smallBlind: number;
  bigBlind: number;
}): Promise<{ code: string; playerId: string; token: string }> {
  const res = await fetch("/api/room/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parse(res);
}

export async function joinRoom(input: {
  code: string;
  name: string;
}): Promise<{ code: string; playerId: string; token: string }> {
  const res = await fetch("/api/room/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  return parse(res);
}

export async function fetchState(
  code: string,
  id: Identity,
  adminSecret?: string
): Promise<PublicState> {
  const qs = new URLSearchParams({ playerId: id.playerId, token: id.token });
  if (adminSecret) qs.set("admin", adminSecret);
  const res = await fetch(`/api/room/${code}/state?${qs.toString()}`, {
    cache: "no-store",
  });
  return parse(res);
}

// Fire a god-mode command. Resolves to the full (revealed) admin state.
export async function sendAdmin(
  code: string,
  id: Identity,
  secret: string,
  command: Record<string, unknown>
): Promise<PublicState> {
  return post(code, "admin", id, { secret, command });
}

async function post(code: string, path: string, id: Identity, extra: Record<string, unknown> = {}) {
  const res = await fetch(`/api/room/${code}/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerId: id.playerId, token: id.token, ...extra }),
  });
  return parse(res);
}

export const startGame = (code: string, id: Identity) => post(code, "start", id);
export const nextHand = (code: string, id: Identity) => post(code, "next", id);
export const leaveTable = (code: string, id: Identity) => post(code, "leave", id);
export const sendAction = (
  code: string,
  id: Identity,
  action: string,
  amount?: number
) => post(code, "action", id, { action, amount });
