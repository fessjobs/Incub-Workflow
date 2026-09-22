// Besetzung eines Einsatzes in der Dispo ändern: Namen aus einer eingefügten
// Liste ergänzen, Personen austauschen, Namen richtigstellen.
//
// Der Kern (Namen lesen, Person finden oder anlegen) wird auch vom
// Gruppenlink benutzt (crew-roster.ts) – dort mit engeren Grenzen, weil dort
// niemand angemeldet ist.
import { db } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { normalizeName, personFromLine } from "../parser";
import { matchNames, type MatchCandidate } from "../matching";
import { berlinDateKey, berlinTime, keyToDateOnly } from "../tz";
import { TOKEN_DAYS } from "./assignments";

export class BesetzungError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = "BesetzungError";
  }
}

export type Rolle = "MITARBEITER" | "ANSPRECHPARTNER" | "SPARE";

// ─── Namen aus eingefügtem Text ─────────────────────────────────────────────

// „Gülhan, Samira" und „Samira Gülhan" sind dieselbe Person
export function nameKey(vorname: string, nachname: string): string {
  return normalizeName(`${vorname} ${nachname}`).split(" ").sort().join(" ");
}

export function teileEingabe(vorname: string, nachname: string): { vorname: string; nachname: string } {
  return { vorname: vorname.trim().replace(/\s{2,}/g, " "), nachname: nachname.trim().replace(/\s{2,}/g, " ") };
}

// Namenszusätze werden kleingeschrieben – „von der Heide" ist ein Nachname,
// „Max Mustermann" nicht.
const ZUSATZ = /^(von|vom|van|de|del|der|den|di|du|da|dos|el|al|bin|ibn|zu|zur|ten|ter|of|le|la)$/i;

function istNachnameAllein(teil: string): boolean {
  const worte = teil.split(/\s+/).filter(Boolean);
  if (worte.length === 0) return false;
  // Ein Wort, oder nur Namenszusätze vor dem letzten Wort
  return worte.slice(0, -1).every((w) => ZUSATZ.test(w));
}

// „Mustermann, Max" → „Max Mustermann". Ein Komma trennt nur dann Nachname und
// Vorname, wenn genau zwei Teile dastehen, der zweite ein einzelnes Wort ist
// und der erste als Nachname durchgeht – sonst ist es eine Aufzählung.
function drehUm(teil: string): string[] {
  const stuecke = teil.split(",").map((t) => t.trim()).filter(Boolean);
  if (stuecke.length === 2 && stuecke[1].split(/\s+/).length === 1 && istNachnameAllein(stuecke[0])) {
    return [`${stuecke[1]} ${stuecke[0]}`];
  }
  return stuecke;
}

export type EingefuegterName = { name: string; rolle: Rolle };

// Liest eine eingefügte Liste: eine Person je Zeile, Semikolon trennt
// zusätzlich. Aufzählungszeichen, Nummerierung und Rollenkürzel (AP, Spare)
// werden erkannt; Schicht- und Datumszeilen aus einem mitkopierten Plan
// fliegen raus, Dubletten ebenfalls.
export function namenAusText(text: string): EingefuegterName[] {
  const raus: EingefuegterName[] = [];
  const gesehen = new Set<string>();
  for (const zeile of text.split(/\r?\n/)) {
    const roh = zeile.trim();
    if (!roh) continue;
    // Kopfzeilen eines mitkopierten Plans überspringen
    if (/^[-–—_=*]{2,}/.test(roh)) continue;
    if (/^\s*(kunde|projekt|artist|location|ort|einsatzort|datum|arbeitsbeginn|schicht)\b/i.test(roh)) continue;
    // Eine Zeile mit Datum oder Uhrzeit-Spanne beschreibt eine Schicht, keine Person
    if (/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/.test(roh)) continue;
    if (/\|/.test(roh) && /\d{1,2}[:.]\d{2}/.test(roh)) continue;
    for (const teil of roh.split(";").flatMap(drehUm)) {
      const person = personFromLine(teil);
      const name = person.name.replace(/\s{2,}/g, " ").trim();
      if (!name || name.length > 120) continue;
      // Reine Zahlen, Uhrzeiten, Datumsangaben sind keine Namen
      if (!/\p{L}/u.test(name)) continue;
      if (/^\d{1,2}[.:]\d{2}/.test(name)) continue;
      const key = normalizeName(name);
      if (!key || gesehen.has(key)) continue;
      gesehen.add(key);
      raus.push({ name, rolle: person.rolle.toUpperCase() as Rolle });
    }
  }
  return raus;
}

