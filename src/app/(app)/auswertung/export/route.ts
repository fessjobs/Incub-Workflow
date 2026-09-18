// GET /auswertung/export?format=xlsx|zvoove&von=&bis=&customerId=&employeeId=
//   &validate=1 → nur Validierung (JSON-Fehlerliste)
//   &ohneFehler=1 → fehlerhafte Zeilen weglassen
//   &archivieren=0 → nicht im Dokumentenspeicher ablegen
// Nur freigegebene Zeiteinträge gehen in den Export.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { apiUser } from "@/lib/einsatz/access";
import { loadDeductions, loadEntries, loadWageRules, wageLinesForRow } from "@/lib/einsatz/analytics";
import { safeFilename, storeDocument } from "@/lib/einsatz/documents";
import { ExportRequestSchema } from "@/lib/einsatz/schemas";
import { buildStundenExcel } from "@/lib/export/stunden-excel";
import { buildZvooveRows, encodeCsv, loadZvooveMapping, renderZvooveCsv, validateZvooveRows } from "@/lib/export/zvoove";
import type { WageLine } from "@/lib/einsatz/wage";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const { user, status } = await apiUser();
  if (!user) return NextResponse.json({ error: "Keine Berechtigung." }, { status });
  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = ExportRequestSchema.safeParse({ ...raw, ohneFehler: raw.ohneFehler === "1", archivieren: raw.archivieren !== "0" });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
  const p = parsed.data;
  const validateOnly = url.searchParams.get("validate") === "1";
  const filter = { von: p.von, bis: p.bis, customerId: p.customerId, employeeId: p.employeeId, review: "FREIGEGEBEN" as const };

  try {
    const [{ rows }, rules, deductions] = await Promise.all([loadEntries(user.organizationId, filter), loadWageRules(user.organizationId), loadDeductions(user.organizationId, filter)]);
    const wageLines = new Map<string, WageLine[]>(rows.map((r) => [r.id, wageLinesForRow(r, rules)]));
    const customer = p.customerId ? await db.customer.findFirst({ where: { id: p.customerId, organizationId: user.organizationId }, select: { name: true } }) : null;
    const zeitraum = `${p.von}_${p.bis}`;
    const scopeName = customer ? `_${safeFilename(customer.name)}` : "";

    if (p.format === "xlsx") {
      if (validateOnly) return NextResponse.json({ ok: true, zeilen: rows.length, fehler: [] });
      const bytes = await buildStundenExcel({ rows, wageLines, deductions, titel: "Stundenauswertung", zeitraum: `${p.von} – ${p.bis}` });
      const filename = `Stunden${scopeName}_${zeitraum}.xlsx`;
      if (p.archivieren) await archive(user.organizationId, user.id, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename, bytes, p, rows.length);
      return file(bytes, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    }

    // zvoove
    const { mapping, hinweis } = loadZvooveMapping();
    const bekannteLohnarten = new Set(rules.filter((r) => r.aktiv).map((r) => r.lohnart));
    for (const d of deductions) bekannteLohnarten.add(d.line.lohnart);
    const zRows = buildZvooveRows(rows, wageLines, deductions, mapping);
    const fehler = validateZvooveRows(zRows, { von: p.von, bis: p.bis, bekannteLohnarten, mapping });
    if (validateOnly) return NextResponse.json({ ok: fehler.length === 0, zeilen: zRows.length, fehler, hinweis, mapping: { quelle: mapping.quelle, spalten: mapping.spalten.map((s) => s.kopf), zeichensatz: mapping.zeichensatz, trennzeichen: mapping.trennzeichen } });
    let out = zRows;
    if (fehler.length > 0) {
      if (!p.ohneFehler) return NextResponse.json({ error: "Validierung fehlgeschlagen – Export erst nach Behebung oder ohne fehlerhafte Zeilen möglich.", fehler }, { status: 422 });
      const bad = new Set(fehler.map((f) => f.zeile));
      out = zRows.filter((_, i) => !bad.has(i + 1));
    }
    const csv = encodeCsv(renderZvooveCsv(out, mapping), mapping.zeichensatz);
    const filename = `zvoove_Stunden${scopeName}_${zeitraum}.csv`;
    if (p.archivieren) await archive(user.organizationId, user.id, "text/csv", filename, csv, p, out.length);
    return file(csv, filename, `text/csv; charset=${mapping.zeichensatz === "windows-1252" ? "windows-1252" : "utf-8"}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    console.error("Export fehlgeschlagen:", message);
    return NextResponse.json({ error: `Export fehlgeschlagen: ${message}` }, { status: 500 });
  }
}

function file(bytes: Buffer, filename: string, type: string) {
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}

async function archive(orgId: string, userId: string, mime: string, filename: string, bytes: Buffer, p: { von: string; bis: string; customerId?: string; employeeId?: string; format: string }, zeilen: number) {
  await storeDocument({
    organizationId: orgId,
    category: "export",
    filename,
    mimeType: mime,
    bytes,
    meta: { format: p.format, von: p.von, bis: p.bis, zeilen },
    createdById: userId,
    links: [{ customerId: p.customerId ?? null, employeeId: p.employeeId ?? null, datum: p.von }],
  });
}
