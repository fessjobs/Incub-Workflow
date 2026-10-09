// Zugangs-Tokens des neuen Systems: zufällig, nur der Hash wird gespeichert.
import { createHash, randomBytes } from "crypto";

export function neuesToken(): string {
  return randomBytes(24).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function dateiHash(daten: Uint8Array): string {
  return createHash("sha256").update(daten).digest("hex");
}

export function inTagen(tage: number, ab: Date = new Date()): Date {
  return new Date(ab.getTime() + tage * 86_400_000);
}