// ─── Person finden oder anlegen ─────────────────────────────────────────────

export async function findeOderLegeAn(
  organizationId: string,
  vorname: string,
  nachname: string,
  createdById: string | null = null
): Promise<{ id: string; neu: boolean }> {
  const exakt = await db.employee.findFirst({
    where: { organizationId, vorname: { equals: vorname, mode: "insensitive" }, nachname: { equals: nachname, mode: "insensitive" } },
    select: { id: true },
  });
  if (exakt) return { id: exakt.id, neu: false };

  const key = nameKey(vorname, nachname);
  const alle = await db.employee.findMany({ where: { organizationId, status: "AKTIV" }, select: { id: true, vorname: true, nachname: true } });
  const treffer = alle.find((e) => nameKey(e.vorname, e.nachname) === key);
  if (treffer) return { id: treffer.id, neu: false };

  const angelegt = await db.employee.create({ data: { organizationId, vorname, nachname, createdById } });
  await logAudit({ organizationId, userId: createdById ?? undefined, action: "employee.create", entityType: "employee", entityId: angelegt.id, data: { vorname, nachname, quelle: "besetzung" } });
  return { id: angelegt.id, neu: true };
}

// Ein Datensatz, der nur für diese eine Einteilung entstanden ist: keine
// Personalnummer, keine Kontaktdaten, keine zweite Einteilung. Ein Tippfehler
// darin wird korrigiert, statt eine Karteileiche zu hinterlassen.
export async function istProvisorisch(employeeId: string, ausserShiftAssignmentId: string): Promise<boolean> {
  const e = await db.employee.findUnique({
    where: { id: employeeId },
    select: { personalnummer: true, email: true, mobil: true, geburtsdatum: true },
  });
  if (!e) return false;
  if (e.personalnummer || e.email || e.mobil || e.geburtsdatum) return false;
  const eigene = await db.shiftAssignment.findFirst({ where: { employeeId, NOT: { id: ausserShiftAssignmentId } }, select: { id: true } });
  return eigene === null;
}

export type NamensAenderung = { shiftAssignmentId: string; alt: string; neu: string; weg: "umbenannt" | "zugeordnet" };

// Setzt den Namen einer Einteilung. Gibt es im Stamm schon jemanden mit dem
// neuen Namen, wird die Einteilung dorthin umgehängt; ist der bisherige
// Datensatz nur für diese Einteilung entstanden, wird er umbenannt.
export async function setzeNamen(
  organizationId: string,
  shiftAssignmentId: string,
  eingabe: { vorname: string; nachname: string },
  kontext: { userId: string | null; ip: string | null; quelle: string }
): Promise<NamensAenderung> {
  const { vorname, nachname } = teileEingabe(eingabe.vorname, eingabe.nachname);
  const sa = await db.shiftAssignment.findFirst({
    where: { id: shiftAssignmentId, organizationId },
    include: { employee: true },
  });
  if (!sa) throw new BesetzungError("Einteilung nicht gefunden.", 404);

  const alt = `${sa.employee.vorname} ${sa.employee.nachname}`;
  const neuerName = `${vorname} ${nachname}`;
  if (alt === neuerName) return { shiftAssignmentId, alt, neu: alt, weg: "umbenannt" };

  let weg: NamensAenderung["weg"];
  const vorhanden = await db.employee.findFirst({
    where: { organizationId, vorname: { equals: vorname, mode: "insensitive" }, nachname: { equals: nachname, mode: "insensitive" }, NOT: { id: sa.employeeId } },
    select: { id: true },
  });

  if (!vorhanden && (await istProvisorisch(sa.employeeId, sa.id))) {
    await db.employee.update({ where: { id: sa.employeeId }, data: { vorname, nachname } });
    weg = "umbenannt";
  } else {
    const ziel = vorhanden ?? (await findeOderLegeAn(organizationId, vorname, nachname, kontext.userId));
    if (ziel.id === sa.employeeId) return { shiftAssignmentId, alt, neu: neuerName, weg: "umbenannt" };
    const doppelt = await db.shiftAssignment.findFirst({ where: { shiftId: sa.shiftId, employeeId: ziel.id }, select: { id: true } });
    if (doppelt) throw new BesetzungError(`${neuerName} steht schon auf dieser Schicht.`, 409);
    await db.shiftAssignment.update({ where: { id: sa.id }, data: { employeeId: ziel.id } });
    weg = "zugeordnet";
  }

  await logAudit({
    organizationId,
    userId: kontext.userId ?? undefined,
    action: "shift_assignment.name_geaendert",
    entityType: "shift_assignment",
    entityId: sa.id,
    data: { alt, neu: neuerName, weg, ip: kontext.ip, quelle: kontext.quelle },
  });
  return { shiftAssignmentId, alt, neu: neuerName, weg };
}

