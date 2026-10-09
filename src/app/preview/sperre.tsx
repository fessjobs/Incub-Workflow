"use client";

import { useActionState } from "react";
import { entsperren, type EntsperrenErgebnis } from "./actions";

export function Sperre() {
  const [ergebnis, aktion, laeuft] = useActionState<EntsperrenErgebnis, FormData>(entsperren, undefined);
  return (
    <div className="pv" style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
      <form action={aktion} className="pv-card" style={{ maxWidth: 380, width: "100%" }}>
        <div className="eyebrow">Testversion</div>
        <h1 className="mt1">Zugang</h1>
        <p className="muted mt1 small">Diese Seite zeigt einen Klick-Prototyp mit Beispieldaten und ist nicht öffentlich.</p>
        <label className="pv-label mt3" htmlFor="pv-pw">
          Passwort
        </label>
        <input id="pv-pw" name="passwort" type="password" className="pv-input" autoComplete="current-password" autoFocus required />
        {ergebnis?.fehler ? (
          <div className="pv-error" role="alert">
            {ergebnis.fehler}
          </div>
        ) : null}
        <button type="submit" className="pv-btn block mt3" disabled={laeuft}>
          Öffnen
        </button>
      </form>
    </div>
  );
}
