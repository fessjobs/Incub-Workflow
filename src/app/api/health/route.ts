// Healthcheck für Railway/Render – antwortet, sobald der Server läuft
// (Migrationen + Seed sind zu diesem Zeitpunkt bereits durchgelaufen, siehe
// docker-entrypoint.sh). Bewusst ohne DB-Zugriff, damit der Check robust ist.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", app: "incub:workflow" });
}
