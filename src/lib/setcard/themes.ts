// Setcard-Designs pro Firma der incub:live-Gruppe – Farben, Wortmarke,
// Layout-Variante und Standard-Texte. Quelle: Setcard-Vorlagen (fess.jobs,
// europersonal) und die Websites der übrigen Marken.

export type SetcardLayout = "banner" | "sidebar" | "light";

export type SetcardTheme = {
  key: string; // Company.shortCode
  layout: SetcardLayout;
  // Farben
  primary: string; // Hauptakzent
  primaryDark: string;
  ink: string; // Textfarbe dunkel
  soft: string; // helle Akzentfläche
  background: string;
  footerBg: string;
  footerText: string;
  // Wortmarke: zwei Teile für zweifarbige Logos
  brandA: string;
  brandB: string;
  brandBColor?: string; // Farbe von Teil B (sonst primary)
  tagline: string;
  // Kartentyp-Bezeichnung
  cardTitle: string; // z. B. "Setcard · Promoter-Profil"
  // Vorgeschlagene Einsatzbereiche
  einsatzbereiche: string[];
  // Standard-Kontaktzeile im Footer (editierbar pro Setcard)
  footerContact: string;
  footerSub: string;
};

export const SETCARD_THEMES: Record<string, SetcardTheme> = {
  FJ: {
    key: "FJ",
    layout: "banner",
    primary: "#ea580c",
    primaryDark: "#c2410c",
    ink: "#1c1917",
    soft: "#fdf1e7",
    background: "#f4f2f0",
    footerBg: "#ea580c",
    footerText: "#ffffff",
    brandA: "fess",
    brandB: ".jobs",
    brandBColor: "#ffffff",
    tagline: "Promotion · Hostess · Events",
    cardTitle: "Setcard · Promoter-Profil",
    einsatzbereiche: ["Promotion", "Hostess / Messe", "Eventbetreuung", "Service / Gastro", "Promotion-Tour"],
    footerContact: "Rückfragen zum Einsatz – Team fess.jobs · WhatsApp / Anruf: +49 170 712 5119",
    footerSub: "FESS Recruitment GmbH & Co. KG · fess-recruitment.de · Teil der incub:live Gruppe",
  },
  EP: {
    key: "EP",
    layout: "banner",
    primary: "#0e7a4c",
    primaryDark: "#0c6b43",
    ink: "#1a2b22",
    soft: "#e9f6ef",
    background: "#eef7f2",
    footerBg: "#0e7a4c",
    footerText: "#ffffff",
    brandA: "euro",
    brandB: "personal",
    brandBColor: "#0e7a4c",
    tagline: "Arbeitnehmerüberlassung",
    cardTitle: "Mitarbeiterprofil · Arbeitnehmerüberlassung",
    einsatzbereiche: ["Lager & Logistik", "Produktion", "Handwerk", "Fahrer", "Gastronomie"],
    footerContact: "Ihr Ansprechpartner: Matthias Schapperth · Geschäftsführer · Tel. +49 (0) 821 99950234 · WhatsApp +49 151 59159990",
    footerSub: "Viktoriastraße 3 b · 86150 Augsburg · europersonal.de · Teil der incub:live Gruppe",
  },
  EC: {
    key: "EC",
    layout: "light",
    primary: "#e8502a",
    primaryDark: "#c23c1b",
    ink: "#1d2433",
    soft: "#fdeee8",
    background: "#ffffff",
    footerBg: "#e8502a",
    footerText: "#ffffff",
    brandA: "event",
    brandB: "crue",
    tagline: "Personal für Events, Festivals und Produktionen",
    cardTitle: "Crew-Card · Events, Festivals & Produktionen",
    einsatzbereiche: ["Stagehand / Aufbau", "Produktions-Crew", "Logistik-Crew", "Einlass / Absperrung", "Kassen / Service"],
    footerContact: "Booking – Team Eventcrue",
    footerSub: "eventcrue.de · Teil der incub:live Gruppe",
  },
  EQ: {
    key: "EQ",
    layout: "light",
    primary: "#8ed3f4",
    primaryDark: "#3d99c4",
    ink: "#17181c",
    soft: "#f7f9fa",
    background: "#ffffff",
    footerBg: "#17181c",
    footerText: "#ffffff",
    brandA: "eques",
    brandB: " · Human Resources",
    brandBColor: "#17181c",
    tagline: "Professionals & Werkstudierende · Finance, Consulting, Management",
    cardTitle: "Kandidaten-Profil",
    einsatzbereiche: ["Finance", "Consulting", "Management", "Werkstudent:in", "Projekt-Support"],
    footerContact: "eques Human Resources GmbH",
    footerSub: "Domplatz 9 · 35578 Wetzlar · eques.team · Teil der incub:live Gruppe",
  },
  FR: {
    key: "FR",
    layout: "sidebar",
    primary: "#ea580c",
    primaryDark: "#c2410c",
    ink: "#1c1917",
    soft: "#fdf1e7",
    background: "#ffffff",
    footerBg: "#ffffff",
    footerText: "#1c1917",
    brandA: "FESS",
    brandB: " recruitment",
    brandBColor: "#ffd9b8",
    tagline: "Fachkräfte · Industrie & Handwerk",
    cardTitle: "Recruitment-Profil · Direktvermittlung",
    einsatzbereiche: ["Elektro", "Metall / Industrie", "Handwerk", "Fach- & Führungskräfte", "Techniker"],
    footerContact: "FESS Recruitment GmbH & Co. KG · WhatsApp / Anruf: +49 170 712 5119",
    footerSub: "fess-recruitment.de · Teil der incub:live Gruppe",
  },
  IL: {
    key: "IL",
    layout: "light",
    primary: "#8db6cf",
    primaryDark: "#101114",
    ink: "#101114",
    soft: "#f4f6f8",
    background: "#ffffff",
    footerBg: "#101114",
    footerText: "#ffffff",
    brandA: "INCUB",
    brandB: ":live",
    tagline: "Die Unternehmensgruppe für spezialisiertes Personal",
    cardTitle: "Talent-Profil",
    einsatzbereiche: ["Marketing & Content", "Operations", "IT & Digitales", "Backoffice", "Gruppenweite Projekte"],
    footerContact: "INCUB LIVE",
    footerSub: "Die Unternehmensgruppe für spezialisiertes Personal · incub.live",
  },
};

