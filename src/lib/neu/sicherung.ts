// Monats-Sicherung als ZIP, mit Auswahl der Bereiche. Dieses Modul LIEST aus dem bisherigen System
// (Dokumente, Belege, Personalstamm) und aus dem neuen System – es schreibt nichts, auch nicht im
// neuen System (ausgenommen der Eintrag im Änderungsprotokoll, den die Route anlegt).
// Sichtbarkeit: Belege nur so, wie der angemeldete Administrator sie auch im Belegbereich sieht
// (keine Belege anderer Administratoren, Mitarbeiter-Belege erst nach Freigabe).
import JSZip from "jszip";
import { db } from "@/lib/db";
import { ONLY_APPROVED_EMPLOYEE, receiptVisibility } from "@/lib/receipts";
import { startOfBerlinDay, addDaysToKey, berlinDateKey } from "@/lib/einsatz/tz";
import { ladeAlles } from "./store";
import { dateiHash } from "./token";
import { csv } from "@/preview/logic/kleidung";
import { BEREICHE, sicherungsAnfrage, type BereichId, type SicherungsAnfrage } from "./sicherung-bereiche";

export { BEREICHE, sicherungsAnfrage };
export type { BereichId, SicherungsAnfrage };

// Obergrenze der Dateien in einer ZIP (alles liegt beim Erzeugen im Arbeitsspeicher)
export const MAX_SICHERUNG_BYTES = 150 * 1024 * 1024;

// ─── Hilfen (rein) ──────────────────────────────────────────────────────────

const OHNE_ORDNER: Record<string, string> = { konkretisierung: "Konkretisierungen", stundennachweis: "Stundennachweise", export: "Exporte" };

export function monatsGrenzen(monat: string): { datumVon: Date; datumBis: Date; zeitVon: Date; zeitBis: Date } {
  const [y, m] = monat.split("-").map(Number);
  const von = `${y}-${String(m).padStart(2, "0")}-01`;
  const bis = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  return { datumVon: new Date(`${von}T00:00:00Z`), datumBis: new Date(`${bis}T00:00:00Z`), zeitVon: startOfBerlinDay(von), zeitBis: startOfBerlinDay(bis) };
}

