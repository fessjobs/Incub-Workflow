// Fragebogen (Modul D): ca. 35 Fragen in 6 Etappen plus 4 Situationsfragen.
//
// AGG: Gefragt wird nach nichts, was nicht zur Tätigkeit gehört – nicht nach
// Alter (nur „volljährig“), Herkunft, Religion, Gesundheit, Schwangerschaft.
// Die Arbeitserlaubnis klärt der Vertragsprozess. Ein Test prüft die
// Fragentexte gegen eine Liste verbotener Themen.
import type { Lang } from "./types";

export type FrageTyp = "text" | "tel" | "email" | "plz" | "ja-nein" | "zahl" | "auswahl" | "mehrfach" | "erfahrung" | "nachweis" | "sprachen";

export interface Frage {
  id: string;
  etappe: number;
  typ: FrageTyp;
  label: { de: string; en: string };
  hilfe?: { de: string; en: string };
  optionen?: Array<{ wert: string; de: string; en: string }>;
  einheit?: string;
  pflicht?: boolean;
}

export const ETAPPEN: Array<{ nr: number; titel: { de: string; en: string }; zweck: string }> = [
  { nr: 1, titel: { de: "Basis", en: "Basics" }, zweck: "Kontakt, Geocoding" },
  { nr: 2, titel: { de: "Mobilität", en: "Mobility" }, zweck: "Radius, Dispo" },
  { nr: 3, titel: { de: "Erfahrung", en: "Experience" }, zweck: "Tätigkeitsprofil" },
  { nr: 4, titel: { de: "Nachweise", en: "Certificates" }, zweck: "Spezialtätigkeiten" },
  { nr: 5, titel: { de: "Ausrüstung", en: "Equipment" }, zweck: "PSA-Check" },
  { nr: 6, titel: { de: "Verfügbarkeit", en: "Availability" }, zweck: "Vertrag, Grenzen" },
];

const JA = { de: "Ja", en: "Yes" };
void JA;