// ─── Personen ergänzen ──────────────────────────────────────────────────────

export type VorschauZeile = {
  name: string;
  rolle: Rolle;
  // sicherer Treffer im Stamm (sonst null → neu anlegen oder Kandidat wählen)
  employeeId: string | null;
  sicher: boolean;
  kandidaten: MatchCandidate[];
  // steht schon auf dieser Schicht
  schonDabei: boolean;
};

export async function vorschauNamen(organizationId: string, shiftId: string, text: string): Promise<VorschauZeile[]> {
  const eingefuegt = namenAusText(text);
  if (eingefuegt.length === 0) return [];
  const schicht = await db.shift.findFirst({
    where: { id: shiftId, organizationId },
    select: { assignments: { where: { status: { not: "STORNIERT" } }, select: { employeeId: true, employee: { select: { vorname: true, nachname: true } } } } },
  });
  if (!schicht) throw new BesetzungError("Schicht nicht gefunden.", 404);
  const dabei = new Set(schicht.assignments.map((sa) => nameKey(sa.employee.vorname, sa.employee.nachname)));
  const dabeiIds = new Set(schicht.assignments.map((sa) => sa.employeeId));

  const treffer = await matchNames(organizationId, eingefuegt.map((n) => n.name));
  const nachName = new Map(treffer.map((m) => [m.input, m]));

  return eingefuegt.map((n) => {
    const m = nachName.get(n.name);
    const employeeId = m?.sicher ? m.best?.employeeId ?? null : null;
    const teile = n.name.trim().split(/\s+/);
    const key = nameKey(teile.slice(0, -1).join(" "), teile.at(-1) ?? "");
    return {
      name: n.name,
      rolle: n.rolle,
      employeeId,
      sicher: Boolean(m?.sicher),
      kandidaten: m?.candidates ?? [],
      schonDabei: dabei.has(key) || (employeeId !== null && dabeiIds.has(employeeId)),
    };
  });
}

export type ErgaenzenEingabe = { name: string; rolle: Rolle; employeeId: string | null; neuAnlegen: boolean };
export type ErgaenzenErgebnis = { ergaenzt: number; neuAngelegt: number; uebersprungen: Array<{ name: string; grund: string }> };

export async function ergaenzePersonen(
  actor: { id: string; organizationId: string },
  shiftId: string,
  personen: ErgaenzenEingabe[]
): Promise<ErgaenzenErgebnis> {
  const shift = await db.shift.findFirst({
    where: { id: shiftId, organizationId: actor.organizationId },
    select: { id: true, assignmentId: true, bezeichnung: true, planStart: true, planEnde: true },
  });
  if (!shift) throw new BesetzungError("Schicht nicht gefunden.", 404);

  const ergebnis: ErgaenzenErgebnis = { ergaenzt: 0, neuAngelegt: 0, uebersprungen: [] };
  for (const p of personen) {
    const teile = p.name.trim().split(/\s+/);
    const vorname = teile.slice(0, -1).join(" ");
    const nachname = teile.at(-1) ?? "";
    let employeeId = p.employeeId;
    if (!employeeId) {
      if (!p.neuAnlegen) {
        ergebnis.uebersprungen.push({ name: p.name, grund: "nicht zugeordnet" });
        continue;
      }
      // Die Konkretisierung nach AÜG benennt die Person namentlich
      if (!vorname || !nachname) {
        ergebnis.uebersprungen.push({ name: p.name, grund: "Vor- und Nachname nötig" });
        continue;
      }
      const ziel = await findeOderLegeAn(actor.organizationId, vorname, nachname, actor.id);
      employeeId = ziel.id;
      if (ziel.neu) ergebnis.neuAngelegt++;
    }

    const vorhanden = await db.shiftAssignment.findFirst({ where: { shiftId: shift.id, employeeId }, select: { id: true, status: true } });
    if (vorhanden) {
      if (vorhanden.status !== "STORNIERT") {
        ergebnis.uebersprungen.push({ name: p.name, grund: "steht schon auf dieser Schicht" });
        continue;
      }
      await db.shiftAssignment.update({
        where: { id: vorhanden.id },
        data: { status: "GEPLANT", rolle: p.rolle, tokenExpiresAt: new Date(shift.planEnde.getTime() + TOKEN_DAYS * 86400000) },
      });
      ergebnis.ergaenzt++;
      continue;
    }

    await db.shiftAssignment.create({
      data: {
        organizationId: actor.organizationId,
        shiftId: shift.id,
        employeeId,
        rolle: p.rolle,
        planStart: shift.planStart,
        planEnde: shift.planEnde,
        tokenExpiresAt: new Date(shift.planEnde.getTime() + TOKEN_DAYS * 86400000),
        createdById: actor.id,
      },
    });
    ergebnis.ergaenzt++;
  }

  await logAudit({
    organizationId: actor.organizationId,
    userId: actor.id,
    action: "shift.personen_ergaenzt",
    entityType: "shift",
    entityId: shift.id,
    data: { assignmentId: shift.assignmentId, schicht: shift.bezeichnung, ...ergebnis },
  });
  return ergebnis;
}

