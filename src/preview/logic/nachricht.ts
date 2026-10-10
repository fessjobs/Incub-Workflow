// Nachrichtenvorlagen: Platzhalter füllen und WhatsApp-Links bauen. Es wird nichts verschickt –
// das Team kopiert die Nachricht oder öffnet WhatsApp mit vorbereitetem Text und sendet selbst.
import type { Crew } from "./types";

export const PLATZHALTER = ["{vorname}", "{nachname}", "{pnr}", "{link}"] as const;

export function fuelleVorlage(text: string, c: Pick<Crew, "vorname" | "nachname" | "pnr">, link: string): string {
  return text
    .replace(/\{vorname\}/g, c.vorname)
    .replace(/\{nachname\}/g, c.nachname)
    .replace(/\{pnr\}/g, c.pnr)
    .replace(/\{link\}/g, link);
}

// Handynummer → internationale Ziffernfolge für wa.me (49151…), null wenn unbrauchbar
export function waNummer(telefon: string): string | null {
  let t = telefon.trim().replace(/[^\d+]/g, "");
  if (!t) return null;
  if (t.startsWith("+")) t = t.slice(1);
  else if (t.startsWith("00")) t = t.slice(2);
  else if (t.startsWith("0")) t = `49${t.slice(1)}`;
  else if (!t.startsWith("49") && t.length <= 11) t = `49${t}`;
  return /^\d{9,15}$/.test(t) ? t : null;
}

export function waLink(telefon: string, text: string): string | null {
  const n = waNummer(telefon);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

// Hat die Vorlage einen {link}-Platzhalter? Dann braucht jede Nachricht einen persönlichen Link.
export function brauchtLink(text: string): boolean {
  return text.includes("{link}");
}