export const FRAGEN: Frage[] = [
  // 1 Basis
  { id: "vorname", etappe: 1, typ: "text", label: { de: "Vorname", en: "First name" }, pflicht: true },
  { id: "nachname", etappe: 1, typ: "text", label: { de: "Nachname", en: "Last name" }, pflicht: true },
  { id: "handy", etappe: 1, typ: "tel", label: { de: "Handynummer", en: "Mobile number" }, hilfe: { de: "Für den Login per WhatsApp-Code.", en: "Used for the WhatsApp login code." }, pflicht: true },
  { id: "email", etappe: 1, typ: "email", label: { de: "E-Mail", en: "Email" } },
  { id: "plz", etappe: 1, typ: "plz", label: { de: "Postleitzahl", en: "Postcode" }, pflicht: true },
  { id: "wohnort", etappe: 1, typ: "text", label: { de: "Wohnort", en: "Town" }, pflicht: true },
  { id: "sprachen", etappe: 1, typ: "sprachen", label: { de: "Sprachen mit Niveau", en: "Languages and level" } },
  { id: "volljaehrig", etappe: 1, typ: "ja-nein", label: { de: "Ich bin volljährig.", en: "I am of legal age." }, pflicht: true },
  // 2 Mobilität
  { id: "fuehrerschein", etappe: 2, typ: "ja-nein", label: { de: "Führerschein Klasse B", en: "Driving licence (class B)" } },
  { id: "eigenesAuto", etappe: 2, typ: "ja-nein", label: { de: "Eigenes Auto", en: "Own car" } },
  { id: "maxAnfahrtMin", etappe: 2, typ: "zahl", einheit: "min", label: { de: "Maximale Anfahrt", en: "Maximum travel time" }, hilfe: { de: "In Minuten, einfache Strecke.", en: "Minutes, one way." } },
  { id: "uebernachtungOk", etappe: 2, typ: "ja-nein", label: { de: "Übernachtung bei weiter Anfahrt ok", en: "Overnight stay is fine for long trips" } },
  { id: "fahrgemeinschaft", etappe: 2, typ: "ja-nein", label: { de: "Fahrgemeinschaft möglich", en: "Happy to car-share" } },
  // 3 Erfahrung
  { id: "erfahrung", etappe: 3, typ: "erfahrung", label: { de: "Erfahrung je Tätigkeit", en: "Experience per role" }, hilfe: { de: "Jahre und ungefähre Zahl der Einsätze.", en: "Years and rough number of jobs." } },
  { id: "groessteVeranstaltung", etappe: 3, typ: "zahl", einheit: "Besucher", label: { de: "Größte Veranstaltung, bei der du gearbeitet hast", en: "Biggest event you have worked at" } },
  { id: "fruehereFirmen", etappe: 3, typ: "text", label: { de: "Frühere Firmen / Agenturen", en: "Previous companies / agencies" } },
  // 4 Nachweise
  { id: "nachweis_stapler", etappe: 4, typ: "nachweis", label: { de: "Staplerschein", en: "Forklift licence" }, hilfe: { de: "Foto oder PDF hochladen – wir prüfen ihn.", en: "Upload a photo or PDF – we will verify it." } },
  { id: "nachweis_ersthelfer", etappe: 4, typ: "nachweis", label: { de: "Ersthelfer", en: "First aider" } },
  { id: "nachweis_hygiene", etappe: 4, typ: "nachweis", label: { de: "Hygienebelehrung nach IfSG", en: "Food hygiene briefing (IfSG)" } },
  { id: "nachweis_34a", etappe: 4, typ: "nachweis", label: { de: "Sachkunde § 34a", en: "Security licence § 34a" } },
  // 5 Ausrüstung
  { id: "ausr_s3", etappe: 5, typ: "ja-nein", label: { de: "S3-Sicherheitsschuhe", en: "S3 safety boots" } },
  { id: "ausr_handschuhe", etappe: 5, typ: "ja-nein", label: { de: "Arbeitshandschuhe", en: "Work gloves" } },
  { id: "ausr_helm", etappe: 5, typ: "ja-nein", label: { de: "Schutzhelm", en: "Safety helmet" } },
  { id: "ausr_warnweste", etappe: 5, typ: "ja-nein", label: { de: "Warnweste", en: "High-vis vest" } },
  { id: "ausr_schwarz", etappe: 5, typ: "ja-nein", label: { de: "Schwarze Kleidung", en: "Black clothing" } },
  { id: "ausr_werkzeug", etappe: 5, typ: "ja-nein", label: { de: "Eigenes Werkzeug (Multitool, Taschenlampe)", en: "Own tools (multitool, torch)" } },
  {
    id: "shirt",
    etappe: 5,
    typ: "auswahl",
    label: { de: "Shirtgröße", en: "T-shirt size" },
    optionen: ["XS", "S", "M", "L", "XL", "XXL"].map((g) => ({ wert: g, de: g, en: g })),
  },
  // 6 Verfügbarkeit
  {
    id: "wunschVertrag",
    etappe: 6,
    typ: "auswahl",
    label: { de: "Gewünschte Vertragsart", en: "Preferred contract" },
    optionen: [
      { wert: "Minijob", de: "Minijob", en: "Mini-job" },
      { wert: "kurzfristig", de: "Kurzfristig beschäftigt", en: "Short-term" },
      { wert: "Werkstudent", de: "Werkstudent", en: "Working student" },
      { wert: "TZ", de: "Teilzeit", en: "Part-time" },
      { wert: "VZ", de: "Vollzeit", en: "Full-time" },
    ],
  },
  {
    id: "wochentage",
    etappe: 6,
    typ: "mehrfach",
    label: { de: "An welchen Wochentagen kannst du?", en: "Which weekdays can you work?" },
    optionen: [
      { wert: "1", de: "Mo", en: "Mon" },
      { wert: "2", de: "Di", en: "Tue" },
      { wert: "3", de: "Mi", en: "Wed" },
      { wert: "4", de: "Do", en: "Thu" },
      { wert: "5", de: "Fr", en: "Fri" },
      { wert: "6", de: "Sa", en: "Sat" },
      { wert: "0", de: "So", en: "Sun" },
    ],
  },
  { id: "nachtOk", etappe: 6, typ: "ja-nein", label: { de: "Nachtschichten ok", en: "Night shifts are fine" } },
  { id: "wunschStundenMonat", etappe: 6, typ: "zahl", einheit: "h", label: { de: "Wunschstunden pro Monat", en: "Hours per month you would like" } },
  {
    id: "aktuellerStatus",
    etappe: 6,
    typ: "auswahl",
    label: { de: "Aktuell", en: "Currently" },
    optionen: [
      { wert: "Schüler/in", de: "Schule", en: "School" },
      { wert: "Student/in", de: "Studium", en: "University" },
      { wert: "Angestellt", de: "Angestellt", en: "Employed" },
      { wert: "Selbstständig", de: "Selbstständig", en: "Self-employed" },
      { wert: "Arbeitsuchend", de: "Arbeitsuchend", en: "Job-seeking" },
    ],
  },
  { id: "andereArbeitgeber", etappe: 6, typ: "ja-nein", label: { de: "Ich arbeite nebenbei bei anderen Arbeitgebern.", en: "I also work for other employers." }, hilfe: { de: "Wichtig für Minijob- und 70-Tage-Grenzen.", en: "Matters for mini-job and 70-day limits." } },
];