// ─── Kopfdaten und Schichten ändern ─────────────────────────────────────────

// Wie weit ein Einsatz noch offen ist. Der Kunde ist die Grenze: hat er
// bestätigt, steht die Besetzung auf einem unterschriebenen Beleg. Namen
// bleiben trotzdem änderbar – Leute heiraten, und auf dem Nachweis muss der
// richtige Name stehen.
export type Bearbeitbarkeit = {
  kopf: boolean;
  schichten: boolean;
  besetzung: boolean;
  // Namen sind immer änderbar, die Begründung steht hier
  namen: true;
  grund: string | null;
};

export function bearbeitbarkeit(a: {
  status: string;
  confirmations: Array<unknown>;
  shifts: Array<{ assignments: Array<{ timeEntries: Array<{ review: string; unterschriftZeitpunkt: Date | null }> }> }>;
}): Bearbeitbarkeit {
  const freigegeben = a.shifts.some((s) => s.assignments.some((sa) => sa.timeEntries.some((t) => t.review === "FREIGEGEBEN")));
  if (freigegeben) {
    return { kopf: false, schichten: false, besetzung: false, namen: true, grund: "Zeiten sind freigegeben – für Änderungen die Freigabe zurücknehmen." };
  }
  if (a.confirmations.length > 0) {
    return { kopf: false, schichten: false, besetzung: false, namen: true, grund: "Der Kunde hat bestätigt. Namen lassen sich noch richtigstellen, danach die Dokumente neu erzeugen." };
  }
  if (a.status === "ABGESCHLOSSEN" || a.status === "ABGERECHNET") {
    return { kopf: false, schichten: false, besetzung: false, namen: true, grund: "Der Einsatz ist abgeschlossen." };
  }
  const unterschrieben = a.shifts.some((s) => s.assignments.some((sa) => sa.timeEntries.some((t) => t.unterschriftZeitpunkt)));
  if (unterschrieben) {
    // Zeiten stehen schon auf Unterschriften – Kopfdaten und Besetzung ja,
    // Schichtzeiten nein (die würden den unterschriebenen Beleg verschieben).
    return { kopf: true, schichten: false, besetzung: true, namen: true, grund: "Erste Unterschriften liegen vor – Schichtzeiten bitte über die Zeitkorrektur je Person ändern." };
  }
  return { kopf: true, schichten: true, besetzung: true, namen: true, grund: null };
}

export type KopfEingabe = {
  projekt: string;
  artist: string | null;
  customerId: string;
  einsatzort: string;
  einsatzbereich: string | null;
  aueVertragRef: string | null;
  bundesland: string | null;
  notizen: string | null;
};

