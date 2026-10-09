// Beleg-Link (Modul A): Belegarten, Beiblatt-Vorlagen und der Abgleich
// zwischen Eingabe und ausgelesenen Werten.
export const BELEGARTEN = ["Tanken", "Parken", "Bahn", "Hotel", "Verpflegung", "Material", "Sonstiges"] as const;
export type Belegart = (typeof BELEGARTEN)[number];

// Wie der Beleg im Archiv heißt („Tankbeleg“, nicht „Tankenbeleg“)
export const BELEG_BEZEICHNUNG: Record<Belegart, string> = {
  Tanken: "Tankbeleg",
  Parken: "Parkbeleg",
  Bahn: "Fahrkarte",
  Hotel: "Übernachtungsbeleg",
  Verpflegung: "Verpflegungsbeleg",
  Material: "Materialbeleg",
  Sonstiges: "Beleg",
};

export const BEIBLATT_VORLAGEN: Record<Belegart, string> = {
  Tanken: "Tankbeleg zum Auftrag {auftrag_id} ({kunde}, {ort}, {datum}). Fahrt im Auftrag von {mitarbeiter}. Zweck: {zweck}.",
  Parken: "Parkbeleg zum Auftrag {auftrag_id} ({kunde}, {ort}, {datum}). Parken im Auftrag von {mitarbeiter}. Zweck: {zweck}.",
  Bahn: "Fahrkarte zum Auftrag {auftrag_id} ({kunde}, {ort}, {datum}). Reise von {mitarbeiter}. Zweck: {zweck}.",
  Hotel: "Übernachtungsbeleg zum Auftrag {auftrag_id} ({kunde}, {ort}, {datum}). Übernachtung von {mitarbeiter}. Zweck: {zweck}.",
  Verpflegung: "Verpflegungsbeleg zum Auftrag {auftrag_id} ({kunde}, {ort}, {datum}). Ausgelegt von {mitarbeiter}. Zweck: {zweck}.",
  Material: "Materialbeleg zum Auftrag {auftrag_id} ({kunde}, {ort}, {datum}). Besorgt von {mitarbeiter}. Zweck: {zweck}.",
  Sonstiges: "Beleg zum Auftrag {auftrag_id} ({kunde}, {ort}, {datum}). Eingereicht von {mitarbeiter}. Zweck: {zweck}.",
};

export interface BeiblattWerte {
  auftrag_id: string;
  kunde: string;
  ort: string;
  datum: string;
  mitarbeiter: string;
  zweck: string;
}

export function beiblattText(vorlage: string, w: BeiblattWerte): string {
  return vorlage.replace(/\{(auftrag_id|kunde|ort|datum|mitarbeiter|zweck)\}/g, (_, k: keyof BeiblattWerte) => w[k] || "–");
}

export interface BelegEingabe {
  betrag: number | null;
  datum: string;
  haendler: string;
}

export interface BelegAuslesung {
  betrag: number;
  datum: string;
  haendler: string;
}

export interface Abweichung {
  feld: "betrag" | "datum" | "haendler";
  eingabe: string;
  gelesen: string;
}

// Abweichungen werden gelb markiert; sie sind Hinweise, keine Ablehnung
export function belegAbweichungen(eingabe: BelegEingabe, gelesen: BelegAuslesung): Abweichung[] {
  const out: Abweichung[] = [];
  if (eingabe.betrag === null || Math.abs(eingabe.betrag - gelesen.betrag) > 0.009) {
    out.push({ feld: "betrag", eingabe: eingabe.betrag === null ? "–" : eingabe.betrag.toFixed(2).replace(".", ","), gelesen: gelesen.betrag.toFixed(2).replace(".", ",") });
  }
  if (eingabe.datum && eingabe.datum !== gelesen.datum) out.push({ feld: "datum", eingabe: eingabe.datum, gelesen: gelesen.datum });
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
  if (eingabe.haendler && norm(eingabe.haendler) !== norm(gelesen.haendler) && !norm(gelesen.haendler).includes(norm(eingabe.haendler))) {
    out.push({ feld: "haendler", eingabe: eingabe.haendler, gelesen: gelesen.haendler });
  }
  return out;
}

// Im Prototyp liest niemand wirklich – aus dem Dateinamen wird ein stabiler
// Beispielwert abgeleitet. In der echten Umsetzung ist das der Claude-Aufruf.
export function simuliereAuslesung(dateiname: string, art: Belegart, datum: string): BelegAuslesung {
  let h = 0;
  for (const c of dateiname) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0;
  const betrag = Math.round((8 + (h % 9200) / 100) * 100) / 100;
  const haendler: Record<Belegart, string[]> = {
    Tanken: ["Aral Tankstelle", "Shell Station", "Esso"],
    Parken: ["Parkhaus City", "Q-Park", "APCOA"],
    Bahn: ["DB Fernverkehr", "DB Regio", "VRS"],
    Hotel: ["Ibis Budget", "B&B Hotel", "Motel One"],
    Verpflegung: ["Bäckerei Schmid", "REWE", "Edeka"],
    Material: ["Hornbach", "Bauhaus", "Würth"],
    Sonstiges: ["Kiosk am Eck", "Postfiliale", "Copyshop"],
  };
  return { betrag, datum, haendler: haendler[art][h % haendler[art].length] };
}

export function belegDateiNameOk(name: string): boolean {
  return /\.(jpe?g|png|webp|heic|pdf)$/i.test(name);
}
