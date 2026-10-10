// Gemeinsame Typen des Prototyps. Daten sind Beispieldaten, die Form folgt
// dem Datenmodell aus docs/ausbauplan.md Abschnitt 3.

export type Vertragsart = "Minijob" | "kurzfristig" | "Werkstudent" | "TZ" | "VZ";
export type Pool = "Stuttgart" | "Mannheim" | "Frankfurt" | "Idar-Oberstein" | "NRW";
export type Taetigkeit = "Stagehand" | "Catering" | "Bar" | "Einlass" | "Stapler" | "Messebau" | "Promotion" | "Logistik";
export type Kategorie = "A" | "B" | "C";
export type CrewStatus = "Bewerber" | "aktiv" | "gesperrt" | "ausgeschieden";
export type Lang = "de" | "en";

export const TAETIGKEITEN: Taetigkeit[] = ["Stagehand", "Catering", "Bar", "Einlass", "Stapler", "Messebau", "Promotion", "Logistik"];

export interface Contract {
  vertragsart: Vertragsart;
  wochenstunden: number;
  monatsgrenzeStd: number | null;
  monatsgrenzeEur: number | null;
  stundenlohn: number;
  gueltigVon: string; // JJJJ-MM-TT
  gueltigBis: string | null;
  docusignId: string;
}

// Nachweis: nur angegeben (halbe Punkte) oder von FESS geprüft (volle Punkte)
export type NachweisStatus = "keiner" | "angegeben" | "geprueft";

export interface ProfileAnswers {
  // 1 Basis
  volljaehrig: boolean;
  sprachen: Array<{ sprache: string; niveau: "Grundkenntnisse" | "gut" | "fließend" | "Muttersprache" }>;
  // 2 Mobilität
  fuehrerschein: boolean;
  eigenesAuto: boolean;
  maxAnfahrtMin: number;
  uebernachtungOk: boolean;
  fahrgemeinschaft: boolean;
  // 3 Erfahrung
  erfahrung: Record<Taetigkeit, { jahre: number; einsaetze: number }>;
  groessteVeranstaltung: number; // Besucher
  fruehereFirmen: string;
  // 4 Nachweise
  nachweise: { stapler: NachweisStatus; ersthelfer: NachweisStatus; hygiene: NachweisStatus; paragraph34a: NachweisStatus };
  // 5 Ausrüstung
  ausruestung: { s3Schuhe: boolean; handschuhe: boolean; helm: boolean; warnweste: boolean; schwarzeKleidung: boolean; werkzeug: boolean };
  shirtgroesse: string;
  // Schuhgröße (EU) und Wunsch nach Arbeitskleidung gegen Pfand (neues System)
  schuhgroesse?: string;
  kleidung?: KleidungWunsch;
  // 6 Verfügbarkeit
  wunschVertrag: Vertragsart;
  wochentage: number[]; // 0 = So
  nachtOk: boolean;
  wunschStundenMonat: number;
  aktuellerStatus: string;
  andereArbeitgeber: boolean;
  // Situationsfragen: gewählter Optionsindex je Frage
  situation: number[];
}

// Wunsch nach Arbeitskleidung von FESS; wird gegen Pfand ausgegeben
export interface KleidungWunsch {
  wunsch: boolean;
  artikel: string[];
  hosengroesse: string;
}

// Eine ausgegebene Kleidung (Pfand-Verfolgung im Dashboard)
export interface KleidungAusgabe {
  id: string;
  artikel: string;
  groesse: string;
  pfandEur: number;
  ausgegebenAm: string; // JJJJ-MM-TT
  zurueckAm: string | null;
  notiz: string;
}

// Entscheidung des Teams: darf die Person die Aufträge sehen und sich bewerben?
export type FreigabeStatus = "bestaetigt" | "abgelehnt";
export interface Freigabe {
  status: FreigabeStatus;
  am: string; // JJJJ-MM-TT
  von: string;
  notiz: string;
}

