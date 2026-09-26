// PDF-Erzeugung für Konkretisierung und Stundennachweis inkl. Ablage im
// Dokumentenspeicher (unveränderlich, Hash im Audit-Log).
import { db } from "@/lib/db";
import { getBlob } from "../blob";
import { safeFilename, storeDocument } from "../documents";
import { round2 } from "../hours";
import { renderKonkretisierung, type KonkretisierungRow } from "../pdf/konkretisierung";
import { renderStundennachweis, type StundennachweisRow } from "../pdf/stundennachweis";
import { SAFETY_VERSION } from "../safety";
import { berlinDateKey, berlinTime, dateOnlyKey, formatKeyDE } from "../tz";
import { loadAssignment, type AssignmentDetail } from "./assignments";
import { logAudit } from "@/lib/audit";

const ROLE_LABEL: Record<string, string> = { MITARBEITER: "Mitarbeiter", ANSPRECHPARTNER: "Ansprechpartner vor Ort", SPARE: "Ersatz" };

function todayDE(): string {
  return formatKeyDE(berlinDateKey(new Date()));
}

function stamp(d: Date): string {
  return `${formatKeyDE(berlinDateKey(d))} ${berlinTime(d)}`;
}

function docBase(a: AssignmentDetail, prefix: string): string {
  return safeFilename(`${prefix}_${a.projekt}_${formatKeyDE(dateOnlyKey(a.datumVon))}`) + ".pdf";
}

export async function generateKonkretisierungPdf(orgId: string, assignmentId: string, userId: string | null): Promise<{ documentId: string; filename: string }> {
  const a = await loadAssignment(orgId, assignmentId);
  if (!a) throw new Error("Einsatz nicht gefunden.");
  const zeilen: KonkretisierungRow[] = [];
  let nr = 1;
  for (const s of a.shifts) {
    for (const sa of s.assignments) {
      if (sa.status === "STORNIERT") continue;
      zeilen.push({
        nr: nr++,
        name: `${sa.employee.vorname} ${sa.employee.nachname}`,
        schicht: s.bezeichnung,
        beginn: stamp(sa.planStart),
        ende: stamp(sa.planEnde),
        taetigkeit: s.taetigkeit || "–",
        funktion: ROLE_LABEL[sa.rolle] ?? sa.rolle,
      });
    }
  }
  const bytes = await renderKonkretisierung({
    einsatznummer: a.einsatznummer,
    projekt: a.projekt,
    artist: a.artist,
    entleiher: { name: a.customer.name, adresse: a.customer.adresse, ansprechpartner: a.customer.ansprechpartner },
    einsatzort: a.einsatzort,
    datumVon: formatKeyDE(dateOnlyKey(a.datumVon)),
    datumBis: formatKeyDE(dateOnlyKey(a.datumBis)),
    einsatzbereich: a.einsatzbereich,
    aueVertragRef: a.aueVertragRef,
    erstelltAm: todayDE(),
    zeilen,
  });
  const filename = docBase(a, "Konkretisierung");
  const doc = await storeDocument({
    organizationId: orgId,
    category: "konkretisierung",
    filename,
    mimeType: "application/pdf",
    bytes,
    meta: { assignmentId: a.id, einsatznummer: a.einsatznummer, personen: zeilen.length },
    createdById: userId,
    replaceForAssignmentId: a.id,
    links: [{ assignmentId: a.id, customerId: a.customerId, datum: dateOnlyKey(a.datumVon) }],
  });
  if (a.status === "ENTWURF") {
    await db.assignment.update({ where: { id: a.id }, data: { status: "KONKRETISIERT" } });
  }
  return { documentId: doc.id, filename };
}

