// In-Prozess-Worker: verarbeitet fällige Jobs alle 60 Sekunden im laufenden
// Next.js-Server (Railway: eine Instanz). Zusätzlich kann ein externer Cron
// POST /api/jobs/run mit JOBS_SECRET aufrufen. JOBS_WORKER=off deaktiviert
// den internen Worker (z. B. wenn ein separater Worker-Dienst läuft).
import { registerEinsatzJobHandlers } from "./handlers";
import { runDueJobs } from "./queue";

const INTERVAL_MS = Number(process.env.JOBS_INTERVAL_MS ?? 60_000);

const g = globalThis as unknown as { __einsatzWorker?: NodeJS.Timeout; __einsatzWorkerBusy?: boolean };

export async function processJobsOnce(limit = 20) {
  registerEinsatzJobHandlers();
  if (g.__einsatzWorkerBusy) return { processed: 0, failed: 0, details: [], busy: true };
  g.__einsatzWorkerBusy = true;
  try {
    return await runDueJobs(limit);
  } finally {
    g.__einsatzWorkerBusy = false;
  }
}

export function startJobWorker(): void {
  if (process.env.JOBS_WORKER === "off") return;
  if (g.__einsatzWorker) return;
  registerEinsatzJobHandlers();
  g.__einsatzWorker = setInterval(() => {
    processJobsOnce().catch((err) => console.error("Job-Worker:", err instanceof Error ? err.message : err));
  }, INTERVAL_MS);
  // Timer soll den Prozess nicht am Beenden hindern
  g.__einsatzWorker.unref?.();
  console.log(`→ Einsatz-Job-Worker aktiv (Intervall ${Math.round(INTERVAL_MS / 1000)} s)`);
}
