// Next.js Instrumentation: startet beim Serverstart den Job-Worker des
// Einsatzmoduls (nur in der Node-Runtime, nicht im Edge-Bundle).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startJobWorker } = await import("@/lib/einsatz/jobs/worker");
    startJobWorker();
  }
}
