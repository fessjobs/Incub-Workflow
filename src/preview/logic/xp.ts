// XP und Level (Modul F). Die Werte aus dem Plan; in der echten Umsetzung
// stehen sie in der Tabelle `settings`. Die Level-Schwellen sind eine Annahme
// (im Plan nicht festgelegt) und im Prototyp als offen markiert.
export interface XpSettings {
  basis: number;
  puenktlichUndZettel: number;
  gutBewertet: number;
  noShow: number;
  zettelFehlt: number;
  levels: Array<{ name: string; ab: number }>;
}

export const DEFAULT_XP: XpSettings = {
  basis: 10,
  puenktlichUndZettel: 5,
  gutBewertet: 5,
  noShow: -20,
  zettelFehlt: -10,
  levels: [
    { name: "Rookie", ab: 0 },
    { name: "Crew", ab: 100 },
    { name: "Senior Crew", ab: 300 },
    { name: "Teamleiter-fähig", ab: 600 },
  ],
};

export interface EinsatzErgebnis {
  erschienen: boolean;
  puenktlich: boolean;
  zettelVollstaendig: boolean;
  // Durchschnitt der Bewertung 1..5, null wenn (noch) nicht bewertet
  bewertungSchnitt: number | null;
}

export function xpFuerEinsatz(e: EinsatzErgebnis, s: XpSettings = DEFAULT_XP): number {
  if (!e.erschienen) return s.noShow;
  let xp = s.basis;
  if (!e.zettelVollstaendig) xp += s.zettelFehlt;
  else if (e.puenktlich) xp += s.puenktlichUndZettel;
  if (e.bewertungSchnitt !== null && e.bewertungSchnitt >= 4) xp += s.gutBewertet;
  return xp;
}

export function levelFuer(xp: number, s: XpSettings = DEFAULT_XP): { name: string; naechstes: { name: string; fehlend: number } | null; fortschritt: number } {
  const sortiert = [...s.levels].sort((a, b) => a.ab - b.ab);
  let idx = 0;
  sortiert.forEach((l, i) => {
    if (xp >= l.ab) idx = i;
  });
  const aktuell = sortiert[idx];
  const naechst = sortiert[idx + 1];
  if (!naechst) return { name: aktuell.name, naechstes: null, fortschritt: 1 };
  const spanne = naechst.ab - aktuell.ab;
  return {
    name: aktuell.name,
    naechstes: { name: naechst.name, fehlend: naechst.ab - xp },
    fortschritt: Math.max(0, Math.min(1, (xp - aktuell.ab) / spanne)),
  };
}