// Wann wurde der Person zuletzt eine Nachricht (Einladung, Erinnerung …) bereitgestellt?
export interface Kontakt {
  vorlage: string;
  am: string; // JJJJ-MM-TT
  von: string;
}

export interface Rating {
  jobId: string;
  von: "Teamleiter" | "Dispo";
  puenktlich: number;
  einsatz: number;
  teamwork: number;
  kommentar: string;
}

export interface UnterweisungAck {
  version: string;
  bestaetigtAm: string; // JJJJ-MM-TT
  quizScore: number; // 0..1
}

export interface Crew {
  id: string;
  pnr: string;
  vorname: string;
  nachname: string;
  telefon: string;
  email: string;
  wohnort: string;
  plz: string;
  pool: Pool;
  status: CrewStatus;
  xp: number;
  einsaetze: number;
  arbeitstageJahr: number;
  profile: ProfileAnswers | null;
  contract: Contract | null;
  unterweisungen: Record<string, UnterweisungAck>;
  ratings: Rating[];
  notizen: string;
  // Neues System (alle optional, damit bestehende Datensätze gültig bleiben)
  freigabe?: Freigabe;
  kleidungAusgabe?: KleidungAusgabe[];
  kontakt?: Kontakt;
  importQuelle?: { quelle: "zvoove"; am: string };
}

export interface Schicht {
  id: string;
  bezeichnung: string;
  datum: string;
  start: string;
  ende: string;
  taetigkeit: Taetigkeit;
  bedarf: number;
}

export type JobStatus = "Entwurf" | "offen" | "voll" | "laufend" | "abgerechnet";

export interface Job {
  id: string; // FESS-2026-0142
  kunde: string;
  titel: string;
  ort: string;
  plz: string;
  datumVon: string;
  datumBis: string;
  schichten: Schicht[];
  beschreibung: string;
  dresscode: string;
  psa: string[];
  hoehe: boolean;
  verpflegung: string;
  parken: string;
  treffpunkt: string;
  ansprechpartner: string;
  ablauf: string[];
  status: JobStatus;
  quelle: "Planung Regios" | "manuell";
  // Zusätzliche Pflicht-Schulungen nur für diesen Auftrag (IDs der Module)
  zusatzModule?: string[];
  // Schlüssel aus dem Tabellenimport, damit ein erneuter Import denselben Auftrag aktualisiert
  importKey?: string;
}

export type BewerbungStatus = "neu" | "passt" | "Warteliste" | "abgelehnt" | "bestätigt";

export interface Application {
  id: string;
  jobId: string;
  pnr: string;
  schichtIds: string[];
  eigeneAnreise: boolean;
  abfahrtsort: string;
  fahrgemeinschaftPlaetze: number;
  hatVertrag: boolean;
  status: BewerbungStatus;
  notizIntern: string;
  kommentar: string;
  eingegangen: string;
}

export type StundenStatus = "offen" | "geprueft" | "freigegeben" | "exportiert";

export interface Pause {
  von: string;
  bis: string;
}

export interface StundenRow {
  id: string;
  datum: string;
  pnr: string;
  start: string;
  pausen: Pause[];
  ende: string;
  pauschale: number; // Garantiestunden
  kunde: string;
  auftrag: string;
  spesen: number;
  reiseKm: number; // privat, in km
  reiseGesch: number; // geschäftlich, Euro
  bonus: number;
  abzug: number;
  bemerkung: string;
  status: StundenStatus;
  quelle: "Zettel" | "App" | "manuell";
  sourceRef: string | null; // Verweis auf den bestehenden Stundenzettel
}

export interface Warnung {
  code: string;
  level: "fehler" | "warnung";
  text: string;
}

export interface AuditEintrag {
  id: string;
  zeitpunkt: string;
  user: string;
  tabelle: string;
  datensatz: string;
  feld: string;
  alt: string;
  neu: string;
  grund: string | null;
}