// Dateiname, der in jedem ZIP-Programm und auf jedem Rechner funktioniert (kein Pfad, keine Sonderzeichen)
export function sicherDateiname(name: string, ersatz = "Datei"): string {
  const t = name
    .replace(/[\\/]/g, "-")
    .replace(/[\u0000-\u001f<>:"|?*]/g, "")
    .replace(/^\.+/, "")
    .trim();
  return (t || ersatz).slice(0, 150);
}

// Gleiche Pfade bekommen einen Zähler, damit nichts überschrieben wird
export function eindeutigerPfad(belegt: Set<string>, pfad: string): string {
  if (!belegt.has(pfad.toLowerCase())) {
    belegt.add(pfad.toLowerCase());
    return pfad;
  }
  const punkt = pfad.lastIndexOf(".");
  const stamm = punkt > pfad.lastIndexOf("/") ? pfad.slice(0, punkt) : pfad;
  const endung = punkt > pfad.lastIndexOf("/") ? pfad.slice(punkt) : "";
  for (let i = 2; i < 10_000; i++) {
    const kandidat = `${stamm} (${i})${endung}`;
    if (!belegt.has(kandidat.toLowerCase())) {
      belegt.add(kandidat.toLowerCase());
      return kandidat;
    }
  }
  return pfad;
}

export function monatsName(monat: string): string {
  const N = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const [y, m] = monat.split("-").map(Number);
  return `${N[m - 1]} ${y}`;
}

// Der letzte volle Monat (Berlin) als "JJJJ-MM"
export function letzterVollerMonat(jetzt: Date = new Date()): string {
  const heute = berlinDateKey(jetzt);
  return addDaysToKey(`${heute.slice(0, 7)}-01`, -1).slice(0, 7);
}

// ─── Plan ───────────────────────────────────────────────────────────────────

type DateiPosten =
  | { quelle: "dokument"; bereich: BereichId; id: string; pfad: string; groesse: number; sha256: string | null; name: string; datum: string }
  | { quelle: "belegdatei"; bereich: BereichId; id: string; pfad: string; groesse: number; sha256: null; name: string; datum: string }
  | { quelle: "v2datei"; bereich: BereichId; id: string; pfad: string; groesse: number; sha256: string; name: string; datum: string };

export interface SicherungsPlan {
  posten: DateiPosten[];
  zaehler: Partial<Record<BereichId, { dateien: number; bytes: number }>>;
  tabellen: Array<{ pfad: string; bereich: BereichId; inhalt: string }>;
  bytes: number;
  zuGross: boolean;
  belegCsv: string | null;
}

export interface Abrufer {
  id: string;
  role: string;
  organizationId: string;
  name: string;
}

const ART_BELEG: Record<string, "AUSLAGE" | "FIRMENZAHLUNG" | "PRIVAT"> = { auslagen: "AUSLAGE", firmenbelege: "FIRMENZAHLUNG", privatbelege: "PRIVAT" };
const ORDNER_BELEG: Record<string, string> = { auslagen: "Auslagen", firmenbelege: "Firmenbelege", privatbelege: "Private-Belege" };

function datumDe(d: Date | string | null): string {
  if (!d) return "";
  const s = typeof d === "string" ? d : d.toISOString();
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}

// Stellt zusammen, was in die ZIP kommt – ohne die Dateiinhalte zu laden (nur Größen).
export async function planeSicherung(a: Abrufer, anfrage: SicherungsAnfrage): Promise<SicherungsPlan> {
  const org = a.organizationId;
  const g = monatsGrenzen(anfrage.monat);
  const imDatum = { gte: g.datumVon, lt: g.datumBis };
  const imZeitraum = { gte: g.zeitVon, lt: g.zeitBis };
  const belegt = new Set<string>();
  const posten: DateiPosten[] = [];
  const tabellen: SicherungsPlan["tabellen"] = [];
  const zaehler: SicherungsPlan["zaehler"] = {};
  const zaehle = (b: BereichId, bytes: number) => {
    const z = (zaehler[b] ??= { dateien: 0, bytes: 0 });
    z.dateien++;
    z.bytes += bytes;
  };
  const sel = new Set(anfrage.bereiche);

  // Dokumente des Einsatzmoduls: Einsatzdatum im Monat (über den Link oder den Einsatz), sonst Erstellungsdatum
  const kategorien = (["konkretisierung", "stundennachweis", "export"] as const).filter((k) => sel.has(k));
  if (kategorien.length > 0) {
    const docs = await db.document.findMany({
      where: {
        organizationId: org,
        category: { in: [...kategorien] },
        OR: [
          { links: { some: { OR: [{ datum: imDatum }, { datum: null, assignment: { datumVon: imDatum } }] } } },
          { links: { none: {} }, createdAt: imZeitraum },
        ],
      },
      orderBy: [{ category: "asc" }, { createdAt: "asc" }],
      select: { id: true, category: true, filename: true, size: true, sha256: true, createdAt: true },
    });
    for (const d of docs) {
      const ordner = OHNE_ORDNER[d.category] ?? "Sonstiges";
      const pfad = eindeutigerPfad(belegt, `${ordner}/${sicherDateiname(d.filename, `${d.category}.pdf`)}`);
      posten.push({ quelle: "dokument", bereich: d.category as BereichId, id: d.id, pfad, groesse: d.size, sha256: d.sha256, name: d.filename, datum: datumDe(d.createdAt) });
      zaehle(d.category as BereichId, d.size);
    }
  }

  // Belege und Auslagen, so wie dieser Administrator sie im Belegbereich sehen darf
  const arten = (["auslagen", "firmenbelege", "privatbelege"] as const).filter((k) => sel.has(k));
  let belegCsv: string | null = null;
  if (arten.length > 0) {
    const receipts = await db.receipt.findMany({
      where: {
        organizationId: org,
        status: "ABGELEGT",
        kind: { in: arten.map((k) => ART_BELEG[k]) },
        receiptDate: imZeitraum,
        AND: [receiptVisibility({ id: a.id, role: a.role as "ADMIN" }), ONLY_APPROVED_EMPLOYEE],
      },
      orderBy: [{ receiptDate: "asc" }, { receiptNumber: "asc" }],
      select: {
        id: true, receiptNumber: true, receiptDate: true, vendor: true, grossAmount: true, kind: true, reimbursementStatus: true, purpose: true, viaEmployeeLink: true, submittedByName: true,
        company: { select: { brandName: true } }, category: { select: { name: true } }, user: { select: { name: true } },
        files: { where: { kind: { in: anfrage.originale ? ["PDF", "ORIGINAL"] : ["PDF"] } }, select: { id: true, kind: true, filename: true, size: true } },
      },
    });
    const zeilen: string[][] = [["Belegnummer", "Datum", "Händler", "Brutto (€)", "Art", "Kategorie", "Firma", "Eingereicht von", "Erstattung", "Zweck"]];
    for (const r of receipts) {
      const bereich = (Object.keys(ART_BELEG) as BereichId[]).find((k) => ART_BELEG[k] === r.kind) as BereichId;
      const firma = sicherDateiname(r.company?.brandName ?? "ohne-Firma", "ohne-Firma");
      for (const f of r.files) {
        const sub = f.kind === "ORIGINAL" ? "/originale" : "";
        const pfad = eindeutigerPfad(belegt, `${ORDNER_BELEG[bereich]}/${firma}${sub}/${sicherDateiname(f.filename, `${r.receiptNumber ?? r.id}.pdf`)}`);
        posten.push({ quelle: "belegdatei", bereich, id: f.id, pfad, groesse: f.size, sha256: null, name: f.filename, datum: datumDe(r.receiptDate) });
        zaehle(bereich, f.size);
      }
      zeilen.push([r.receiptNumber ?? "", datumDe(r.receiptDate), r.vendor, Number(r.grossAmount).toFixed(2).replace(".", ","), r.kind === "AUSLAGE" ? "Auslage" : r.kind === "FIRMENZAHLUNG" ? "Firmenbeleg" : "Privat", r.category?.name ?? "", r.company?.brandName ?? "", r.submittedByName || r.user.name, r.reimbursementStatus === "ERSTATTET" ? "erstattet" : r.reimbursementStatus === "EINGEREICHT" ? "eingereicht" : "offen", r.purpose ?? ""]);
    }
    belegCsv = csv(zeilen);
    tabellen.push({ pfad: `Belege-Übersicht_${anfrage.monat}.csv`, bereich: arten[0], inhalt: belegCsv });
  }

  // Personalstamm (Stand heute): bewusst ohne Geburtsdatum, Bank- und Steuerdaten
  if (sel.has("personalstamm")) {
    const mitarbeiter = await db.employee.findMany({ where: { organizationId: org }, orderBy: [{ nachname: "asc" }, { vorname: "asc" }], select: { personalnummer: true, vorname: true, nachname: true, email: true, mobil: true, status: true } });
    tabellen.push({ pfad: `Personalstamm_Stand_${berlinDateKey(new Date())}.csv`, bereich: "personalstamm", inhalt: csv([["Personalnummer", "Vorname", "Nachname", "E-Mail", "Handy", "Status"], ...mitarbeiter.map((m) => [m.personalnummer ?? "", m.vorname, m.nachname, m.email ?? "", m.mobil ?? "", m.status])]) });
    zaehle("personalstamm", mitarbeiter.length);
  }

  // Neues System
  if (sel.has("neu-belege") || sel.has("neu-stunden") || sel.has("neu-unterweisungen") || sel.has("neu-gesamt")) {
    const alles = await ladeAlles(org, "admin");
    const crew = new Map(alles.records.crew.map((c) => [(c.data as { pnr: string }).pnr, c.data as { vorname: string; nachname: string }]));
    const imMonat = (datum: string) => datum.slice(0, 7) === anfrage.monat;
    if (sel.has("neu-belege")) {
      const belege = alles.records.beleg.map((b) => b.data as { id: string; datum: string; zeit: string; pnr: string; art: string; betrag: number | null; haendler: string; zweck: string; auftragId: string; dateiname: string; dateiId?: string }).filter((b) => imMonat(b.datum || b.zeit));
      const ids = belege.map((b) => b.dateiId).filter((x): x is string => Boolean(x));
      const dateien = ids.length > 0 ? await db.v2File.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true, size: true, sha256: true } }) : [];
      const nachId = new Map(dateien.map((d) => [d.id, d]));
      for (const b of belege) {
        const f = b.dateiId ? nachId.get(b.dateiId) : undefined;
        if (!f) continue;
        const pfad = eindeutigerPfad(belegt, `Neues-System/Belege/${sicherDateiname(`${b.datum || "ohne-Datum"}_${b.pnr}_${f.name}`, "Beleg")}`);
        posten.push({ quelle: "v2datei", bereich: "neu-belege", id: f.id, pfad, groesse: f.size, sha256: f.sha256, name: f.name, datum: datumDe(b.datum) });
        zaehle("neu-belege", f.size);
      }
      tabellen.push({ pfad: `Neues-System/Belege-Übersicht_${anfrage.monat}.csv`, bereich: "neu-belege", inhalt: csv([["Datum", "Personalnummer", "Name", "Art", "Betrag (€)", "Händler", "Zweck", "Auftrag", "Datei"], ...belege.map((b) => [datumDe(b.datum), b.pnr, `${crew.get(b.pnr)?.vorname ?? ""} ${crew.get(b.pnr)?.nachname ?? ""}`.trim(), b.art, b.betrag === null ? "" : b.betrag.toFixed(2).replace(".", ","), b.haendler, b.zweck, b.auftragId, b.dateiname])]) });
    }
    if (sel.has("neu-stunden")) {
      const zeilen = alles.records.stunde.map((s) => s.data as { datum: string; pnr: string; start: string; ende: string; pausen: Array<{ von: string; bis: string }>; pauschale: number; kunde: string; auftrag: string; spesen: number; reiseKm: number; reiseGesch: number; bonus: number; abzug: number; bemerkung: string; status: string; quelle: string }).filter((s) => imMonat(s.datum));
      const num = (n: number) => String(n).replace(".", ",");
      tabellen.push({ pfad: `Neues-System/Stunden_${anfrage.monat}.csv`, bereich: "neu-stunden", inhalt: csv([["Datum", "Personalnummer", "Name", "Beginn", "Ende", "Pausen", "Garantiestunden", "Kunde", "Auftrag", "Spesen (€)", "Reise privat (km)", "Reise geschäftlich (€)", "Bonus (€)", "Abzug (€)", "Bemerkung", "Status", "Quelle"], ...zeilen.map((s) => [datumDe(s.datum), s.pnr, `${crew.get(s.pnr)?.vorname ?? ""} ${crew.get(s.pnr)?.nachname ?? ""}`.trim(), s.start, s.ende, s.pausen.map((p) => `${p.von}-${p.bis}`).join(" "), num(s.pauschale), s.kunde, s.auftrag, num(s.spesen), num(s.reiseKm), num(s.reiseGesch), num(s.bonus), num(s.abzug), s.bemerkung, s.status, s.quelle])]) });
      zaehler["neu-stunden"] = { dateien: zeilen.length, bytes: 0 };
    }
    if (sel.has("neu-unterweisungen")) {
      type Ack = { version?: number; bestaetigtAm: string; quizScore: number; video?: string; unterschriftAm?: string; nachweisId?: string };
      const acks = alles.records.crew.flatMap((c) => {
        const d = c.data as { pnr: string; vorname: string; nachname: string; unterweisungen?: Record<string, Ack> };
        return Object.entries(d.unterweisungen ?? {}).filter(([, a]) => a.bestaetigtAm.slice(0, 7) === anfrage.monat).map(([modul, a]) => ({ pnr: d.pnr, name: `${d.vorname} ${d.nachname}`.trim(), modul, ack: a }));
      });
      acks.sort((x, y) => x.ack.bestaetigtAm.localeCompare(y.ack.bestaetigtAm) || x.name.localeCompare(y.name, "de"));
      const ids = acks.map((x) => x.ack.nachweisId).filter((x): x is string => Boolean(x));
      const dateien = ids.length > 0 ? await db.v2File.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, name: true, size: true, sha256: true } }) : [];
      const nachId = new Map(dateien.map((d) => [d.id, d]));
      let anzahl = 0;
      for (const x of acks) {
        const f = x.ack.nachweisId ? nachId.get(x.ack.nachweisId) : undefined;
        if (!f) continue;
        const pfad = eindeutigerPfad(belegt, `Neues-System/Unterweisungsnachweise/${sicherDateiname(f.name, "Unterweisung.pdf")}`);
        posten.push({ quelle: "v2datei", bereich: "neu-unterweisungen", id: f.id, pfad, groesse: f.size, sha256: f.sha256, name: f.name, datum: datumDe(x.ack.bestaetigtAm) });
        zaehle("neu-unterweisungen", f.size);
        anzahl++;
      }
      tabellen.push({ pfad: `Neues-System/Unterweisungen_${anfrage.monat}.csv`, bereich: "neu-unterweisungen", inhalt: csv([["Datum", "Personalnummer", "Name", "Modul", "Quiz (%)", "Video", "Unterschrift", "Nachweis-PDF"], ...acks.map((x) => [datumDe(x.ack.bestaetigtAm), x.pnr, x.name, x.modul, String(Math.round(x.ack.quizScore * 100)), x.ack.video === "player" ? "abgespielt" : x.ack.video === "manuell" ? "bestätigt" : "–", x.ack.unterschriftAm ? "ja" : "nein (älterer Stand)", x.ack.nachweisId && nachId.has(x.ack.nachweisId) ? nachId.get(x.ack.nachweisId)?.name ?? "" : ""])]) });
      if (anzahl === 0) zaehler["neu-unterweisungen"] = { dateien: 0, bytes: 0 };
    }
    if (sel.has("neu-gesamt")) {
      const inhalt = JSON.stringify({ erstelltAm: new Date().toISOString(), hinweis: "Gesamtstand des neuen Systems. Enthält Personen- und Vertragsdaten – sicher aufbewahren.", ...alles, records: { ...alles.records, benutzer: [] } }, null, 2);
      tabellen.push({ pfad: "Neues-System/Gesamtstand.json", bereich: "neu-gesamt", inhalt });
      zaehler["neu-gesamt"] = { dateien: 1, bytes: Buffer.byteLength(inhalt) };
    }
  }

  const bytes = posten.reduce((n, p) => n + p.groesse, 0) + tabellen.reduce((n, t) => n + Buffer.byteLength(t.inhalt), 0);
  return { posten, zaehler, tabellen, bytes, zuGross: bytes > MAX_SICHERUNG_BYTES, belegCsv };
}

