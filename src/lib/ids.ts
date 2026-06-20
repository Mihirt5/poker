import { randomBytes, randomUUID } from "crypto";

// Avoid ambiguous characters (0/O, 1/I) in room codes.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makeRoomCode(length = 4): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export function makeId(): string {
  return randomUUID();
}

export function makeToken(): string {
  return randomBytes(24).toString("hex");
}
