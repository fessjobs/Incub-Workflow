"use client";

// Aufklappbare Sicherheitsunterweisung mit Pflicht-Haken
import type { SafetySection } from "@/lib/einsatz/safety";

export function SafetyAccordion({
  abschnitte,
  version,
  bestaetigung,
  checked,
  onChange,
  disabled,
}: {
  abschnitte: SafetySection[];
  version: string;
  bestaetigung: string[];
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="ez-card" style={{ padding: "0.4rem 1.1rem 1rem" }}>
      <details className="ez-acc">
        <summary>
          <span>Sicherheitsunterweisung &amp; PSA lesen</span>
          <span className="ez-pill ez-pill-grey">v{version}</span>
        </summary>
        {abschnitte.map((s) => (
          <div key={s.titel}>
            <h4>{s.titel}</h4>
            <ul>
              {s.punkte.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        ))}
        <h4>Mit deiner Unterschrift bestätigst du</h4>
        <ul>
          {bestaetigung.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      </details>
      <label className={`ez-check ${checked ? "is-on" : ""}`} style={{ marginTop: "0.6rem" }}>
        <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} data-testid="unterweisung-check" />
        <span>
          Ich habe die Sicherheitsunterweisung gelesen und verstanden und trage die vorgeschriebene PSA.
        </span>
      </label>
    </div>
  );
}
