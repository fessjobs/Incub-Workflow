// Crew-Seite des neuen Systems: Sitzung per Cookie, was die Crew sehen und tun
// darf. Die Crew sieht nur sich selbst, veröffentlichte Aufträge und die eigenen
// Bewerbungen – nie Kategorie, Score, interne Notizen oder andere Personen.
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { inTagen, neuesToken, tokenHash } from "./token";
import { leseRecord, listeRecords, loescheRecord, setzeRecord } from "./store";
import type { Application, Crew, Job } from "@/preview/logic/types";
import { antwortenZuProfil, handyGueltig, offenePflicht, plzGueltig, situationVollstaendig, type Antworten } from "@/preview/logic/profil";
import { geocodePlz, naechsterPool } from "@/preview/logic/geo";
import { fehlendeModule, pflichtModule, quizBestanden } from "@/preview/logic/unterweisung";
import { AKTUELLE_VERSION, modulById } from "@/preview/data/trainings";
import { heuteBerlin } from "@/preview/logic/zeit";
import { ETAPPEN } from "@/preview/logic/fragen";

export const CREW_COOKIE = "neu_crew";
const SESSION_TAGE = 90;

export interface CrewZugang {
  organizationId: string;
  crewId: string;
}

export type CrewRecord = Crew & { fragebogenEntwurf?: { antworten: Record<string, unknown>; etappe: number } | null; fragebogenAbgeschicktAm?: string | null };

export async function crewSitzung(): Promise<CrewZugang | null> {
  const roh = (await cookies()).get(CREW_COOKIE)?.value;
  if (!roh) return null;
  const a = await db.v2Access.findUnique({ where: { tokenHash: tokenHash(roh) } });
  if (!a || a.kind !== "crew-session" || a.expiresAt < new Date()) return null;
  return { organizationId: a.organizationId, crewId: a.refId };
}

// Löst einen Einladungslink ein und legt die Sitzung an. Gibt das Sitzungs-Token zurück.
export async function loeseEinladungEin(token: string): Promise<{ sitzung: string; ablauf: Date } | null> {
  const a = await db.v2Access.findUnique({ where: { tokenHash: tokenHash(token) } });
  if (!a || a.kind !== "einladung" || a.expiresAt < new Date() || (a.maxUses !== null && a.uses >= a.maxUses)) return null;
  const crew = await leseRecord(a.organizationId, "crew", a.refId);
  if (!crew) return null;
  await db.v2Access.update({ where: { tokenHash: a.tokenHash }, data: { uses: { increment: 1 }, lastUsedAt: new Date() } });
  const sitzung = neuesToken();
  const ablauf = inTagen(SESSION_TAGE);
  await db.v2Access.create({ data: { tokenHash: tokenHash(sitzung), organizationId: a.organizationId, kind: "crew-session", refId: a.refId, expiresAt: ablauf } });
  return { sitzung, ablauf };
}

function fuerCrew(c: CrewRecord): Crew {
  // Intern bleibt intern: Notizen und Bewertungen verlassen den Server nicht
  const { fragebogenEntwurf: _e, fragebogenAbgeschicktAm: _a, ...rest } = c;
  void _e;
  void _a;
  return { ...rest, notizen: "", ratings: [] };
}

export async function crewState(z: CrewZugang) {
  const self = await leseRecord<CrewRecord>(z.organizationId, "crew", z.crewId);
  if (!self) return null;
  const jobs = (await listeRecords<Job>(z.organizationId, "job")).map((j) => j.data).filter((j) => j.status === "offen" || j.status === "voll");
  const meine = (await listeRecords<Application>(z.organizationId, "bewerbung")).map((b) => b.data).filter((b) => b.pnr === self.data.pnr);
  const bestaetigt = new Set(meine.filter((b) => b.status === "bestätigt").map((b) => b.jobId));
  // Treffpunkt und Ansprechpartner erst nach der Bestätigung
  const jobsFuerCrew = jobs.map((j) => (bestaetigt.has(j.id) ? j : { ...j, treffpunkt: "", ansprechpartner: "" }));
  const einst = await leseRecord<{ xp?: unknown }>(z.organizationId, "einst", "main");
  return {
    self: fuerCrew(self.data),
    entwurf: self.data.fragebogenEntwurf ?? null,
    fragebogenFertig: Boolean(self.data.fragebogenAbgeschicktAm),
    jobs: jobsFuerCrew,
    bewerbungen: meine,
    xp: einst?.data.xp ?? null,
    heute: heuteBerlin(),
  };
}

export type CrewAktion =
  | { typ: "entwurf"; antworten: Record<string, unknown>; etappe: number }
  | { typ: "abschicken" }
  | { typ: "unterweisung"; modul: string; richtig: number; gesamt: number }
  | { typ: "bewerbung"; jobId: string; schichtIds: string[]; eigeneAnreise: boolean; hatVertrag: boolean; abfahrtsort: string; plaetze: number; kommentar: string };

export type AktionsErgebnis = { ok: true } | { ok: false; status: number; error: string };

const fehler = (status: number, error: string): AktionsErgebnis => ({ ok: false, status, error });

