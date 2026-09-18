// Crew-Link für den Ansprechpartner vor Ort: alle Personen des Einsatzes
// unterschreiben nacheinander auf einem Gerät, am Ende der Kunde.
import { NextResponse } from "next/server";
import { checkRateLimit, clientIp, registerTokenMiss, tooManyTokenMisses } from "@/lib/einsatz/rate-limit";
import { CrewSubmitSchema, CustomerSignSchema } from "@/lib/einsatz/schemas";
import { entryView } from "@/lib/einsatz/service/public-view";
import { customerSign, loadCrewByToken, submitTimeEntry, TimeEntryError } from "@/lib/einsatz/service/time-entries";
import { SAFETY_SECTIONS, SAFETY_VERSION, CONFIRMATION_TEXT } from "@/lib/einsatz/safety";
import { berlinDateKey, berlinTime, dateOnlyKey, formatKeyDE } from "@/lib/einsatz/tz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type CrewLoaded = NonNullable<Awaited<ReturnType<typeof loadCrewByToken>>>;

function crewView(a: CrewLoaded) {
  const expired = Boolean(a.crewTokenExpiresAt && a.crewTokenExpiresAt < new Date());
  return {
    state: expired ? "abgelaufen" : "offen",
    einsatz: {
      einsatznummer: a.einsatznummer,
      projekt: a.projekt,
      artist: a.artist,
      kunde: a.customer.name,
      einsatzort: a.einsatzort,
      datum: formatKeyDE(dateOnlyKey(a.datumVon)) + (dateOnlyKey(a.datumVon) !== dateOnlyKey(a.datumBis) ? ` – ${formatKeyDE(dateOnlyKey(a.datumBis))}` : ""),
    },
    schichten: a.shifts.map((s) => ({
      id: s.id,
      bezeichnung: s.bezeichnung,
      taetigkeit: s.taetigkeit,
      datumDE: formatKeyDE(berlinDateKey(s.planStart)),
      personen: s.assignments
        .filter((sa) => sa.status !== "STORNIERT")
        .map((sa) => {
          const entry = sa.timeEntries.find((t) => t.aktuell) ?? null;
          return {
            shiftAssignmentId: sa.id,
            name: `${sa.employee.vorname} ${sa.employee.nachname}`,
            vorname: sa.employee.vorname,
            startDatum: berlinDateKey(sa.planStart),
            start: berlinTime(sa.planStart),
            endeDatum: berlinDateKey(sa.planEnde),
            ende: berlinTime(sa.planEnde),
            erfasst: Boolean(entry?.unterschriftZeitpunkt),
            eintrag: entry ? entryView({ ...entry, trips: [] }) : null,
          };
        }),
    })),
    kunde: a.confirmations[0] ? { name: a.confirmations[0].kundeName, zeitpunkt: a.confirmations[0].zeitpunkt.toISOString() } : null,
    unterweisung: { version: SAFETY_VERSION, abschnitte: SAFETY_SECTIONS, bestaetigung: CONFIRMATION_TEXT },
  };
}

function guard(req: Request, bucket: string, limit: number) {
  const ip = clientIp(req);
  if (tooManyTokenMisses(ip)) return { ip, res: NextResponse.json({ error: "Zu viele Fehlversuche." }, { status: 429 }) };
  const rl = checkRateLimit(`${bucket}:${ip}`, limit, 60_000);
  if (!rl.ok) return { ip, res: NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }) };
  return { ip, res: null };
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { ip, res } = guard(req, "crew-get", 60);
  if (res) return res;
  const { token } = await params;
  const a = await loadCrewByToken(token);
  if (!a) {
    registerTokenMiss(ip);
    return NextResponse.json({ error: "Link ungültig." }, { status: 404 });
  }
  return NextResponse.json(crewView(a), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { ip, res } = guard(req, "crew-post", 30);
  if (res) return res;
  const { token } = await params;
  const a = await loadCrewByToken(token);
  if (!a) {
    registerTokenMiss(ip);
    return NextResponse.json({ error: "Link ungültig." }, { status: 404 });
  }
  if (a.crewTokenExpiresAt && a.crewTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Der Crew-Link ist abgelaufen." }, { status: 409 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Daten." }, { status: 400 });
  }
  const meta = { ip, userAgent: req.headers.get("user-agent"), geraet: "Crew-Gerät" };
  try {
    const kunde = CustomerSignSchema.safeParse(body);
    if (kunde.success) {
      await customerSign(a.id, kunde.data, meta);
    } else {
      const person = CrewSubmitSchema.safeParse(body);
      if (!person.success) return NextResponse.json({ error: person.error.errors[0].message }, { status: 400 });
      // Zuordnung muss zu diesem Einsatz gehören
      const belongs = await db.shiftAssignment.findFirst({ where: { id: person.data.shiftAssignmentId, shift: { assignmentId: a.id } }, select: { id: true } });
      if (!belongs) return NextResponse.json({ error: "Person gehört nicht zu diesem Einsatz." }, { status: 403 });
      await submitTimeEntry(belongs.id, person.data.eintrag, meta, "CREW");
    }
    const fresh = await loadCrewByToken(token);
    return NextResponse.json({ ok: true, view: fresh ? crewView(fresh) : null });
  } catch (err) {
    if (err instanceof TimeEntryError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("Crew-Erfassung fehlgeschlagen:", message);
    return NextResponse.json({ error: `Speichern fehlgeschlagen: ${message}` }, { status: 500 });
  }
}
