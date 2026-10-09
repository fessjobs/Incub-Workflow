// Plausibilität der Stundentabelle (Modul E). Reine Funktionen: Eingabe sind
// die Zeilen und die Verträge, Ausgabe je Zeile eine Liste von Hinweisen.
//
// Zwei Stufen:
//   fehler    – so lässt sich die Zeile nicht exportieren (Doppeleinsatz,
//               kein Vertrag, Pflichtfeld fehlt)
//   warnung   – prüfen, aber exportierbar (Schicht lang, Ruhezeit, Pause,
//               Monatsgrenze)
import type { Contract, StundenRow, Warnung } from "./types";
import { absEnde, absStart, formatDatumDE, gesamtzeit, nettoMinuten, bruttoMinuten, pauseMinuten } from "./zeit";

export interface PruefKontext {
  // Personalnummer → bekannt? (und der Vertrag, falls vorhanden)
  personen: Map<string, { vertraege: Contract[] }>;
}

export const GRENZEN = {
  maxNettoStunden: 10,
  ruhezeitStunden: 11,
  pauseAb6h: 30,
  pauseAb9h: 45,
} as const;

export function vertragAm(vertraege: Contract[], datum: string): Contract | null {
  return vertraege.find((v) => v.gueltigVon <= datum && (v.gueltigBis === null || v.gueltigBis >= datum)) ?? null;
}

export function verdienstZeile(row: StundenRow, stundenlohn: number): number {
  const std = gesamtzeit(row.start, row.ende, row.pausen);
  const stunden = Math.max(std, row.pauschale);
  return Math.round((stunden * stundenlohn + row.bonus - row.abzug) * 100) / 100;
}

