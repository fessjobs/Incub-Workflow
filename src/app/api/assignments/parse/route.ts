// POST /api/assignments/parse – Rohtext → strukturierter Einsatz (Claude,
// sonst Heuristik) + Namens-Matching gegen den Mitarbeiterstamm +
// Arbeitszeit-Konflikte gegen alle Einsätze. Nur für Dispo-Rollen.
import { NextResponse } from "next/server";
import { apiUser, canDispo } from "@/lib/einsatz/access";
import { checkConflicts, type PlannedSlot } from "@/lib/einsatz/conflicts";
import { matchNames } from "@/lib/einsatz/matching";
import { parseRawText, suggestEnd } from "@/lib/einsatz/parser";
import { ParseRequestSchema } from "@/lib/einsatz/schemas";
import { fromBerlin, isValidDateKey, isValidTime } from "@/lib/einsatz/tz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { user, status } = await apiUser(canDispo);
  if (!user) return NextResponse.json({ error: status === 401 ? "Nicht angemeldet." : "Keine Berechtigung." }, { status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }
  const parsedBody = ParseRequestSchema.safeParse(body);
  if (!parsedBody.success) return NextResponse.json({ error: parsedBody.error.errors[0].message }, { status: 400 });

  try {
    const outcome = await parseRawText(parsedBody.data.rawText);
    const parsed = outcome.parsed;

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
      hinweise: parsed.hinweise,
      konflikte,
      parsedJson: parsed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("Parse-Route:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
