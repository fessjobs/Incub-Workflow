// Postgres-basierte Job-Queue (Tabelle jobs). Im Repo gibt es weder Redis noch
// BullMQ; diese Queue bietet dieselben Grundfunktionen (verzögerte Jobs,
// Wiederholung mit Backoff, Dedupe) ohne zusätzliche Infrastruktur. Ein
// BullMQ-Adapter kann über dieselbe Schnittstelle nachgerüstet werden
// (siehe docs/einsatzmodul.md, offene Punkte).
import { Prisma, type Job } from "@prisma/client";
import { db } from "@/lib/db";

export type JobType = "link.versand" | "link.erinnerung" | "stundennachweis.pdf" | "einsatz.abschluss-check";

export type JobPayloads = {
  "link.versand": { shiftAssignmentId: string };
  "link.erinnerung": { shiftAssignmentId: string };
  "stundennachweis.pdf": { assignmentId: string; force?: boolean; shiftId?: string | null };
  "einsatz.abschluss-check": { assignmentId: string };
};

export type JobHandler<T extends JobType> = (payload: JobPayloads[T], job: Job) => Promise<Prisma.InputJsonValue | void>;

const handlers = new Map<JobType, JobHandler<JobType>>();

export function registerJobHandler<T extends JobType>(type: T, handler: JobHandler<T>): void {
  handlers.set(type, handler as unknown as JobHandler<JobType>);
}

export async function enqueueJob<T extends JobType>(
  type: T,
  payload: JobPayloads[T],
  options: { runAt?: Date; dedupeKey?: string; organizationId?: string; maxAttempts?: number } = {}
): Promise<Job | null> {
  const data = {
    type,
    payload: payload as unknown as Prisma.InputJsonValue,
    runAt: options.runAt ?? new Date(),
    organizationId: options.organizationId,
    maxAttempts: options.maxAttempts ?? 5,
  };
  if (options.dedupeKey) {
    // Vorhandener, noch offener Job mit gleichem Schlüssel: Zeitpunkt aktualisieren
    const existing = await db.job.findUnique({ where: { dedupeKey: options.dedupeKey } });
    if (existing) {
      if (existing.status === "OFFEN") {
        return db.job.update({ where: { id: existing.id }, data: { runAt: data.runAt, payload: data.payload } });
      }
      return null;
    }
    return db.job.create({ data: { ...data, dedupeKey: options.dedupeKey } });
  }
  return db.job.create({ data });
}

export async function cancelJob(dedupeKey: string): Promise<void> {
  await db.job.deleteMany({ where: { dedupeKey, status: "OFFEN" } });
}

// Nächsten fälligen Job atomar reservieren (SKIP LOCKED gegen parallele Worker)
async function claimNext(): Promise<Job | null> {
  const rows = await db.$queryRaw<Job[]>(Prisma.sql`
    UPDATE "jobs" SET "status" = 'LAEUFT', "lockedAt" = NOW(), "attempts" = "attempts" + 1, "updatedAt" = NOW()
    WHERE "id" = (
      SELECT "id" FROM "jobs"
      WHERE ("status" = 'OFFEN' AND "runAt" <= NOW())
         OR ("status" = 'LAEUFT' AND "lockedAt" < NOW() - INTERVAL '10 minutes')
      ORDER BY "runAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *`);
  return rows[0] ?? null;
}

export type RunResult = { processed: number; failed: number; details: Array<{ id: string; type: string; ok: boolean; error?: string }> };

export async function runDueJobs(limit = 20): Promise<RunResult> {
  const result: RunResult = { processed: 0, failed: 0, details: [] };
  for (let i = 0; i < limit; i++) {
    const job = await claimNext();
    if (!job) break;
    const handler = handlers.get(job.type as JobType);
    if (!handler) {
      await db.job.update({ where: { id: job.id }, data: { status: "FEHLER", lastError: `Kein Handler für ${job.type}` } });
      result.failed++;
      result.details.push({ id: job.id, type: job.type, ok: false, error: "kein Handler" });
      continue;
    }
    try {
      const out = await handler(job.payload as JobPayloads[JobType], job);
      await db.job.update({ where: { id: job.id }, data: { status: "ERLEDIGT", result: out ?? undefined, lastError: null } });
      result.processed++;
      result.details.push({ id: job.id, type: job.type, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message.slice(0, 500) : "Unbekannter Fehler";
      const giveUp = job.attempts >= job.maxAttempts;
      // Exponentielles Backoff: 1, 2, 4, 8 … Minuten
      const delayMs = Math.min(60, 2 ** (job.attempts - 1)) * 60_000;
      await db.job.update({
        where: { id: job.id },
        data: { status: giveUp ? "FEHLER" : "OFFEN", lastError: message, runAt: new Date(Date.now() + delayMs) },
      });
      console.error(`Job ${job.type} (${job.id}) fehlgeschlagen (${job.attempts}/${job.maxAttempts}):`, message);
      result.failed++;
      result.details.push({ id: job.id, type: job.type, ok: false, error: message });
    }
  }
  return result;
}
