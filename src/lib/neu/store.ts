// Speicher des neuen Systems: ausschließlich die v2_-Tabellen. Der Bestand
// (Belege, Einsätze, Stunden, Dokumente) wird weder gelesen noch geschrieben.
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { KIND_SCHEMA, KINDS, type Kind, type Op } from "./schemas";

export interface Datensatz {
  id: string;
  rev: number;
  data: unknown;
}

export type Alle = Record<Kind, Datensatz[]>;

export interface AuditZeile {
  id: string;
  zeitpunkt: string;
  user: string;
  tabelle: string;
  datensatz: string;
  feld: string;
  alt: string;
  neu: string;
  grund: string | null;
}

export async function ladeAlles(organizationId: string): Promise<{ records: Alle; audit: AuditZeile[]; version: string }> {
  const zeilen = await db.v2Record.findMany({ where: { organizationId }, select: { kind: true, id: true, rev: true, data: true }, orderBy: [{ kind: "asc" }, { createdAt: "asc" }] });
  const records = Object.fromEntries(KINDS.map((k) => [k, [] as Datensatz[]])) as Alle;
  for (const z of zeilen) {
    if ((KINDS as readonly string[]).includes(z.kind)) records[z.kind as Kind].push({ id: z.id, rev: z.rev, data: z.data });
  }
  const audit = await db.v2Audit.findMany({ where: { organizationId }, orderBy: { zeitpunkt: "desc" }, take: 300 });
  return {
    records,
    audit: audit.map((a) => ({ id: a.id, zeitpunkt: a.zeitpunkt.toISOString(), user: a.user, tabelle: a.tabelle, datensatz: a.datensatz, feld: a.feld, alt: a.alt, neu: a.neu, grund: a.grund })),
    version: await version(organizationId),
  };
}

// Kurzer Stand zum Abfragen „hat sich etwas geändert?“ (z. B. weil die Crew etwas abgeschickt hat)
export async function version(organizationId: string): Promise<string> {
  const [r, a] = await Promise.all([
    db.v2Record.aggregate({ where: { organizationId }, _count: true, _max: { updatedAt: true } }),
    db.v2Audit.aggregate({ where: { organizationId }, _count: true }),
  ]);
  return `${r._count}:${r._max.updatedAt?.getTime() ?? 0}:${a._count}`;
}

export type SchreibErgebnis = { ok: true; revs: Record<string, number> } | { ok: false; konflikte: string[] } | { ok: false; ungueltig: string };

// Schreibt Änderungen in EINER Transaktion. Beruht eine Änderung auf einem
// veralteten Stand (rev passt nicht), wird nichts geschrieben und der Konflikt
// gemeldet – der Bildschirm lädt dann neu.
export async function schreibeOps(organizationId: string, benutzer: string, ops: Op[]): Promise<SchreibErgebnis> {
  if (ops.length === 0) return { ok: true, revs: {} };
  // Form je Art prüfen, bevor etwas geschrieben wird
  for (const op of ops) {
    if (op.data === null) continue;
    const r = KIND_SCHEMA[op.kind].safeParse(op.data);
    if (!r.success) return { ok: false, ungueltig: `${op.kind}/${op.id}: ${r.error.issues[0]?.path.join(".") || "Daten"} – ${r.error.issues[0]?.message ?? "ungültig"}` };
    if (JSON.stringify(op.data).length > 250_000) return { ok: false, ungueltig: `${op.kind}/${op.id}: zu groß` };
  }
  return db.$transaction(
    async (tx) => {
      const vorhanden = await tx.v2Record.findMany({ where: { organizationId, OR: ops.map((o) => ({ kind: o.kind, id: o.id })) }, select: { kind: true, id: true, rev: true } });
      const stand = new Map(vorhanden.map((v) => [`${v.kind}:${v.id}`, v.rev]));
      const konflikte: string[] = [];
      for (const op of ops) {
        const key = `${op.kind}:${op.id}`;
        const aktuell = stand.get(key);
        if (aktuell === undefined) {
          // Neu anlegen. Eine Änderung oder Löschung eines Datensatzes, den es nicht mehr gibt, ist ein Konflikt.
          if (op.rev !== undefined && op.data !== null) konflikte.push(key);
        } else if (op.rev !== aktuell) konflikte.push(key);
      }
      if (konflikte.length > 0) return { ok: false as const, konflikte };

      const revs: Record<string, number> = {};
      for (const op of ops) {
        const key = `${op.kind}:${op.id}`;
        const aktuell = stand.get(key);
        if (op.data === null) {
          if (aktuell !== undefined) await tx.v2Record.delete({ where: { organizationId_kind_id: { organizationId, kind: op.kind, id: op.id } } });
          continue;
        }
        const data = op.data as Prisma.InputJsonValue;
        if (aktuell === undefined) {
          await tx.v2Record.create({ data: { organizationId, kind: op.kind, id: op.id, data, updatedBy: benutzer } });
          revs[key] = 1;
        } else {
          await tx.v2Record.update({ where: { organizationId_kind_id: { organizationId, kind: op.kind, id: op.id } }, data: { data, rev: { increment: 1 }, updatedBy: benutzer } });
          revs[key] = aktuell + 1;
        }
      }
      return { ok: true as const, revs };
    },
    { timeout: 30_000 }
  );
}