export interface SituationsFrage {
  id: string;
  frage: { de: string; en: string };
  optionen: Array<{ de: string; en: string; punkte: number }>;
}

// Vier Situationsfragen, je Frage 0 bis 5 Punkte
export const SITUATIONSFRAGEN: SituationsFrage[] = [
  {
    id: "s1",
    frage: { de: "Dein Zug fällt um 6:30 aus, Call ist um 8:00 in einer anderen Stadt. Was tust du?", en: "Your train is cancelled at 6:30, call time is 8:00 in another city. What do you do?" },
    optionen: [
      { de: "Sofort bei der Dispo melden, Alternativen prüfen (Fahrgemeinschaft, nächste Verbindung) und die neue Ankunftszeit durchgeben.", en: "Tell dispatch right away, check alternatives (car-share, next connection) and give your new arrival time.", punkte: 5 },
      { de: "Kurz warten, ob der Zug doch noch kommt, und dann Bescheid sagen.", en: "Wait a bit in case the train still comes, then let them know.", punkte: 2 },
      { de: "Später losfahren und erst vor Ort erklären, warum es länger gedauert hat.", en: "Leave later and explain on site why it took longer.", punkte: 0 },
      { de: "Nichts sagen und nicht hinfahren.", en: "Say nothing and do not go.", punkte: 0 },
    ],
  },
  {
    id: "s2",
    frage: { de: "Auf der Rampe liegt ein loses Kabel, über das jemand stolpern kann. Was tust du?", en: "A loose cable lies across the ramp and someone could trip over it. What do you do?" },
    optionen: [
      { de: "Stelle absichern, Kabel verlegen oder abkleben und dem Teamleiter Bescheid geben.", en: "Secure the spot, reroute or tape the cable and tell the team lead.", punkte: 5 },
      { de: "Kabel kurz zur Seite schieben und weiterarbeiten.", en: "Push the cable aside and carry on.", punkte: 2 },
      { de: "Nichts tun, das ist nicht meine Aufgabe.", en: "Do nothing, it is not my job.", punkte: 0 },
    ],
  },
  {
    id: "s3",
    frage: { de: "Ein Kollege will allein eine schwere Case-Kiste heben, die zu zweit getragen werden sollte. Was tust du?", en: "A colleague is about to lift a heavy case alone that should be carried by two. What do you do?" },
    optionen: [
      { de: "Anbieten mitanzufassen oder ein Hilfsmittel (Hubwagen, Rollbrett) zu holen.", en: "Offer to help or fetch an aid (pallet truck, dolly).", punkte: 5 },
      { de: "Ihn kurz darauf hinweisen und weitergehen.", en: "Point it out briefly and walk on.", punkte: 2 },
      { de: "Zuschauen – er wird es schon wissen.", en: "Watch, he will know what he is doing.", punkte: 0 },
    ],
  },
  {
    id: "s4",
    frage: { de: "Deine Schicht endet in 10 Minuten, der Abbau ist nicht fertig. Der Teamleiter bittet dich um 30 Minuten länger, dein Bus fährt in 20 Minuten. Was tust du?", en: "Your shift ends in 10 minutes and the teardown is not finished. The team lead asks you to stay 30 minutes longer; your bus leaves in 20 minutes. What do you do?" },
    optionen: [
      { de: "Offen sagen, dass ich den Bus habe, nach einer Lösung fragen (z. B. später gehen, Ablösung) und die Mehrzeit auf dem Zettel eintragen.", en: "Say openly that I have a bus, ask for a solution (leave later, relief) and record the extra time on the sheet.", punkte: 5 },
      { de: "Zusagen und die Mehrzeit nicht aufschreiben.", en: "Agree and not write down the extra time.", punkte: 1 },
      { de: "Pünktlich gehen, ohne etwas zu sagen.", en: "Leave on time without saying anything.", punkte: 0 },
    ],
  },
];

export function frageText(f: Frage, lang: Lang): string {
  return f.label[lang];
}

export function fragenDerEtappe(nr: number): Frage[] {
  return FRAGEN.filter((f) => f.etappe === nr);
}

// Wörter, nach denen nicht gefragt werden darf (AGG) – vom Test genutzt
export const VERBOTENE_THEMEN = [
  "alter",
  "geburtsdatum",
  "geburtsjahr",
  "herkunft",
  "nationalität",
  "staatsangehörigkeit",
  "religion",
  "konfession",
  "gesundheit",
  "krankheit",
  "behinderung",
  "schwanger",
  "familienstand",
  "kinder",
  "age",
  "birth",
  "origin",
  "nationality",
  "religion",
  "health",
  "illness",
  "disability",
  "pregnan",
  "marital",
];