export async function aktualisiereKopf(actor: { id: string; organizationId: string }, assignmentId: string, input: KopfEingabe): Promise<void> {
  const a = await db.assignment.findFirst({
    where: { id: assignmentId, organizationId: actor.organizationId },
    include: { confirmations: true, shifts: { include: { assignments: { include: { timeEntries: { where: { aktuell: true }, select: { review: true, unterschriftZeitpunkt: true } } } } } } },
  });
  if (!a) throw new BesetzungError("Einsatz nicht gefunden.", 404);
  if (!bearbeitbarkeit(a).kopf) throw new BesetzungError(bearbeitbarkeit(a).grund ?? "Dieser Einsatz lässt sich nicht mehr ändern.", 409);

  const kunde = await db.customer.findFirst({ where: { id: input.customerId, organizationId: actor.organizationId }, select: { id: true } });
  if (!kunde) throw new BesetzungError("Kunde nicht gefunden.", 404);

  const vorher = { projekt: a.projekt, artist: a.artist, customerId: a.customerId, einsatzort: a.einsatzort, einsatzbereich: a.einsatzbereich, aueVertragRef: a.aueVertragRef, bundesland: a.bundesland, notizen: a.notizen };
  await db.assignment.update({
    where: { id: a.id },
    data: {
      projekt: input.projekt,
      artist: input.artist,
      customerId: kunde.id,
      einsatzort: input.einsatzort,
      einsatzbereich: input.einsatzbereich,
      aueVertragRef: input.aueVertragRef,
      bundesland: input.bundesland,
      notizen: input.notizen,
    },
  });
  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "assignment.update", entityType: "assignment", entityId: a.id, data: { vorher, nachher: { ...input } } });
}

export type SchichtEingabe = {
  bezeichnung: string;
  taetigkeit: string;
  planStart: Date;
  planEnde: Date;
  datum: Date;
  treffpunkt: string | null;
  anzahlSoll: number | null;
  garantieStunden: number | null;
};

export async function aktualisiereSchicht(actor: { id: string; organizationId: string }, shiftId: string, input: SchichtEingabe): Promise<void> {
  const shift = await db.shift.findFirst({
    where: { id: shiftId, organizationId: actor.organizationId },
    include: { assignment: { include: { confirmations: true, shifts: { include: { assignments: { include: { timeEntries: { where: { aktuell: true }, select: { review: true, unterschriftZeitpunkt: true } } } } } } } } },
  });
  if (!shift) throw new BesetzungError("Schicht nicht gefunden.", 404);
  const stand = bearbeitbarkeit(shift.assignment);
  if (!stand.schichten) throw new BesetzungError(stand.grund ?? "Diese Schicht lässt sich nicht mehr ändern.", 409);
  if (input.planEnde <= input.planStart) throw new BesetzungError("Das Ende liegt vor dem Beginn.", 400);

  const vorher = { bezeichnung: shift.bezeichnung, planStart: shift.planStart, planEnde: shift.planEnde, treffpunkt: shift.treffpunkt, anzahlSoll: shift.anzahlSoll };
  await db.$transaction(async (tx) => {
    await tx.shift.update({
      where: { id: shift.id },
      data: {
        bezeichnung: input.bezeichnung,
        taetigkeit: input.taetigkeit,
        datum: input.datum,
        planStart: input.planStart,
        planEnde: input.planEnde,
        treffpunkt: input.treffpunkt,
        anzahlSoll: input.anzahlSoll,
        garantieStunden: input.garantieStunden,
      },
    });
    // Planzeiten der Einteilungen mitziehen (nur die ohne Unterschrift)
    await tx.shiftAssignment.updateMany({
      where: { shiftId: shift.id, timeEntries: { none: { unterschriftZeitpunkt: { not: null } } } },
      data: { planStart: input.planStart, planEnde: input.planEnde },
    });
  });

  // Der Einsatzzeitraum ergibt sich aus den Schichten – in Berliner Tagen,
  // nicht in UTC-Tagen (eine Schicht bis 01:30 gehört zum Vortag).
  const alle = await db.shift.findMany({ where: { assignmentId: shift.assignmentId }, select: { planStart: true, planEnde: true } });
  const tage = alle.flatMap((s) => [berlinDateKey(s.planStart), berlinDateKey(s.planEnde)]).sort();
  await db.assignment.update({
    where: { id: shift.assignmentId },
    data: { datumVon: keyToDateOnly(tage[0]), datumBis: keyToDateOnly(tage.at(-1)!) },
  });

  await logAudit({ organizationId: actor.organizationId, userId: actor.id, action: "shift.update", entityType: "shift", entityId: shift.id, data: { assignmentId: shift.assignmentId, vorher, nachher: { ...input } } });
}

// ─── Zeitvorgabe je Schicht ─────────────────────────────────────────────────

