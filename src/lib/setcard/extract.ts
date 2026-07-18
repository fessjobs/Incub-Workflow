// KI-Auslesen für den Setcard-Maker:
// 1) extractPerson: Lebenslauf/Ausweis/Screenshots/Freitext → Personendaten
//    (die Uploads werden NUR hier verwendet und nicht gespeichert)
// 2) tailorSetcard: Personendaten + Firma + Einsatzbereich → zugeschnittener
//    Karteninhalt (Profiltext, Skills, Stärken) im Ton der Marke
import Anthropic from "@anthropic-ai/sdk";
import type { PersonBase, SetcardData, SetcardTheme } from "./themes";
import { buildFallbackData } from "./themes";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";

export function isSetcardAiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function parseJsonLoose<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export type ExtractedPerson = {
  firstName: string | null;
  lastName: string | null;
  age: number | null;
  birthYear: number | null;
  city: string | null;
  region: string | null;
  phone: string | null;
  email: string | null;
  languages: string | null;
  mobility: string | null;
  experiences: Array<{ period: string; title: string; company: string; details?: string }>;
  qualifications: string[];
  skills: string[];
  profileText: string | null;
};

type UploadFile = { bytes: Buffer; mime: string };

export async function extractPerson(
  files: UploadFile[],
  freetext: string
): Promise<{ data: ExtractedPerson | null; error?: string }> {
  if (!isSetcardAiAvailable()) {
    return { data: null, error: "Kein ANTHROPIC_API_KEY – Daten bitte manuell eintragen." };
  }
  const client = new Anthropic();

  const content: Anthropic.Messages.ContentBlockParam[] = [];
  for (const f of files.slice(0, 8)) {
    if (f.mime === "application/pdf") {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: f.bytes.toString("base64") },
      });
    } else {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: f.mime as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
          data: f.bytes.toString("base64"),
        },
      });
    }
  }
  content.push({
    type: "text",
    text: `Du hilfst einer Personalagentur, aus Unterlagen (Lebenslauf, Ausweis, Screenshots) und Notizen ein Personalprofil zu erstellen.
${freetext ? `Zusätzliche Notizen:\n${freetext}\n` : ""}
Extrahiere alle verfügbaren Personendaten. Antworte NUR mit JSON:
{"firstName":"...","lastName":"...","age":Zahl oder null,"birthYear":Zahl oder null,"city":"Wohnort oder null","region":"Bundesland/Region oder null","phone":"oder null","email":"oder null","languages":"z. B. 'Deutsch (Muttersprache) · Englisch (B1)' oder null","mobility":"z. B. 'Führerschein Kl. B · eigener Pkw' oder null","experiences":[{"period":"01/2020 – 06/2024","title":"Jobtitel","company":"Firma/Ort","details":"1-2 Stichpunkte oder leer"}],"qualifications":["kurze Punkte"],"skills":["kurze Schlagworte"],"profileText":"2-3 Sätze Zusammenfassung der Person oder null"}
Regeln: Nichts erfinden – was fehlt, ist null bzw. leere Liste. Erfahrungen chronologisch absteigend. Deutsch.`,
  });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      messages: [{ role: "user", content }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return { data: null, error: "Leere Antwort" };
    const data = parseJsonLoose<ExtractedPerson>(textBlock.text);
    if (!data) return { data: null, error: "Antwort nicht lesbar" };
    return {
      data: {
        ...data,
        experiences: Array.isArray(data.experiences) ? data.experiences : [],
        qualifications: Array.isArray(data.qualifications) ? data.qualifications : [],
        skills: Array.isArray(data.skills) ? data.skills : [],
      },
    };
  } catch (err) {
    const msg = err instanceof Anthropic.APIError ? `API ${err.status}` : "Auslesen fehlgeschlagen";
    return { data: null, error: msg };
  }
}

// Karteninhalt auf Firma + Einsatzbereich zuschneiden (mit Fallback ohne KI)
export async function tailorSetcard(
  person: PersonBase,
  theme: SetcardTheme,
  einsatzbereich: string,
  profileNo: string,
  hinweise: string | null
): Promise<{ data: SetcardData; aiUsed: boolean }> {
  const fallback = buildFallbackData(person, theme, einsatzbereich, profileNo);
  if (!isSetcardAiAvailable()) return { data: fallback, aiUsed: false };

  const client = new Anthropic();
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      messages: [
        {
          role: "user",
          content: `Du erstellst eine Personal-Setcard für die Marke "${theme.brandA}${theme.brandB}" (${theme.tagline}). Einsatzbereich: ${einsatzbereich}.
${hinweise ? `Hinweise des Admins: ${hinweise}\n` : ""}
Personendaten (JSON): ${JSON.stringify({
            name: `${person.firstName} ${person.lastName}`,
            age: person.age,
            city: person.city,
            region: person.region,
            languages: person.languages,
            mobility: person.mobility,
            experiences: person.experiences,
            qualifications: person.qualifications,
            skills: person.skills,
            profileText: person.profileText,
          })}

Erzeuge den Karteninhalt, zugeschnitten auf den Einsatzbereich (relevante Erfahrungen zuerst, passende Formulierungen, Ton der Marke: ${
            theme.key === "EC" ? "locker, packend, Crew-Sprache" : theme.key === "EQ" ? "professionell, businessnah" : theme.key === "FJ" ? "freundlich, energiegeladen" : "sachlich, kompetent"
          }). Antworte NUR mit JSON:
{"role":"Kurzbezeichnung · Kontext (z. B. 'Staplerfahrer · Lager & Logistik')","badges":[{"label":"Alter","value":"24 Jahre"},{"label":"Verfügbar","value":"ab sofort"}],"tiles":[{"label":"Wohnort","value":"...","sub":"..."},{"label":"Sprachen oder Erfahrung","value":"...","sub":"..."},{"label":"Mobilität","value":"...","sub":"..."}],"profileText":"2-4 Sätze, überzeugend, keine Erfindungen","einsatzText":"1-2 Sätze Einsatzschwerpunkt","experiences":[{"period":"...","title":"...","company":"...","details":"..."}],"qualifications":["max 5 Punkte"],"skills":["max 6 kurze Chips"],"strengths":["max 4 Stärken"]}
Regeln: Nur vorhandene Fakten verwenden, nichts dazu erfinden. Höchstens 4 experiences. Deutsch.`,
        },
      ],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return { data: fallback, aiUsed: false };
    const ai = parseJsonLoose<Partial<SetcardData>>(textBlock.text);
    if (!ai) return { data: fallback, aiUsed: false };
    return {
      data: {
        ...fallback,
        ...ai,
        name: fallback.name,
        profileNo,
        badges: Array.isArray(ai.badges) && ai.badges.length > 0 ? ai.badges : fallback.badges,
        tiles: Array.isArray(ai.tiles) && ai.tiles.length === 3 ? ai.tiles : fallback.tiles,
        experiences: Array.isArray(ai.experiences) ? ai.experiences : fallback.experiences,
        qualifications: Array.isArray(ai.qualifications) ? ai.qualifications : fallback.qualifications,
        skills: Array.isArray(ai.skills) ? ai.skills : fallback.skills,
        strengths: Array.isArray(ai.strengths) ? ai.strengths : fallback.strengths,
        footerContact: fallback.footerContact,
        footerSub: fallback.footerSub,
      },
      aiUsed: true,
    };
  } catch {
    return { data: fallback, aiUsed: false };
  }
}
