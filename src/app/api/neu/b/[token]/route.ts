import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { checkRateLimit } from "@/lib/einsatz/rate-limit";
import { belegLinkPruefen, erkenneDatei, MAX_BELEG_BYTES } from "@/lib/neu/beleg";
import { leseRecord, listeRecords, setzeRecord } from "@/lib/neu/store";
import { dateiHash, neuesToken } from "@/lib/neu/token";
import { extractReceipt, isExtractionAvailable } from "@/lib/claude";
import { BELEG_BEZEICHNUNG, BELEGARTEN, BEIBLATT_VORLAGEN, beiblattText, belegAbweichungen } from "@/preview/logic/beleg";
import { formatDatumDE } from "@/preview/logic/zeit";
import type { Crew, Job } from "@/preview/logic/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ip = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unbekannt";

// Auftragsdaten für die Seite: nur, was die Crew zum Einreichen braucht
export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!checkRateLimit(`neu-b-get:${ip(req)}`, 60, 10 * 60_000).ok) return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  const { token } = await ctx.params;
  const z = await belegLinkPruefen(token.slice(0, 80));
  if (!z) return NextResponse.json({ error: "Link abgelaufen oder ungültig." }, { status: 404 });
  const job = await leseRecord<Job>(z.organizationId, "job", z.jobId);
  if (!job) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });
  return NextResponse.json({ job: { id: job.data.id, titel: job.data.titel, kunde: job.data.kunde, ort: job.data.ort } });
}

const felder = z.object({
  art: z.enum(BELEGARTEN),
  betrag: z.string().max(20),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  haendler: z.string().max(200),
  zweck: z.string().max(300),
  pnr: z.string().min(1).max(40),
});

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!checkRateLimit(`neu-b-post:${ip(req)}`, 20, 10 * 60_000).ok) return NextResponse.json({ error: "Zu viele Anfragen. Bitte später erneut." }, { status: 429 });
  const { token } = await ctx.params;
  const z = await belegLinkPruefen(token.slice(0, 80));
  if (!z) return NextResponse.json({ error: "Link abgelaufen oder ungültig." }, { status: 404 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const f = felder.safeParse({ art: form.get("art"), betrag: String(form.get("betrag") ?? ""), datum: form.get("datum"), haendler: String(form.get("haendler") ?? ""), zweck: String(form.get("zweck") ?? ""), pnr: String(form.get("pnr") ?? "").trim().toUpperCase() });
  if (!f.success) return NextResponse.json({ error: "Bitte alle Felder ausfüllen." }, { status: 400 });
  const betrag = Number(f.data.betrag.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(betrag) || betrag <= 0 || betrag > 100000) return NextResponse.json({ error: "Bitte einen gültigen Betrag eintragen (zum Beispiel 27,90)." }, { status: 400 });
  const datei = form.get("datei");
  if (!(datei instanceof File) || datei.size === 0) return NextResponse.json({ error: "Bitte ein Foto oder eine PDF des Belegs auswählen." }, { status: 400 });
  if (datei.size > MAX_BELEG_BYTES) return NextResponse.json({ error: "Die Datei ist größer als 10 MB." }, { status: 400 });
  const bytes = new Uint8Array(await datei.arrayBuffer());
  const mime = erkenneDatei(bytes);
  if (!mime) return NextResponse.json({ error: "Dieses Dateiformat kennen wir nicht. Bitte ein Foto (JPG, PNG, HEIC) oder eine PDF." }, { status: 400 });

  const personen = await listeRecords<Crew>(z.organizationId, "crew");
  const person = personen.find((p) => p.data.pnr.toUpperCase() === f.data.pnr);
  if (!person) return NextResponse.json({ error: "Diese Personalnummer kennen wir nicht." }, { status: 400 });
  const job = await leseRecord<Job>(z.organizationId, "job", z.jobId);
  if (!job) return NextResponse.json({ error: "Auftrag nicht gefunden." }, { status: 404 });

  // Auslesen, wenn ein Schlüssel hinterlegt ist; sonst bleibt es bei der Eingabe
  let gelesen = { betrag, datum: f.data.datum, haendler: f.data.haendler };
  let ausgelesen = false;
  if (isExtractionAvailable() && mime !== "image/heic") {
    try {
      const r = await extractReceipt(Buffer.from(bytes), mime, []);
      if (!r.error && r.grossAmount !== null) {
        gelesen = { betrag: r.grossAmount, datum: r.receiptDate ?? f.data.datum, haendler: r.vendor ?? f.data.haendler };
        ausgelesen = true;
      }
    } catch {
      /* Auslesen ist nur ein Hinweis – die Einreichung gilt trotzdem */
    }
  }
  const abweichungen = ausgelesen ? belegAbweichungen({ betrag, datum: f.data.datum, haendler: f.data.haendler }, gelesen) : [];

  const fileId = neuesToken().slice(0, 24);
  const name = (datei.name || "beleg").replace(/[^\w.\- äöüÄÖÜß]/g, "_").slice(0, 120);
  await db.v2File.create({ data: { id: fileId, organizationId: z.organizationId, kind: "beleg", name, mime, size: bytes.length, sha256: dateiHash(bytes), data: Buffer.from(bytes), meta: { jobId: z.jobId, pnr: person.data.pnr } } });
  const id = `bel-${fileId}`;
  const beiblatt = beiblattText(BEIBLATT_VORLAGEN[f.data.art], { auftrag_id: job.data.id, kunde: job.data.kunde, ort: job.data.ort, datum: formatDatumDE(f.data.datum), mitarbeiter: `${person.data.vorname} ${person.data.nachname}`, zweck: f.data.zweck });
  await setzeRecord(z.organizationId, "beleg", id, { id, zeit: new Date().toISOString(), pnr: person.data.pnr, art: f.data.art, betrag, datum: f.data.datum, haendler: f.data.haendler, zweck: f.data.zweck, auftragId: job.data.id, dateiname: name, dateiId: fileId, gelesen, ausgelesen, abweichungen, beiblatt }, `Beleg-Link ${person.data.pnr}`);
  return NextResponse.json({ ok: true, titel: BELEG_BEZEICHNUNG[f.data.art], betrag, ausgelesen, abweichungen });
}
