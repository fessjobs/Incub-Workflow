"use client";
// Einstieg des Prototyps: Zustand, Banner, Router. Wird von der Next-Seite
// unter /preview und von der eigenständigen Datei gleichermaßen genutzt.
import type { ReactNode } from "react";
import { usePath } from "./nav";
import { PvProvider } from "./state/store";
import { AdminShell, Banner, CrewShell, Toast } from "./ui/shells";
import { ROUTEN, passt } from "./pages/routes";

function NichtGefunden() {
  return (
    <div style={{ maxWidth: 520, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Seite nicht gefunden</h1>
      <p className="muted mt2">Diese Adresse gibt es im Prototyp nicht.</p>
    </div>
  );
}

// `nur`: erlaubt nur Routen mit diesem Anfang (das echte System zeigt /admin, /crew oder /b/ getrennt)
export function Router({ nur }: { nur?: string }) {
  const pfad = usePath();
  for (const r of ROUTEN) {
    if (nur && !r.muster.startsWith(nur)) continue;
    const p = passt(r.muster, pfad);
    if (!p) continue;
    const inhalt: ReactNode = r.render(p);
    if (r.rahmen === "admin") return <AdminShell>{inhalt}</AdminShell>;
    if (r.rahmen === "crew") return <CrewShell titel={r.titel}>{inhalt}</CrewShell>;
    return <>{inhalt}</>;
  }
  return <NichtGefunden />;
}

export function PreviewApp() {
  return (
    <PvProvider>
      <div className="pv">
        <Banner />
        <Router />
        <Toast />
      </div>
    </PvProvider>
  );
}