export async function crewAktion(z: CrewZugang, a: CrewAktion): Promise<AktionsErgebnis> {
  const rec = await leseRecord<CrewRecord>(z.organizationId, "crew", z.crewId);
  if (!rec) return fehler(404, "Person nicht gefunden.");
  const c = rec.data;
  const speichern = (neu: CrewRecord) => setzeRecord(z.organizationId, "crew", z.crewId, neu, `Crew ${c.pnr}`);

  if (a.typ === "entwurf") {
    if (JSON.stringify(a.antworten).length > 30_000) return fehler(400, "Zu viele Daten.");
    if (!Number.isInteger(a.etappe) || a.etappe < 1 || a.etappe > ETAPPEN.length + 1) return fehler(400, "Ungültige Etappe.");
    await speichern({ ...c, fragebogenEntwurf: { antworten: a.antworten, etappe: a.etappe } });
    return { ok: true };
  }

  if (a.typ === "abschicken") {
    const antworten = c.fragebogenEntwurf?.antworten as unknown as Antworten | undefined;
    if (!antworten) return fehler(400, "Noch keine Antworten gespeichert.");
    for (let n = 1; n <= ETAPPEN.length; n++) if (offenePflicht(antworten, n).length > 0) return fehler(400, `Etappe ${n}: Pflichtfragen offen.`);
    if (!plzGueltig(antworten.plz) || !handyGueltig(antworten.handy)) return fehler(400, "PLZ oder Handynummer ungültig.");
    if (antworten.volljaehrig !== true) return fehler(400, "Für Einsätze musst du volljährig sein.");
    if (!situationVollstaendig(antworten)) return fehler(400, "Bitte alle vier Fragen beantworten.");
    const ort = geocodePlz(antworten.plz);
    const pool = ort ? naechsterPool(ort).pool : c.pool;
    await speichern({
      ...c, vorname: antworten.vorname, nachname: antworten.nachname, telefon: antworten.handy, email: antworten.email, plz: antworten.plz, wohnort: antworten.wohnort, pool,
      profile: antwortenZuProfil(antworten), fragebogenAbgeschicktAm: new Date().toISOString(),
    });
    return { ok: true };
  }

  if (a.typ === "unterweisung") {
    const mod = modulById(a.modul);
    if (!mod) return fehler(400, "Modul unbekannt.");
    if (a.gesamt !== mod.quiz.length || a.richtig < 0 || a.richtig > a.gesamt) return fehler(400, "Ungültiges Ergebnis.");
    if (!quizBestanden(a.richtig, a.gesamt)) return fehler(400, "Quiz nicht bestanden.");
    await speichern({ ...c, unterweisungen: { ...c.unterweisungen, [mod.id]: { version: AKTUELLE_VERSION, bestaetigtAm: heuteBerlin(), quizScore: a.richtig / a.gesamt } } });
    return { ok: true };
  }

  if (a.typ === "bewerbung") {
    if (!c.fragebogenAbgeschicktAm || !c.profile) return fehler(409, "Erst den Fragebogen abschicken.");
    const job = await leseRecord<Job>(z.organizationId, "job", a.jobId);
    if (!job || job.data.status !== "offen") return fehler(404, "Job nicht verfügbar.");
    if (a.schichtIds.length === 0 || !a.schichtIds.every((id) => job.data.schichten.some((s) => s.id === id))) return fehler(400, "Schichten passen nicht zum Job.");
    const vorhanden = (await listeRecords<Application>(z.organizationId, "bewerbung")).some((b) => b.data.jobId === a.jobId && b.data.pnr === c.pnr);
    if (vorhanden) return fehler(409, "Du hast dich schon beworben.");
    const gewaehlt = job.data.schichten.filter((s) => a.schichtIds.includes(s.id));
    const pflicht = pflichtModule(gewaehlt.map((s) => s.taetigkeit), { hoehe: job.data.hoehe });
    if (fehlendeModule(pflicht, c.unterweisungen, heuteBerlin()).length > 0) return fehler(409, "Pflicht-Unterweisung fehlt oder ist abgelaufen.");
    const bew: Application = {
      id: `a-${z.crewId}-${a.jobId}`.slice(0, 80), jobId: a.jobId, pnr: c.pnr, schichtIds: a.schichtIds, eigeneAnreise: a.eigeneAnreise, abfahrtsort: a.abfahrtsort.slice(0, 200),
      fahrgemeinschaftPlaetze: Math.max(0, Math.min(20, Math.floor(a.plaetze))), hatVertrag: a.hatVertrag, status: "neu", notizIntern: "", kommentar: a.kommentar.slice(0, 1000), eingegangen: heuteBerlin(),
    };
    await setzeRecord(z.organizationId, "bewerbung", bew.id, bew, `Crew ${c.pnr}`);
    return { ok: true };
  }
  return fehler(400, "Unbekannte Aktion.");
}

// DSGVO: die Person löscht ihre Daten im neuen System selbst
export async function crewLoeschen(z: CrewZugang): Promise<void> {
  const rec = await leseRecord<CrewRecord>(z.organizationId, "crew", z.crewId);
  if (rec) {
    for (const b of await listeRecords<Application>(z.organizationId, "bewerbung")) if (b.data.pnr === rec.data.pnr) await loescheRecord(z.organizationId, "bewerbung", b.id);
    for (const zu of await listeRecords<Array<{ pnr: string; begruendung: string | null }>>(z.organizationId, "zuweisung")) {
      if (zu.data.some((x) => x.pnr === rec.data.pnr)) await setzeRecord(z.organizationId, "zuweisung", zu.id, zu.data.filter((x) => x.pnr !== rec.data.pnr), "Löschung durch die Person");
    }
  }
  await loescheRecord(z.organizationId, "crew", z.crewId);
  await db.v2Access.deleteMany({ where: { organizationId: z.organizationId, refId: z.crewId, kind: { in: ["einladung", "crew-session"] } } });
}
