import { NextResponse } from "next/server";
import type { GameState, Player } from "./types";

export function ok(data: unknown) {
  return NextResponse.json(data);
}

export function err(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function sanitizeName(raw: unknown): string {
  const name = String(raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) throw new ApiError("Please enter a name.");
  if (name.length > 20) throw new ApiError("Name must be 20 characters or fewer.");
  return name;
}

export function authPlayer(state: GameState, playerId: unknown, token: unknown): Player {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || p.token !== token) {
    throw new ApiError("You are not seated at this table.", 403);
  }
  p.lastSeen = Date.now();
  p.connected = true;
  return p;
}

// The secret that unlocks the hidden god-mode admin panel. Override with the
// ADMIN_SECRET env var; falls back to a default for local play.
export const ADMIN_SECRET = process.env.ADMIN_SECRET || "letmein";

export function isAdmin(secret: unknown): boolean {
  return typeof secret === "string" && secret.length > 0 && secret === ADMIN_SECRET;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
