"use client";
// Benutzer: wer außer den Administratoren das neue Dashboard nutzen darf, und mit welcher Rolle.
// Die Konten kommen aus dem bisherigen System (gleiche Anmeldung); hier wird nur die Rolle im neuen Dashboard gesetzt.
import { useCallback, useEffect, useState } from "react";
import { Chip, Karte, Kopf, Note } from "../ui/kit";
import { usePv } from "../state/store";
import { ROLLEN_NAME, ROLLEN_TEXT, type NeuRolle } from "@/lib/neu/rollen";

interface Zeile {
  userId: string;
  name: string;
  email: string;
  bisherigeRolle: string;
  rolle: NeuRolle | null;
  moeglich: boolean;
  grund: string | null;
}

const BISHER: Record<string, string> = { ADMIN: "Admin", MEMBER: "Mitglied", BUCHHALTUNG: "Buchhaltung", DISPONENT: "Disposition", EINREICHER: "Kiosk" };

export function AdminBenutzer() {
  const { melde, echt } = usePv();
  const [zeilen, setZeilen] = useState<Zeile[] | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const laden = useCallback(async () => {
    const r = await fetch("/api/neu/benutzer", { cache: "no-store", credentials: "same-origin" });
    const j = (await r.json().catch(() => null)) as { benutzer?: Zeile[]; error?: string } | null;
    if (!r.ok || !j?.benutzer) return setFehler(j?.error ?? "Die Benutzer konnten nicht geladen werden.");
    setFehler(null);
    setZeilen(j.benutzer);
  }, []);
  useEffect(() => {
    void laden();
  }, [laden]);

  const setze = async (userId: string, rolle: string) => {
    const r = await fetch("/api/neu/benutzer", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ userId, rolle }) });
    const j = (await r.json().catch(() => null)) as { benutzer?: Zeile[]; error?: string } | null;
    if (!r.ok || !j?.benutzer) return melde(j?.error ?? "Nicht gespeichert.");
    setZeilen(j.benutzer);
    melde("Rolle gespeichert.");
  };

  if (echt && echt.rolle !== "admin") return <Note ton="warn">Nur die Administration verwaltet die Benutzer.</Note>;

  return (
    <>
      <Kopf eyebrow="System" titel="Benutzer" sub="Wer das neue Dashboard nutzen darf – und was er dort darf. Die Konten und Passwörter bleiben im bisherigen System." />
      <div className="pva-grid c2">
        {(["dispo", "buchhaltung", "lesen", "admin"] as NeuRolle[]).map((r) => (
          <Karte key={r} titel={ROLLEN_NAME[r]}><p className="small">{ROLLEN_TEXT[r]}</p></Karte>
        ))}
      </div>
      <div className="mt3">
        {fehler ? <Note ton="err">{fehler}</Note> : null}
        <Karte>
          {zeilen === null && !fehler ? <div className="muted">Lädt …</div> : null}
          {zeilen ? (
            <table className="pv-table" data-testid="benutzer-tabelle">
              <thead><tr><th>Konto</th><th>Bisherige Rolle</th><th>Rolle im neuen Dashboard</th></tr></thead>
              <tbody>
                {zeilen.map((z) => (
                  <tr key={z.userId}>
                    <td><b>{z.name}</b><div className="tiny muted">{z.email}</div></td>
                    <td><Chip>{BISHER[z.bisherigeRolle] ?? z.bisherigeRolle}</Chip></td>
                    <td>
                      {z.bisherigeRolle === "ADMIN" ? <Chip ton="gut">{ROLLEN_NAME.admin}</Chip> : z.moeglich ? (
                        <select className="pv-select sm" aria-label={`Rolle für ${z.name}`} value={z.rolle ?? "keine"} onChange={(e) => void setze(z.userId, e.target.value)}>
                          <option value="keine">kein Zugang</option>
                          <option value="lesen">{ROLLEN_NAME.lesen}</option>
                          <option value="dispo">{ROLLEN_NAME.dispo}</option>
                          <option value="buchhaltung">{ROLLEN_NAME.buchhaltung}</option>
                        </select>
                      ) : <span className="small muted">{z.grund}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Karte>
        <div className="small muted mt2">Weitere Konten legst du im bisherigen System unter Einstellungen an. Im Menü des bisherigen Systems erscheint der Eintrag „Neu“ nur für Administratoren – andere Konten öffnen das neue Dashboard über den Link <span className="mono">/admin</span>. Jede Änderung steht im Änderungsprotokoll.</div>
      </div>
    </>
  );
}