export function pruefeZeilen(rows: StundenRow[], ctx: PruefKontext): Map<string, Warnung[]> {
  const out = new Map<string, Warnung[]>();
  const add = (id: string, w: Warnung) => {
    const list = out.get(id) ?? [];
    list.push(w);
    out.set(id, list);
  };

  // Pflichtfelder und Einzelzeilen-Regeln
  for (const r of rows) {
    const person = ctx.personen.get(r.pnr);
    if (!r.pnr || !person) add(r.id, { code: "pnr", level: "fehler", text: r.pnr ? `Personalnummer ${r.pnr} ist nicht im Stamm.` : "Personalnummer fehlt." });
    if (!r.start || !r.ende) {
      add(r.id, { code: "zeit", level: "fehler", text: "Start- oder Endzeit fehlt." });
      continue;
    }
    const netto = nettoMinuten(r.start, r.ende, r.pausen);
    const brutto = bruttoMinuten(r.start, r.ende);
    const pause = pauseMinuten(r.pausen);

    if (netto > GRENZEN.maxNettoStunden * 60) {
      add(r.id, { code: "ueber10", level: "warnung", text: `Arbeitszeit ${(netto / 60).toFixed(2).replace(".", ",")} h – über ${GRENZEN.maxNettoStunden} h.` });
    }
    if (brutto > 360 && pause === 0) {
      add(r.id, { code: "pause_fehlt", level: "warnung", text: "Keine Pause eingetragen (Schicht über 6 h)." });
    } else if (brutto > 540 && pause < GRENZEN.pauseAb9h) {
      add(r.id, { code: "pause_kurz", level: "warnung", text: `Pause ${pause} min – ab 9 h sind ${GRENZEN.pauseAb9h} min vorgesehen.` });
    } else if (brutto > 360 && pause < GRENZEN.pauseAb6h) {
      add(r.id, { code: "pause_kurz", level: "warnung", text: `Pause ${pause} min – ab 6 h sind ${GRENZEN.pauseAb6h} min vorgesehen.` });
    }

    if (person && r.datum) {
      if (!vertragAm(person.vertraege, r.datum)) add(r.id, { code: "vertrag", level: "fehler", text: `Kein gültiger Vertrag am ${formatDatumDE(r.datum)}.` });
    }
  }

  // Je Person chronologisch: Doppeleinsatz, Ruhezeit, Monatsgrenze
  const jePerson = new Map<string, StundenRow[]>();
  for (const r of rows) {
    if (!r.pnr || !r.start || !r.ende) continue;
    const list = jePerson.get(r.pnr) ?? [];
    list.push(r);
    jePerson.set(r.pnr, list);
  }
  for (const [pnr, list] of jePerson) {
    list.sort((a, b) => absStart(a.datum, a.start) - absStart(b.datum, b.start));
    const person = ctx.personen.get(pnr);
    const monatsSumme = new Map<string, { std: number; eur: number }>();

    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      const s = absStart(r.datum, r.start);
      const e = absEnde(r.datum, r.start, r.ende);

      // Überschneidung mit irgendeiner früheren Zeile derselben Person
      for (let j = 0; j < i; j++) {
        const o = list[j];
        const os = absStart(o.datum, o.start);
        const oe = absEnde(o.datum, o.start, o.ende);
        if (s < oe && os < e) {
          add(r.id, { code: "doppelt", level: "fehler", text: `Doppeleinsatz: überschneidet sich mit ${o.auftrag || "anderem Einsatz"} (${formatDatumDE(o.datum)} ${o.start}–${o.ende}).` });
          add(o.id, { code: "doppelt", level: "fehler", text: `Doppeleinsatz: überschneidet sich mit ${r.auftrag || "anderem Einsatz"} (${formatDatumDE(r.datum)} ${r.start}–${r.ende}).` });
        }
      }

      // Ruhezeit zur unmittelbar vorherigen Schicht
      if (i > 0) {
        const o = list[i - 1];
        const lueck = s - absEnde(o.datum, o.start, o.ende);
        if (lueck >= 0 && lueck < GRENZEN.ruhezeitStunden * 60) {
          add(r.id, { code: "ruhezeit", level: "warnung", text: `Ruhezeit ${(lueck / 60).toFixed(1).replace(".", ",")} h – unter ${GRENZEN.ruhezeitStunden} h seit dem vorherigen Einsatz.` });
        }
      }

      // Monatsgrenze: ab der Zeile, die die Grenze reißt
      const vertrag = person ? vertragAm(person.vertraege, r.datum) : null;
      if (vertrag) {
        const monat = r.datum.slice(0, 7);
        const summe = monatsSumme.get(monat) ?? { std: 0, eur: 0 };
        summe.std += gesamtzeit(r.start, r.ende, r.pausen);
        summe.eur += verdienstZeile(r, vertrag.stundenlohn);
        monatsSumme.set(monat, summe);
        if (vertrag.monatsgrenzeStd !== null && summe.std > vertrag.monatsgrenzeStd) {
          add(r.id, { code: "monatsgrenze", level: "warnung", text: `Monatsgrenze überschritten: ${summe.std.toFixed(1).replace(".", ",")} von ${vertrag.monatsgrenzeStd} h (${vertrag.vertragsart}).` });
        } else if (vertrag.monatsgrenzeEur !== null && summe.eur > vertrag.monatsgrenzeEur) {
          add(r.id, { code: "monatsgrenze", level: "warnung", text: `Monatsgrenze überschritten: ${summe.eur.toFixed(2).replace(".", ",")} € von ${vertrag.monatsgrenzeEur} € (${vertrag.vertragsart}).` });
        }
      }
    }
  }

  // Doppelte Meldungen (Überschneidung wird von beiden Seiten gesetzt) entfernen
  for (const [id, list] of out) {
    const seen = new Set<string>();
    out.set(
      id,
      list.filter((w) => {
        const key = `${w.code}|${w.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    );
  }
  return out;
}

export function zaehleWarnungen(map: Map<string, Warnung[]>): { fehler: number; warnungen: number; zeilenMitFehler: number } {
  let fehler = 0;
  let warnungen = 0;
  let zeilenMitFehler = 0;
  for (const list of map.values()) {
    const f = list.filter((w) => w.level === "fehler").length;
    fehler += f;
    warnungen += list.length - f;
    if (f > 0) zeilenMitFehler++;
  }
  return { fehler, warnungen, zeilenMitFehler };
}
