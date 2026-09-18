// Reine Rollen- und Pfadlogik – OHNE Imports, damit die Middleware (Edge
// Runtime) sie nutzen kann, ohne Prisma und die halbe App mitzuziehen.

export type Rolle = "ADMIN" | "BUCHHALTUNG" | "MEMBER" | "EINREICHER" | "DISPONENT";

// Wohin nach dem Login? Die Disposition startet im Einsatzmodul.
export function homePathFor(role: string): string {
  if (role === "EINREICHER") return "/mitarbeiter";
  if (role === "DISPONENT") return "/einsaetze";
  return "/dashboard";
}

// Pfade, die ein Disponenten-Konto sehen darf (alles andere wird umgeleitet)
export const DISPONENT_PATHS = ["/einsaetze", "/auswertung", "/dokumente", "/api/assignments", "/api/documents", "/api/blobs", "/api/jobs"];

export function disponentDarf(pathname: string): boolean {
  return DISPONENT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
