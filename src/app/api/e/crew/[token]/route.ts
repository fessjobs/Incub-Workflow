// Gruppenlink: ein Link für den ganzen Einsatz – oder, mit dem Token einer
// Schicht, nur für diese eine Schicht. Jede Person wählt sich in der Liste,
// prüft ihre Zeiten und unterschreibt – auf dem eigenen Handy oder alle
// nacheinander auf einem Crew-Gerät; am Ende unterschreibt der Kunde.
// Über denselben Token korrigiert die Crew falsch geschriebene Namen und
// ergänzt Personen, solange noch nichts unterschrieben bzw. bestätigt ist.
//
// Beim Schichtlink ist „nurSchichtId" die Grenze: sichtbar ist nur diese
// Schicht, und jede Schreibaktion muss zu ihr gehören.
import { NextResponse } from "next/server";
import { checkRateLimit, clientIp, registerTokenMiss, tooManyTokenMisses } from "@/lib/einsatz/rate-limit";
import { CrewNameSchema, CrewPersonSchema, CrewSubmitSchema, CrewZeitenSchema, CustomerSignSchema } from "@/lib/einsatz/schemas";
import { entryView } from "@/lib/einsatz/service/public-view";
import { customerSign, loadCrewByToken, submitTimeEntry, TimeEntryError } from "@/lib/einsatz/service/time-entries";
import { ergaenzePerson, korrigiereName, RosterError } from "@/lib/einsatz/service/crew-roster";
import { uebernimmZeitenFuerAlle, zeitvorgabeVon } from "@/lib/einsatz/service/besetzung";
import { SAFETY_SECTIONS, SAFETY_VERSION, CONFIRMATION_TEXT } from "@/lib/einsatz/safety";
import { berlinDateKey, berlinTime, dateOnlyKey, formatKeyDE } from "@/lib/einsatz/tz";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type CrewKontext = NonNullable<Awaited<ReturnType<typeof loadCrewByToken>>>;

