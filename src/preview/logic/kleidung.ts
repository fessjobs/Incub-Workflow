// Arbeitskleidung gegen Pfand: Bedarf nach Größe, Ausgabe und offenes Pfand.
import type { Crew, KleidungAusgabe } from "./types";
import type { KleidungArtikel } from "./einstellungen-neu";

// Die Größe, die für diesen Artikel gilt – aus dem Fragebogen der Person
export function groesseFuer(c: Crew, a: KleidungArtikel): string {
  const p = c.profile;
  if (!p) return "";
  if (a.groessen === "shirt") return p.shirtgroesse ?? "";
  if (a.groessen === "hose") return p.kleidung?.hosengroesse ?? "";
  if (a.groessen === "schuh") return p.schuhgroesse ?? "";
  return "–";
}

export function artikelLabel(artikel: KleidungArtikel[], id: string): string {
  return artikel.find((x) => x.id === id)?.label ?? id;
}

export function offeneAusgaben(c: Crew): KleidungAusgabe[] {
  return (c.kleidungAusgabe ?? []).filter((x) => x.zurueckAm === null);
}

export function offenesPfand(crew: Crew[]): number {
  let n = 0;
  for (const c of crew) for (const x of offeneAusgaben(c)) n += x.pfandEur;
  return Math.round(n * 100) / 100;
}

export interface BedarfsZeile {
  artikel: KleidungArtikel;
  // Größe → Personen, die den Artikel gewünscht und noch nicht bekommen haben
  nachGroesse: Map<string, Crew[]>;
  summe: number;
}

// Wer wünscht was und hat es noch nicht (oder hat es zurückgegeben)?
export function bedarf(crew: Crew[], artikel: KleidungArtikel[]): BedarfsZeile[] {
  return artikel.map((a) => {
    const nachGroesse = new Map<string, Crew[]>();
    let summe = 0;
    for (const c of crew) {
      if (c.status === "ausgeschieden") continue;
      const k = c.profile?.kleidung;
      if (!k?.wunsch || !k.artikel.includes(a.id)) continue;
      if (offeneAusgaben(c).some((x) => x.artikel === a.id)) continue;
      const g = groesseFuer(c, a) || "ohne Größe";
      nachGroesse.set(g, [...(nachGroesse.get(g) ?? []), c]);
      summe++;
    }
    return { artikel: a, nachGroesse, summe };
  });
}

const GROESSEN_REIHE = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
export function sortiereGroessen(gs: string[]): string[] {
  const rang = (g: string) => {
    const i = GROESSEN_REIHE.indexOf(g);
    if (i >= 0) return i;
    const n = Number(g);
    return Number.isFinite(n) ? 100 + n : 1000;
  };
  return [...gs].sort((a, b) => rang(a) - rang(b) || a.localeCompare(b));
}

// CSV für Excel (Semikolon, mit BOM): jede Zelle in Anführungszeichen
export function csv(zeilen: string[][]): string {
  return "﻿" + zeilen.map((z) => z.map((x) => `"${x.replace(/"/g, '""')}"`).join(";")).join("\r\n");
}