export function themeFor(shortCode: string): SetcardTheme {
  return SETCARD_THEMES[shortCode] ?? SETCARD_THEMES.IL;
}

export function hasTheme(shortCode: string): boolean {
  return Boolean(SETCARD_THEMES[shortCode]);
}

// ─── Karteninhalt (Template-Slots) ──────────────────────────────────────────

export type SetcardExperience = { period: string; title: string; company: string; details?: string };

export type SetcardData = {
  name: string;
  role: string; // "Promoterin · Volvo Promotion Tour"
  profileNo: string;
  badges: Array<{ label: string; value: string }>; // z. B. Alter / Verfügbar
  tiles: Array<{ label: string; value: string; sub: string }>; // 3 Info-Kacheln
  profileText: string;
  einsatzText: string; // Einsatzschwerpunkt-Callout
  experiences: SetcardExperience[];
  qualifications: string[];
  skills: string[]; // Chips
  strengths: string[]; // Stärken-Box
  footerContact: string;
  footerSub: string;
};

export type PersonBase = {
  firstName: string;
  lastName: string;
  age: number | null;
  city: string | null;
  region: string | null;
  languages: string | null;
  mobility: string | null;
  experiences: SetcardExperience[];
  qualifications: string[];
  skills: string[];
  profileText: string | null;
};

// Fallback ohne KI: Karteninhalt direkt aus den Personendaten bauen
export function buildFallbackData(
  person: PersonBase,
  theme: SetcardTheme,
  einsatzbereich: string,
  profileNo: string
): SetcardData {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return {
    name,
    role: `${einsatzbereich}`,
    profileNo,
    badges: [
      ...(person.age ? [{ label: "Alter", value: `${person.age} Jahre` }] : []),
      { label: "Verfügbar", value: "auf Anfrage" },
    ],
    tiles: [
      { label: "Wohnort", value: person.city ?? "–", sub: person.region ?? "" },
      { label: "Sprachen", value: person.languages ?? "–", sub: "" },
      { label: "Mobilität", value: person.mobility ?? "–", sub: "" },
    ],
    profileText: person.profileText ?? "",
    einsatzText: einsatzbereich,
    experiences: person.experiences,
    qualifications: person.qualifications,
    skills: person.skills,
    strengths: person.qualifications.slice(0, 4),
    footerContact: theme.footerContact,
    footerSub: theme.footerSub,
  };
}
