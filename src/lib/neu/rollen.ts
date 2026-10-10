// Rollen im neuen Dashboard. Reine Logik ohne Server-Importe, damit Server (Prüfung)
// und Oberfläche (Menü) dieselbe Tabelle nutzen. Das Menü blendet aus, der Server
// verweigert: nur die Prüfung am Server zählt.
import type { Kind } from "./schemas";

export const ROLLEN = ["admin", "dispo", "buchhaltung", "lesen"] as const;
export type NeuRolle = (typeof ROLLEN)[number];

export const ROLLEN_NAME: Record<NeuRolle, string> = {
  admin: "Administration",
  dispo: "Disposition",
  buchhaltung: "Buchhaltung",
  lesen: "Nur lesen",
};

export const ROLLEN_TEXT: Record<NeuRolle, string> = {
  admin: "Alles, auch Einstellungen, Importe, Benutzer und Schnittstelle.",
  dispo: "Aufträge, Bewerber, Crew, Disposition, Freigaben, Nachrichten, Kleidung, Auftragsimport. Keine Verträge ändern, keine Abrechnung.",
  buchhaltung: "Stundentabelle und Unterlagen (Belege), Crew lesend. Keine Disposition.",
  lesen: "Alles ansehen, nichts ändern.",
};

// Wer darf was in den Datensätzen speichern?
const SCHREIBEN: Record<NeuRolle, ReadonlyArray<Kind> | "alle"> = {
  admin: "alle",
  dispo: ["crew", "job", "bewerbung", "auftrag", "zuweisung", "briefing", "notiz"],
  buchhaltung: ["stunde", "beleg", "notiz"],
  lesen: [],
};

export function darfSchreiben(rolle: NeuRolle, kind: Kind): boolean {
  const w = SCHREIBEN[rolle];
  return w === "alle" || w.includes(kind);
}

// Lesen dürfen alle Rollen alles außer der Benutzerliste
export function darfLesen(rolle: NeuRolle, kind: Kind): boolean {
  return kind !== "benutzer" || rolle === "admin";
}

// Aktionen außerhalb der Datensätze (Importe, Nachrichten, Links …)
export type Aktion = "import-personal" | "import-auftraege" | "nachrichten" | "einstellungen" | "benutzer" | "schnittstelle" | "beispieldaten" | "beleg-link" | "sicherung";

const AKTIONEN: Record<NeuRolle, ReadonlyArray<Aktion> | "alle"> = {
  admin: "alle",
  dispo: ["import-auftraege", "nachrichten", "beleg-link"],
  buchhaltung: ["beleg-link"],
  lesen: [],
};

export function darfAktion(rolle: NeuRolle, aktion: Aktion): boolean {
  const a = AKTIONEN[rolle];
  return a === "alle" || a.includes(aktion);
}

// Seiten (Pfade relativ zu /admin) je Rolle; "*" = alle
const SEITEN: Record<NeuRolle, ReadonlyArray<string> | "*"> = {
  admin: "*",
  dispo: ["/admin", "/admin/dispo", "/admin/bewerber", "/admin/freigaben", "/admin/crew", "/admin/kleidung", "/admin/unterweisungen", "/admin/nachrichten", "/admin/import"],
  buchhaltung: ["/admin", "/admin/stunden", "/admin/unterlagen", "/admin/crew"],
  lesen: ["/admin", "/admin/dispo", "/admin/bewerber", "/admin/freigaben", "/admin/crew", "/admin/kleidung", "/admin/unterweisungen", "/admin/stunden", "/admin/unterlagen"],
};

export function darfSeite(rolle: NeuRolle, pfad: string): boolean {
  const s = SEITEN[rolle];
  if (s === "*") return true;
  return s.some((p) => pfad === p || (p !== "/admin" && pfad.startsWith(`${p}/`)));
}

export function istRolle(x: unknown): x is NeuRolle {
  return typeof x === "string" && (ROLLEN as readonly string[]).includes(x);
}
