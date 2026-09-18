// POST /api/assignments/parse – Rohtext und/oder Anhänge (Screenshot, Foto,
// PDF, Tabelle) → strukturierter Einsatz (Claude, sonst Heuristik) +
// Namens-Matching gegen den Mitarbeiterstamm + Arbeitszeit-Konflikte gegen
// alle Einsätze. Nur für Dispo-Rollen.
//
// Der Body kommt als JSON (nur Rohtext) oder als multipart/form-data
// (Rohtext + Dateien).
import { NextResponse } from "next/server";
import { apiUser, canDispo } from "@/lib/einsatz/access";
import { leseAnhaenge } from "@/lib/einsatz/anhaenge";
import { checkConflicts, type PlannedSlot } from "@/lib/einsatz/conflicts";
import { matchNames } from "@/lib/einsatz/matching";
import { parseRawText, suggestEnd, type Anhang } from "@/lib/einsatz/parser";
import { ParseRequestSchema } from "@/lib/einsatz/schemas";
import { fromBerlin, isValidDateKey, isValidTime } from "@/lib/einsatz/tz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { user, status } = await apiUser(canDispo);
  if (!user) return NextResponse.json({ error: status === 401 ? "Nicht angemeldet." : "Keine Berechtigung." }, { status });

  let rawText = "";
  let anhaenge: Anhang[] = [];
  let abgelehnt: Array<{ name: string; grund: string }> = [];

  if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
    }
    const dateien = form.getAll("dateien").filter((d): d is File => d instanceof File);
    const gelesen = await leseAnhaenge(dateien);
    anhaenge = gelesen.anhaenge;
    abgelehnt = gelesen.abgelehnt;
    rawText = [String(form.get("rawText") ?? "").trim(), gelesen.zusatzText].filter(Boolean).join("\n\n");
    if (!rawText && anhaenge.length === 0) {
      const grund = abgelehnt.length > 0 ? abgelehnt.map((a) => `${a.name}: ${a.grund}`).join("; ") : "Bitte Rohtext einfügen oder eine Datei anhängen.";
      return NextResponse.json({ error: grund }, { status: 400 });
    }
    if (rawText.length > 20000) rawText = rawText.slice(0, 20000);
  } else {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
    }
    const parsedBody = ParseRequestSchema.safeParse(body);
    if (!parsedBody.success) return NextResponse.json({ error: parsedBody.error.errors[0].message }, { status: 400 });
    rawText = parsedBody.data.rawText;
  }

  try {
    const outcome = await parseRawText(rawText, anhaenge);
    const parsed = outcome.parsed;
    // Nicht verwertbare Dateien gehören in die Hinweisliste, nicht ins Log
    const anhangHinweise = abgelehnt.map((a) => `Anhang „${a.name}“ wurde übergangen: ${a.grund}.`);

    // Namens-Matching (eindeutig je Name)
    const names = [...new Set(parsed.schichten.flatMap((s) => s.personen.map((p) => p.name)))];
    const matches = await matchNames(user.organizationId, names);
    const matchByName = new Map(matches.map((m) => [m.input, m]));

    // Kunde vorschlagen
    let customerId: string | null = null;
    if (parsed.kunde) {
      const c = await db.customer.findFirst({
        where: { organizationId: user.organizationId, aktiv: true, name: { contains: parsed.kunde, mode: "insensitive" } },
        select: { id: true },
      });
      customerId = c?.id ?? null;
    }

    // Vorschau-Schichten mit Endzeit-Vorschlag
    const schichten = parsed.schichten.map((s) => {
      const datum = s.datum && isValidDateKey(s.datum) ? s.datum : parsed.datum && isValidDateKey(parsed.datum) ? parsed.datum : null;
      const start = s.start && isValidTime(s.start) ? s.start : null;
      let endeDatum: string | null = datum;
      let ende: string | null = s.ende && isValidTime(s.ende) ? s.ende : null;
      let endeGeschaetzt = false;
      if (datum && start && !ende) {
        const sug = suggestEnd(datum, start);
        endeDatum = sug.datum;
        ende = sug.ende;
        endeGeschaetzt = true;
      } else if (datum && start && ende && ende <= start) {
        // Ende vor Start → über Mitternacht
        const [y, m, d] = datum.split("-").map(Number);
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        endeDatum = next.toISOString().slice(0, 10);
      }
      return {
        bezeichnung: s.bezeichnung,
        taetigkeit: s.taetigkeit,
        datum,
        start,
        endeDatum,
        ende,
        endeGeschaetzt,
        anzahlSoll: s.anzahlSoll,
        personen: s.personen.map((p) => {
          const m = matchByName.get(p.name);
          return {
            name: p.name,
            rolle: p.rolle.toUpperCase() as "MITARBEITER" | "ANSPRECHPARTNER" | "SPARE",
            employeeId: m?.sicher ? m.best?.employeeId ?? null : null,
            sicher: Boolean(m?.sicher),
            kandidaten: m?.candidates ?? [],
          };
        }),
      };
    });

    // Konflikte für sicher zugeordnete Personen (gegen alle Einsätze)
    const planned: PlannedSlot[] = [];
    for (const s of schichten) {
      if (!s.datum || !s.start || !s.endeDatum || !s.ende) continue;
      const start = fromBerlin(s.datum, s.start);
      const end = fromBerlin(s.endeDatum, s.ende);
      if (end <= start) continue;
      for (const p of s.personen) {
        planned.push({ employeeId: p.employeeId, name: p.name, start, end, label: s.bezeichnung, einsatz: parsed.projekt ?? "neuer Einsatz" });
      }
    }
    const konflikte = await checkConflicts(user.organizationId, planned);

    return NextResponse.json({
      quelle: outcome.quelle,
      fehler: outcome.fehler,
      kunde: parsed.kunde,
      customerId,
      projekt: parsed.projekt,
      artist: parsed.artist,
      einsatzort: parsed.einsatzort,
      datum: parsed.datum,
      schichten,
      hinweise: [...anhangHinweise, ...parsed.hinweise],
      anhaenge: anhaenge.map((a) => a.name),
      konflikte,
      parsedJson: parsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("Parse-Route:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