export async function schreibeAudit(organizationId: string, zeilen: AuditZeile[]): Promise<void> {
  if (zeilen.length === 0) return;
  await db.v2Audit.createMany({
    data: zeilen.map((z) => ({ id: z.id, organizationId, zeitpunkt: new Date(z.zeitpunkt), user: z.user, tabelle: z.tabelle, datensatz: z.datensatz, feld: z.feld, alt: z.alt, neu: z.neu, grund: z.grund })),
    skipDuplicates: true,
  });
}

// Beispieldaten: ersetzt frühere Beispieldaten, lässt echte Datensätze in Ruhe
export async function ladeBeispieldaten(organizationId: string, benutzer: string, ops: Array<{ kind: Kind; id: string; data: unknown }>): Promise<number> {
  for (const op of ops) {
    const r = KIND_SCHEMA[op.kind].safeParse(op.data);
    if (!r.success) throw new Error(`Beispieldaten ungültig: ${op.kind}/${op.id}`);
  }
  return db.$transaction(
    async (tx) => {
      await tx.v2Record.deleteMany({ where: { organizationId, demo: true } });
      // Echte Datensätze mit gleicher ID bleiben (kein Überschreiben)
      const echt = await tx.v2Record.findMany({ where: { organizationId }, select: { kind: true, id: true } });
      const belegt = new Set(echt.map((e) => `${e.kind}:${e.id}`));
      const neu = ops.filter((o) => !belegt.has(`${o.kind}:${o.id}`));
      for (let i = 0; i < neu.length; i += 500) {
        await tx.v2Record.createMany({ data: neu.slice(i, i + 500).map((o) => ({ organizationId, kind: o.kind, id: o.id, data: o.data as Prisma.InputJsonValue, demo: true, updatedBy: benutzer, updatedAt: new Date() })) });
      }
      return neu.length;
    },
    { timeout: 120_000 }
  );
}

export async function entferneBeispieldaten(organizationId: string): Promise<number> {
  const r = await db.v2Record.deleteMany({ where: { organizationId, demo: true } });
  return r.count;
}

// ─── Einzelne Datensätze (für die Seiten der Crew, die nur ihren eigenen sehen) ─

export async function leseRecord<T>(organizationId: string, kind: Kind, id: string): Promise<{ rev: number; data: T } | null> {
  const r = await db.v2Record.findUnique({ where: { organizationId_kind_id: { organizationId, kind, id } } });
  return r ? { rev: r.rev, data: r.data as T } : null;
}

export async function listeRecords<T>(organizationId: string, kind: Kind): Promise<Array<{ id: string; rev: number; data: T }>> {
  const r = await db.v2Record.findMany({ where: { organizationId, kind }, orderBy: { createdAt: "asc" } });
  return r.map((x) => ({ id: x.id, rev: x.rev, data: x.data as T }));
}

export async function setzeRecord(organizationId: string, kind: Kind, id: string, data: unknown, benutzer: string): Promise<number> {
  const r = KIND_SCHEMA[kind].safeParse(data);
  if (!r.success) throw new Error(`${kind}/${id}: ungültig`);
  const d = data as Prisma.InputJsonValue;
  const x = await db.v2Record.upsert({
    where: { organizationId_kind_id: { organizationId, kind, id } },
    create: { organizationId, kind, id, data: d, updatedBy: benutzer },
    update: { data: d, rev: { increment: 1 }, updatedBy: benutzer },
  });
  return x.rev;
}

export async function loescheRecord(organizationId: string, kind: Kind, id: string): Promise<void> {
  await db.v2Record.deleteMany({ where: { organizationId, kind, id } });
}
