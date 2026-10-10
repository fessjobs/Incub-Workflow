// Mitgelieferte Unterweisungsvideos (public/videos): Dateiname prüfen, Pfad finden, Dauer aus der MP4 lesen.
// Die Dauer braucht der Server, um zu prüfen, dass ein Video nicht in Sekunden "abgespielt" wurde.
import { promises as fs } from "fs";
import path from "path";
import { MEDIEN_PFAD } from "@/preview/logic/unterweisung";

// z. B. grund.de.mp4, grund.de.jpg, grund.de.v2.mp4
export const MEDIEN_NAME = /^[a-z0-9][a-z0-9.-]{0,60}\.(mp4|jpg)$/;

export function medienName(roh: string): string | null {
  return MEDIEN_NAME.test(roh) && !roh.includes("..") ? roh : null;
}

export function videoOrdner(): string {
  return path.join(process.cwd(), "public", "videos");
}

// Länge in Sekunden aus dem 'mvhd'-Kasten einer MP4; null, wenn nicht lesbar
export function mp4Dauer(bytes: Uint8Array): number | null {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const finde = (von: number, bis: number, typ: string): { start: number; ende: number } | null => {
    let pos = von;
    while (pos + 8 <= bis) {
      let groesse = dv.getUint32(pos);
      const t = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
      let kopf = 8;
      if (groesse === 1 && pos + 16 <= bis) {
        groesse = Number(dv.getBigUint64(pos + 8));
        kopf = 16;
      } else if (groesse === 0) groesse = bis - pos;
      if (groesse < kopf) return null;
      if (t === typ) return { start: pos + kopf, ende: Math.min(pos + groesse, bis) };
      pos += groesse;
    }
    return null;
  };
  const moov = finde(0, bytes.length, "moov");
  if (!moov) return null;
  const mvhd = finde(moov.start, moov.ende, "mvhd");
  if (!mvhd || mvhd.ende - mvhd.start < 20) return null;
  const version = bytes[mvhd.start];
  let zeitskala: number;
  let dauer: number;
  if (version === 1) {
    if (mvhd.ende - mvhd.start < 32) return null;
    zeitskala = dv.getUint32(mvhd.start + 20);
    dauer = Number(dv.getBigUint64(mvhd.start + 24));
  } else {
    zeitskala = dv.getUint32(mvhd.start + 12);
    dauer = dv.getUint32(mvhd.start + 16);
  }
  return zeitskala > 0 && dauer > 0 ? dauer / zeitskala : null;
}

const cache = new Map<string, number | null>();

// Dauer eines eigenen Videos anhand seiner Adresse (…/video/grund.de.mp4); fremde Adressen: unbekannt (null)
export async function videoDauerFuerUrl(url: string | undefined): Promise<number | null> {
  if (!url) return null;
  const name = url.startsWith(MEDIEN_PFAD) ? medienName(url.slice(MEDIEN_PFAD.length)) : url.startsWith("/videos/") ? medienName(url.slice("/videos/".length)) : null;
  if (!name || !name.endsWith(".mp4")) return null;
  if (cache.has(name)) return cache.get(name) ?? null;
  let dauer: number | null = null;
  try {
    const f = await fs.open(path.join(videoOrdner(), name), "r");
    try {
      const { size } = await f.stat();
      const puffer = Buffer.alloc(Math.min(size, 2 * 1024 * 1024));
      await f.read(puffer, 0, puffer.length, 0);
      dauer = mp4Dauer(puffer);
    } finally {
      await f.close();
    }
  } catch {
    dauer = null;
  }
  cache.set(name, dauer);
  return dauer;
}

// Wie viel der Videolänge muss mindestens vergangen sein? Standard 85 %; 0 schaltet die Prüfung aus (nur für Tests).
export function mindestAnteil(env: Record<string, string | undefined> = process.env): number {
  const roh = env.NEU_VIDEO_MINDESTANTEIL;
  if (roh === undefined || roh.trim() === "") return 0.85;
  const n = Number(roh.replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.85;
}