function crewView(ctx: CrewKontext) {
  const { a, nurSchichtId } = ctx;
  const expired = ctx.abgelaufen;
  // Bestätigung für den ganzen Einsatz (ohne shiftId) und je Schicht
  const gesamt = a.confirmations.find((c) => c.shiftId === null) ?? null;
  const jeSchicht = a.confirmations.some((c) => c.shiftId !== null);
  // Einen Sammel-Nachweis gibt es nur, solange keine Schicht einzeln
  // bestätigt ist – sonst wären zwei Stände des gleichen Papiers unterwegs.
  const gesamtMoeglich = !expired && !jeSchicht && ctx.schichtenGesamt === a.shifts.length;
  // Namen korrigieren und Personen ergänzen: die Unterschrift des Kunden für
  // den ganzen Einsatz schließt alles, eine je Schicht nur diese Schicht.
  const korrigierbarGrundsaetzlich = !expired && gesamt === null && a.status !== "ABGESCHLOSSEN" && a.status !== "ABGERECHNET";
  return {
    state: expired ? "abgelaufen" : "offen",
    nurSchicht: nurSchichtId === null ? null : a.shifts[0]?.bezeichnung ?? null,
    // Sammelbestätigung über alle Schichten (nur im Einsatzlink)
    kundeMoeglich: gesamtMoeglich,
    einsatz: {
      einsatznummer: a.einsatznummer,
      projekt: a.projekt,
      artist: a.artist,
      kunde: a.customer.name,
      einsatzort: a.einsatzort,
      datum: formatKeyDE(dateOnlyKey(a.datumVon)) + (dateOnlyKey(a.datumVon) !== dateOnlyKey(a.datumBis) ? ` – ${formatKeyDE(dateOnlyKey(a.datumBis))}` : ""),
    },
    schichten: a.shifts.map((s) => {
      const bestaetigt = a.confirmations.find((c) => c.shiftId === s.id) ?? null;
      return {
      id: s.id,
      bezeichnung: s.bezeichnung,
      taetigkeit: s.taetigkeit,
      datumDE: formatKeyDE(berlinDateKey(s.planStart)),
      // Bestätigung des Kunden für genau diese Schicht
      kunde: bestaetigt ? { name: bestaetigt.kundeName, zeitpunkt: bestaetigt.zeitpunkt.toISOString() } : null,
      // Der Kunde kann jede Schicht abzeichnen, solange sie nicht schon
      // abgezeichnet ist – auch bei einem längst abgeschlossenen Einsatz und
      // auch dann noch, wenn er den Einsatz als Ganzes schon bestätigt hat
      // (dann kommt der Nachweis dieser Schicht eben dazu).
      // Bei nur einer Schicht deckt die Bestätigung für den Einsatz denselben
      // Fall ab – dann kein zweiter Knopf für dasselbe.
      kundeMoeglich: !expired && bestaetigt === null && ctx.schichtenGesamt > 1,
      alleErfasst: s.assignments.filter((sa) => sa.status !== "STORNIERT").every((sa) => sa.timeEntries.some((t) => t.unterschriftZeitpunkt)),
      // Eine vom Kunden abgezeichnete Schicht ist zu; die übrigen nicht.
      korrigierbar: korrigierbarGrundsaetzlich && bestaetigt === null,
      // Von einer Person für die ganze Schicht übernommene Ist-Zeiten
      vorgabe: zeitvorgabeVon(s),
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
            nameAenderbar: !entry?.unterschriftZeitpunkt,
            eintrag: entry ? entryView({ ...entry, trips: [] }) : null,
          };
        }),
      };
    }),
    kunde: gesamt ? { name: gesamt.kundeName, zeitpunkt: gesamt.zeitpunkt.toISOString() } : null,
    // Nach der Kundenbestätigung steht die Besetzung auf dem unterschriebenen
    // Beleg – ab dann korrigiert nur noch die Dispo.
    korrigierbar: korrigierbarGrundsaetzlich,
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
  const ctx = await loadCrewByToken(token);
  if (!ctx) {
    registerTokenMiss(ip);
    return NextResponse.json({ error: "Link ungültig." }, { status: 404 });
  }
  return NextResponse.json(crewView(ctx), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { ip, res } = guard(req, "crew-post", 30);
  if (res) return res;
  const { token } = await params;
  const ctx = await loadCrewByToken(token);
  if (!ctx) {
    registerTokenMiss(ip);
    return NextResponse.json({ error: "Link ungültig." }, { status: 404 });
  }
  const { a, nurSchichtId } = ctx;
  if (ctx.abgelaufen) {
    return NextResponse.json({ error: "Der Crew-Link ist abgelaufen." }, { status: 409 });
  }
  // Beim Schichtlink reicht der Einsatz als Grenze nicht – es muss diese
  // Schicht sein. Dieselbe Bedingung für alle Schreibaktionen.
  const gehoertDazu = (where: { id: string } | { shiftId: string }) =>
    db.shiftAssignment.findFirst({
      where: { ...where, ...(nurSchichtId ? { shiftId: nurSchichtId } : { shift: { assignmentId: a.id } }) },
      select: { id: true },
    });
  const fremd = NextResponse.json({ error: nurSchichtId ? "Person gehört nicht zu dieser Schicht." : "Person gehört nicht zu diesem Einsatz." }, { status: 403 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Daten." }, { status: 400 });
  }
  const userAgent = req.headers.get("user-agent");
  const meta = { ip, userAgent, geraet: "Crew-Gerät" };
  try {
    const name = CrewNameSchema.safeParse(body);
    const person = CrewPersonSchema.safeParse(body);
    const zeiten = CrewZeitenSchema.safeParse(body);
    const kunde = CustomerSignSchema.safeParse(body);
    if (name.success) {
      if (!(await gehoertDazu({ id: name.data.shiftAssignmentId }))) return fremd;
      await korrigiereName(a.id, name.data.shiftAssignmentId, name.data, { ip, userAgent });
    } else if (person.success) {
      if (nurSchichtId && person.data.shiftId !== nurSchichtId) return NextResponse.json({ error: "Diese Schicht gehört nicht zum Link." }, { status: 403 });
      await ergaenzePerson(a.id, person.data.shiftId, person.data, { ip, userAgent });
    } else if (zeiten.success) {
      const gehoert = await gehoertDazu({ id: zeiten.data.shiftAssignmentId });
      if (!gehoert) return fremd;
      await uebernimmZeitenFuerAlle(a.organizationId, gehoert.id, { userId: null, ip, quelle: "crew-link" });
    } else if (kunde.success) {
      const fuerSchicht = kunde.data.shiftId;
      if (fuerSchicht && !a.shifts.some((s) => s.id === fuerSchicht)) {
        return NextResponse.json({ error: "Diese Schicht gehört nicht zum Link." }, { status: 403 });
      }
      // Ohne Schicht bestätigt der Kunde den ganzen Einsatz – das geht nur
      // über den Einsatzlink und nur, solange keine Schicht einzeln
      // bestätigt ist.
      if (!fuerSchicht) {
        if (nurSchichtId && ctx.schichtenGesamt !== 1) {
          return NextResponse.json({ error: "Über diesen Link bestätigt der Kunde die Schicht; für den ganzen Einsatz den Einsatzlink nutzen." }, { status: 409 });
        }
        if (a.confirmations.some((c) => c.shiftId !== null)) {
          return NextResponse.json({ error: "Dieser Einsatz wird je Schicht bestätigt." }, { status: 409 });
        }
      }
      await customerSign(a.id, kunde.data, meta, fuerSchicht);
    } else if (typeof (body as { aktion?: unknown })?.aktion === "string") {
      // Die Aktion war gemeint, die Angaben stimmen nicht – die Meldung des
      // passenden Schemas ist hilfreicher als ein pauschales "ungültig".
      const aktion = (body as { aktion: string }).aktion;
      const fehler = aktion === "person-ergaenzen" ? person : aktion === "zeiten-fuer-alle" ? zeiten : name;
      return NextResponse.json({ error: fehler.success ? "Ungültige Daten." : fehler.error.errors[0].message }, { status: 400 });
    } else {
      const eintrag = CrewSubmitSchema.safeParse(body);
      if (!eintrag.success) return NextResponse.json({ error: eintrag.error.errors[0].message }, { status: 400 });
      const belongs = await gehoertDazu({ id: eintrag.data.shiftAssignmentId });
      if (!belongs) return fremd;
      await submitTimeEntry(belongs.id, eintrag.data.eintrag, meta, "CREW");
    }
    const fresh = await loadCrewByToken(token);
    return NextResponse.json({ ok: true, view: fresh ? crewView(fresh) : null });
  } catch (err) {
    if (err instanceof TimeEntryError || err instanceof RosterError) return NextResponse.json({ error: err.message }, { status: err.status });
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("Crew-Erfassung fehlgeschlagen:", message);
    return NextResponse.json({ error: `Speichern fehlgeschlagen: ${message}` }, { status: 500 });
  }
}
