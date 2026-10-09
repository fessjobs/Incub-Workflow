// Beleg-Link des neuen Systems: Token prüfen, Datei prüfen, speichern.
import { db } from "@/lib/db";
import { tokenHash } from "./token";

const ERLAUBT: Array<{ mime: string; pruefe: (b: Uint8Array) => boolean }> = [
  { mime: "image/jpeg", pruefe: (b) => b[0] === 0xff && b[1] === 0xd8 },
  { mime: "image/png", pruefe: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "application/pdf", pruefe: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 },
  { mime: "image/webp", pruefe: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 },
  { mime: "image/heic", pruefe: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 },
];

export const MAX_BELEG_BYTES = 10 * 1024 * 1024;

// Prüft den Inhalt der Datei, nicht nur die Endung oder den angegebenen Typ
export function erkenneDatei(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  return ERLAUBT.find((e) => e.pruefe(bytes))?.mime ?? null;
}

export async function belegLinkPruefen(token: string): Promise<{ organizationId: string; jobId: string } | null> {
  const a = await db.v2Access.findUnique({ where: { tokenHash: tokenHash(token) } });
  if (!a || a.kind !== "beleg" || a.expiresAt < new Date()) return null;
  return { organizationId: a.organizationId, jobId: a.refId };
}