// ─── ZIP ────────────────────────────────────────────────────────────────────

async function ladeInStuecken<T>(ids: string[], laden: (teil: string[]) => Promise<T[]>, schritt = 15): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += schritt) out.push(...(await laden(ids.slice(i, i + schritt))));
  return out;
}

export async function baueSicherung(a: Abrufer, anfrage: SicherungsAnfrage): Promise<{ filename: string; bytes: Buffer; plan: SicherungsPlan } | { fehler: string }> {
  const plan = await planeSicherung(a, anfrage);
  if (plan.zuGross) return { fehler: `Die Sicherung wäre mit ${(plan.bytes / 1024 / 1024).toFixed(0)} MB zu groß für einen Download (Grenze ${MAX_SICHERUNG_BYTES / 1024 / 1024} MB). Bitte weniger Bereiche auf einmal wählen, zum Beispiel Belege und Stundenzettel getrennt.` };
  const org = a.organizationId;
  const zip = new JSZip();
  const manifest: string[][] = [["Pfad in der ZIP", "Bereich", "Ursprünglicher Dateiname", "Größe (Bytes)", "SHA-256", "Datum"]];

  const dok = plan.posten.filter((p) => p.quelle === "dokument");
  const doks = await ladeInStuecken(dok.map((p) => p.id), (ids) => db.document.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, bytes: true } }));
  const dokBytes = new Map(doks.map((d) => [d.id, d.bytes]));
  const bel = plan.posten.filter((p) => p.quelle === "belegdatei");
  const bels = await ladeInStuecken(bel.map((p) => p.id), (ids) => db.receiptFile.findMany({ where: { id: { in: ids }, receipt: { organizationId: org } }, select: { id: true, bytes: true } }));
  const belBytes = new Map(bels.map((d) => [d.id, d.bytes]));
  const neu = plan.posten.filter((p) => p.quelle === "v2datei");
  const neus = await ladeInStuecken(neu.map((p) => p.id), (ids) => db.v2File.findMany({ where: { organizationId: org, id: { in: ids } }, select: { id: true, data: true } }));
  const neuBytes = new Map(neus.map((d) => [d.id, d.data]));

  let fehlend = 0;
  for (const p of plan.posten) {
    const roh = p.quelle === "dokument" ? dokBytes.get(p.id) : p.quelle === "belegdatei" ? belBytes.get(p.id) : neuBytes.get(p.id);
    if (!roh) {
      fehlend++;
      continue;
    }
    const buf = Buffer.from(roh);
    zip.file(p.pfad, buf);
    manifest.push([p.pfad, p.bereich, p.name, String(buf.length), p.sha256 ?? dateiHash(buf), p.datum]);
  }
  for (const t of plan.tabellen) zip.file(t.pfad, t.inhalt);

  const bereiche = BEREICHE.filter((b) => anfrage.bereiche.includes(b.id));
  zip.file("Inhalt.csv", csv(manifest));
  zip.file(
    "LIESMICH.txt",
    [
      `Sicherung ${monatsName(anfrage.monat)}`,
      `Erstellt am ${berlinDateKey(new Date()).split("-").reverse().join(".")} von ${a.name}`,
      "",
      "Enthaltene Bereiche:",
      ...bereiche.map((b) => `  - ${b.label}: ${plan.zaehler[b.id]?.dateien ?? 0} ${b.id === "neu-stunden" || b.id === "personalstamm" ? "Zeilen" : b.id === "neu-gesamt" ? "Datei" : "Dateien"}`),
      anfrage.originale ? "  - Original-Fotos der Belege sind dabei." : "",
      "",
      "Inhalt.csv listet jede Datei mit Größe und SHA-256-Fingerabdruck. Damit lässt sich später prüfen, dass nichts verändert wurde.",
      "",
      "Wichtig:",
      "  - Das ist eine Sammlung der Dokumente des Monats, KEINE vollständige Datenbanksicherung. Für eine komplette Wiederherstellung",
      "    gibt es die Datenbank-Sicherung (pg_dump / Railway-Backups), siehe docs/preview-umgebung.md.",
      "  - Die ZIP kann Personendaten, Verträge und Belege enthalten. Bitte verschlüsselt oder an einem geschützten Ort ablegen",
      "    und nicht per einfacher E-Mail verschicken.",
      fehlend > 0 ? `  - ACHTUNG: ${fehlend} Datei(en) konnten nicht gelesen werden und fehlen in dieser ZIP.` : "",
    ].filter((z, i, arr) => z !== "" || (i > 0 && arr[i - 1] !== "")).join("\n")
  );
  const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 3 } });
  return { filename: `Sicherung_${anfrage.monat}.zip`, bytes, plan };
}