// Ein Nachweis über den ganzen Einsatz – oder, mit shiftId, einer je Schicht.
// Je Schicht entsteht er, sobald der Kunde diese Schicht einzeln bestätigt:
// dann steht auf dem Papier genau das, was er unterschrieben hat.
export async function generateStundennachweisPdf(
  orgId: string,
  assignmentId: string,
  userId: string | null,
  options: { shiftId?: string | null } = {}
): Promise<{ documentId: string; filename: string; offen: number }> {
  const voll = await loadAssignment(orgId, assignmentId);
  if (!voll) throw new Error("Einsatz nicht gefunden.");
  const shiftId = options.shiftId ?? null;
  const schicht = shiftId ? voll.shifts.find((s) => s.id === shiftId) : null;
  if (shiftId && !schicht) throw new Error("Schicht nicht gefunden.");
  const a = schicht ? { ...voll, shifts: [schicht] } : voll;
  const zeilen: StundennachweisRow[] = [];
  const fahrten: Array<{ person: string; fahrzeugart: string; strecken: Array<{ von: string; nach: string; km: string }>; summe: string }> = [];
  const hinweise: string[] = [];
  const employeeIds = new Set<string>();
  let nr = 1;
  let summe = 0;
  let offen = 0;
  const versions = new Set<string>();

  for (const s of a.shifts) {
    for (const sa of s.assignments) {
      if (sa.status === "STORNIERT") continue;
      const name = `${sa.employee.vorname} ${sa.employee.nachname}`;
      employeeIds.add(sa.employeeId);
      const entry = sa.timeEntries[0];
      if (!entry) {
        offen++;
        zeilen.push({
          nr: nr++,
          name,
          schicht: s.bezeichnung,
          datum: formatKeyDE(berlinDateKey(sa.planStart)),
          start: `(${berlinTime(sa.planStart)})`,
          pause: "–",
          ende: `(${berlinTime(sa.planEnde)})`,
          gesamt: "–",
          taetigkeit: s.taetigkeit,
          pkw: "–",
          spesen: "–",
          notiz: "Plan, nicht erfasst",
          signature: null,
          unterschriftZeitpunkt: null,
          status: "offen",
        });
        continue;
      }
      const signature = entry.unterschriftMitarbeiterUrl ? (await getBlob(entry.unterschriftMitarbeiterUrl))?.bytes ?? null : null;
      if (!signature) offen++;
      if (entry.unterweisungVersion) versions.add(entry.unterweisungVersion);
      const gesamt = Number(entry.stundenGesamt);
      summe += gesamt;
      zeilen.push({
        nr: nr++,
        name,
        schicht: s.bezeichnung,
        datum: formatKeyDE(berlinDateKey(entry.istStart)),
        start: berlinTime(entry.istStart),
        pause: `${entry.pauseMinuten} min`,
        ende: berlinDateKey(entry.istEnde) === berlinDateKey(entry.istStart) ? berlinTime(entry.istEnde) : `${berlinTime(entry.istEnde)} (+1)`,
        gesamt: gesamt.toFixed(2).replace(".", ","),
        taetigkeit: entry.taetigkeit || s.taetigkeit,
        pkw: entry.pkw ? (entry.pkwArt === "FIRMA" ? "Firma" : "privat") : "–",
        spesen: entry.spesen ? (entry.spesenBetrag !== null ? `${Number(entry.spesenBetrag).toFixed(2).replace(".", ",")} €` : "ja") : "–",
        notiz: [entry.notiz, entry.version > 1 ? `Korrektur v${entry.version}: ${entry.korrekturGrund ?? ""}` : null].filter(Boolean).join(" · "),
        signature,
        unterschriftZeitpunkt: entry.unterschriftZeitpunkt ? stamp(entry.unterschriftZeitpunkt) : null,
        status: signature ? "unterschrieben" : entry.version > 1 ? "korrigiert" : "offen",
      });
      if (entry.pkw && entry.trips.length > 0) {
        const km = entry.trips.reduce((sum, t) => sum + Number(t.km), 0);
        fahrten.push({
          person: name,
          fahrzeugart: entry.pkwArt === "FIRMA" ? "Firmenfahrzeug" : "Privat-PKW",
          strecken: entry.trips.map((t) => ({ von: t.von, nach: t.nach, km: Number(t.km).toFixed(1).replace(".", ",") })),
          summe: round2(km).toFixed(1).replace(".", ","),
        });
      }
    }
  }
  if (offen > 0) hinweise.push(`${offen} Person(en) ohne Unterschrift – Zeilen mit Planzeiten in Klammern.`);
  // Die Bestätigung, die zu diesem Papier gehört: beim Schichtnachweis die
  // der Schicht, sonst die für den ganzen Einsatz.
  const kunde = a.confirmations.find((c) => (schicht ? c.shiftId === schicht.id : c.shiftId === null)) ?? null;
  const kundeSig = kunde ? (await getBlob(kunde.unterschriftUrl))?.bytes ?? null : null;

  const bytes = await renderStundennachweis({
    einsatznummer: a.einsatznummer,
    projekt: a.projekt,
    artist: a.artist,
    entleiher: { name: a.customer.name, adresse: a.customer.adresse },
    einsatzort: a.einsatzort,
    datumVon: formatKeyDE(dateOnlyKey(a.datumVon)),
    datumBis: formatKeyDE(dateOnlyKey(a.datumBis)),
    einsatzbereich: a.einsatzbereich,
    aueVertragRef: a.aueVertragRef,
    erstelltAm: todayDE(),
    zeilen,
    fahrten,
    kunde: kunde ? { name: kunde.kundeName, signature: kundeSig, zeitpunkt: stamp(kunde.zeitpunkt) } : null,
    summeStunden: round2(summe).toFixed(2).replace(".", ","),
    unterweisungVersion: versions.size > 0 ? [...versions].join(", ") : SAFETY_VERSION,
    hinweise,
  });
  const filename = schicht ? safeFilename(`Stundennachweis_${a.projekt}_${schicht.bezeichnung}_${formatKeyDE(berlinDateKey(schicht.planStart))}`) + ".pdf" : docBase(a, "Stundennachweis");
  const datum = schicht ? berlinDateKey(schicht.planStart) : dateOnlyKey(a.datumVon);
  const doc = await storeDocument({
    organizationId: orgId,
    category: "stundennachweis",
    filename,
    mimeType: "application/pdf",
    bytes,
    meta: { assignmentId: a.id, einsatznummer: a.einsatznummer, shiftId, schicht: schicht?.bezeichnung ?? null, offen, summeStunden: round2(summe) },
    createdById: userId,
    replaceForAssignmentId: a.id,
    replaceForShiftId: shiftId,
    // Auch die Personenverweise tragen die Schicht, damit der Nachweis über
    // den ganzen Einsatz die Schichtnachweise nicht mitersetzt.
    links: [
      { assignmentId: a.id, shiftId, customerId: a.customerId, datum },
      ...[...employeeIds].map((employeeId) => ({ assignmentId: a.id, shiftId, employeeId, customerId: a.customerId, datum })),
    ],
  });
  await logAudit({
    organizationId: orgId,
    userId: userId ?? undefined,
    action: "assignment.stundennachweis",
    entityType: "assignment",
    entityId: a.id,
    data: { documentId: doc.id, sha256: doc.sha256, offen, shiftId, schicht: schicht?.bezeichnung ?? null },
  });
  return { documentId: doc.id, filename, offen };
}
