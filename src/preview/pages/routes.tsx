"use client";
// Routentabelle des Prototyps. Muster: ":name" ist ein Platzhalter.
import type { ReactNode } from "react";
import { Notizen, Start } from "./start";
import { AdminUebersicht } from "./admin-uebersicht";
import { AdminCrew, AdminCrewDetail } from "./admin-crew";
import { AdminBewerber } from "./admin-bewerber";
import { AdminUnterlagen } from "./admin-unterlagen";
import { AdminUnterweisungen } from "./admin-unterweisungen";
import { AdminEinstellungen } from "./admin-einstellungen";
import { AdminStunden } from "./admin-stunden";
import { AdminDispo, AdminDispoDetail } from "./admin-dispo";
import { AdminBriefing } from "./admin-briefing";
import { CrewProfil, CrewStart } from "./crew-start";
import { CrewFragebogen } from "./crew-fragebogen";
import { CrewBewerben, CrewJobDetail, CrewJobs } from "./crew-jobs";
import { CrewModul, CrewUnterweisungen } from "./crew-unterweisung";
import { BelegLink } from "./beleg";

export interface Route {
  muster: string;
  rahmen: "admin" | "crew" | "frei";
  titel?: string;
  render: (p: Record<string, string>) => ReactNode;
}

export function passt(muster: string, pfad: string): Record<string, string> | null {
  const m = muster.split("/").filter(Boolean);
  const p = pfad.split("/").filter(Boolean);
  if (m.length !== p.length) return null;
  const out: Record<string, string> = {};
  for (let i = 0; i < m.length; i++) {
    if (m[i].startsWith(":")) out[m[i].slice(1)] = decodeURIComponent(p[i]);
    else if (m[i] !== p[i]) return null;
  }
  return out;
}

export const ROUTEN: Route[] = [
  { muster: "/", rahmen: "frei", render: () => <Start /> },
  { muster: "/notizen", rahmen: "frei", render: () => <Notizen /> },
  { muster: "/admin", rahmen: "admin", render: () => <AdminUebersicht /> },
  { muster: "/admin/crew", rahmen: "admin", render: () => <AdminCrew /> },
  { muster: "/admin/crew/:id", rahmen: "admin", render: (p) => <AdminCrewDetail id={p.id} /> },
  { muster: "/admin/bewerber", rahmen: "admin", render: () => <AdminBewerber /> },
  { muster: "/admin/unterlagen", rahmen: "admin", render: () => <AdminUnterlagen /> },
  { muster: "/admin/unterweisungen", rahmen: "admin", render: () => <AdminUnterweisungen /> },
  { muster: "/admin/dispo", rahmen: "admin", render: () => <AdminDispo /> },
  { muster: "/admin/dispo/:id", rahmen: "admin", render: (p) => <AdminDispoDetail id={p.id} /> },
  { muster: "/admin/dispo/:id/briefing", rahmen: "admin", render: (p) => <AdminBriefing id={p.id} /> },
  { muster: "/crew", rahmen: "crew", render: () => <CrewStart /> },
  { muster: "/crew/fragebogen", rahmen: "crew", titel: "Fragebogen", render: () => <CrewFragebogen /> },
  { muster: "/crew/jobs", rahmen: "crew", render: () => <CrewJobs /> },
  { muster: "/crew/jobs/:id", rahmen: "crew", render: (p) => <CrewJobDetail id={p.id} /> },
  { muster: "/crew/jobs/:id/bewerben", rahmen: "crew", render: (p) => <CrewBewerben id={p.id} /> },
  { muster: "/crew/unterweisung", rahmen: "crew", render: () => <CrewUnterweisungen /> },
  { muster: "/crew/unterweisung/:modul", rahmen: "crew", render: (p) => <CrewModul id={p.modul} /> },
  { muster: "/crew/profil", rahmen: "crew", render: () => <CrewProfil /> },
  { muster: "/b/:token", rahmen: "frei", render: (p) => <BelegLink token={p.token} /> },
  { muster: "/admin/stunden", rahmen: "admin", render: () => <AdminStunden /> },
  { muster: "/admin/einstellungen", rahmen: "admin", render: () => <AdminEinstellungen /> },
];