// Bei einem Einsatz arbeiten fast alle dieselbe Schicht. Wer als Erstes
// erfasst, kann seine Ist-Zeiten für alle auf derselben Schicht übernehmen:
// die Formulare der Übrigen sind dann vorausgefüllt. Unterschreiben muss
// weiterhin jede Person selbst – eine Zeit ohne eigene Unterschrift wäre
// als Nachweis wertlos.
export type Zeitvorgabe = { start: string; ende: string; startDatum: string; endeDatum: string; pauseMinuten: number; von: string; am: string } | null;

export function zeitvorgabeVon(shift: { vorgabeStart: Date | null; vorgabeEnde: Date | null; vorgabePause: number | null; vorgabeVon: string | null; vorgabeAm: Date | null }): Zeitvorgabe {
  if (!shift.vorgabeStart || !shift.vorgabeEnde || shift.vorgabePause === null) return null;
  return {
    startDatum: berlinDateKey(shift.vorgabeStart),
    start: berlinTime(shift.vorgabeStart),
    endeDatum: berlinDateKey(shift.vorgabeEnde),
    ende: berlinTime(shift.vorgabeEnde),
    pauseMinuten: shift.vorgabePause,
    von: shift.vorgabeVon ?? "",
    am: (shift.vorgabeAm ?? new Date()).toISOString(),
  };
}

// Übernimmt die Ist-Zeiten einer bereits unterschriebenen Erfassung als
// Vorgabe für die ganze Schicht.
export async function uebernimmZeitenFuerAlle(
  organizationId: string,
  shiftAssignmentId: string,
  kontext: { userId: string | null; ip: string | null; quelle: string }
): Promise<{ schichtId: string; offen: number }> {
  const sa = await db.shiftAssignment.findFirst({
    where: { id: shiftAssignmentId, organizationId },
    include: {
      employee: { select: { vorname: true, nachname: true } },
      shift: { select: { id: true, bezeichnung: true, assignmentId: true } },
      timeEntries: { where: { aktuell: true } },
    },
  });
  if (!sa) throw new BesetzungError("Erfassung nicht gefunden.", 404);
  const eintrag = sa.timeEntries[0];
  if (!eintrag || !eintrag.unterschriftZeitpunkt) {
    throw new BesetzungError("Erst eigene Zeiten eintragen und unterschreiben, dann lassen sie sich übernehmen.", 409);
  }

  const von = `${sa.employee.vorname} ${sa.employee.nachname}`;
  await db.shift.update({
    where: { id: sa.shift.id },
    data: { vorgabeStart: eintrag.istStart, vorgabeEnde: eintrag.istEnde, vorgabePause: eintrag.pauseMinuten, vorgabeVon: von, vorgabeAm: new Date() },
  });

  // Wie viele profitieren davon – nur wer noch nicht unterschrieben hat
  const offen = await db.shiftAssignment.count({
    where: { shiftId: sa.shift.id, status: { not: "STORNIERT" }, id: { not: sa.id }, timeEntries: { none: { unterschriftZeitpunkt: { not: null } } } },
  });

  await logAudit({
    organizationId,
    userId: kontext.userId ?? undefined,
    action: "shift.zeitvorgabe",
    entityType: "shift",
    entityId: sa.shift.id,
    data: {
      assignmentId: sa.shift.assignmentId,
      schicht: sa.shift.bezeichnung,
      von,
      start: eintrag.istStart.toISOString(),
      ende: eintrag.istEnde.toISOString(),
      pauseMinuten: eintrag.pauseMinuten,
      offen,
      ip: kontext.ip,
      quelle: kontext.quelle,
    },
  });
  return { schichtId: sa.shift.id, offen };
}

export async function loescheZeitvorgabe(organizationId: string, shiftId: string, kontext: { userId: string | null; ip: string | null; quelle: string }): Promise<void> {
  const shift = await db.shift.findFirst({ where: { id: shiftId, organizationId }, select: { id: true, assignmentId: true } });
  if (!shift) throw new BesetzungError("Schicht nicht gefunden.", 404);
  await db.shift.update({ where: { id: shift.id }, data: { vorgabeStart: null, vorgabeEnde: null, vorgabePause: null, vorgabeVon: null, vorgabeAm: null } });
  await logAudit({ organizationId, userId: kontext.userId ?? undefined, action: "shift.zeitvorgabe_geloescht", entityType: "shift", entityId: shift.id, data: { assignmentId: shift.assignmentId, ip: kontext.ip, quelle: kontext.quelle } });
}
