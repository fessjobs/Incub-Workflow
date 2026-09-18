// Öffentliche (Token-)Sichten: Nur die Daten, die der jeweilige Mitarbeiter
// bzw. der Ansprechpartner vor Ort sehen darf – keine IDs anderer Personen,
// keine Lohnarten, keine Kontaktdaten.
import type { Prisma } from "@prisma/client";
import { SAFETY_SECTIONS, SAFETY_VERSION, CONFIRMATION_TEXT } from "../safety";
import { berlinDateKey, berlinTime, dateOnlyKey, formatKeyDE } from "../tz";
import { tokenState, type TokenState } from "./time-entries";

type SAWithAll = Prisma.ShiftAssignmentGetPayload<{
  include: {
    employee: true;
    shift: { include: { assignment: { include: { customer: true } } } };
    timeEntries: { include: { trips: true } };
  };
}>;

export type EntryView = {
  version: number;
  startDatum: string;
  start: string;
  endeDatum: string;
  ende: string;
  pauseMinuten: number;
  stundenGesamt: number;
  taetigkeit: string;
  notiz: string;
  pkw: boolean;
  pkwArt: "PRIVAT" | "FIRMA" | null;
  fahrten: Array<{ von: string; nach: string; km: number }>;
  spesen: boolean;
  spesenBetrag: number | null;
  unterschriftZeitpunkt: string | null;
  korrekturGrund: string | null;
};

export type TokenView = {
  state: TokenState;
  einsatz: { einsatznummer: string; projekt: string; artist: string | null; kunde: string; einsatzort: string; datum: string };
  schicht: { bezeichnung: string; taetigkeit: string; treffpunkt: string | null; startDatum: string; start: string; endeDatum: string; ende: string; datumDE: string };
  person: { vorname: string; nachname: string };
  eintrag: EntryView | null;
  unterweisung: { version: string; abschnitte: typeof SAFETY_SECTIONS; bestaetigung: string[] };
};

export function entryView(e: SAWithAll["timeEntries"][number]): EntryView {
  return {
    version: e.version,
    startDatum: berlinDateKey(e.istStart),
    start: berlinTime(e.istStart),
    endeDatum: berlinDateKey(e.istEnde),
    ende: berlinTime(e.istEnde),
    pauseMinuten: e.pauseMinuten,
    stundenGesamt: Number(e.stundenGesamt),
    taetigkeit: e.taetigkeit ?? "",
    notiz: e.notiz ?? "",
    pkw: e.pkw,
    pkwArt: e.pkwArt,
    fahrten: e.trips.map((t) => ({ von: t.von, nach: t.nach, km: Number(t.km) })),
    spesen: e.spesen,
    spesenBetrag: e.spesenBetrag === null ? null : Number(e.spesenBetrag),
    unterschriftZeitpunkt: e.unterschriftZeitpunkt?.toISOString() ?? null,
    korrekturGrund: e.korrekturGrund,
  };
}

export function tokenView(sa: SAWithAll): TokenView {
  const a = sa.shift.assignment;
  const entry = sa.timeEntries.find((t) => t.aktuell) ?? null;
  return {
    state: tokenState(sa),
    einsatz: {
      einsatznummer: a.einsatznummer,
      projekt: a.projekt,
      artist: a.artist,
      kunde: a.customer.name,
      einsatzort: a.einsatzort,
      datum: formatKeyDE(dateOnlyKey(a.datumVon)) + (dateOnlyKey(a.datumVon) !== dateOnlyKey(a.datumBis) ? ` – ${formatKeyDE(dateOnlyKey(a.datumBis))}` : ""),
    },
    schicht: {
      bezeichnung: sa.shift.bezeichnung,
      taetigkeit: sa.shift.taetigkeit,
      treffpunkt: sa.shift.treffpunkt,
      startDatum: berlinDateKey(sa.planStart),
      start: berlinTime(sa.planStart),
      endeDatum: berlinDateKey(sa.planEnde),
      ende: berlinTime(sa.planEnde),
      datumDE: formatKeyDE(berlinDateKey(sa.planStart)),
    },
    person: { vorname: sa.employee.vorname, nachname: sa.employee.nachname },
    eintrag: entry ? entryView(entry) : null,
    unterweisung: { version: SAFETY_VERSION, abschnitte: SAFETY_SECTIONS, bestaetigung: CONFIRMATION_TEXT },
  };
}
