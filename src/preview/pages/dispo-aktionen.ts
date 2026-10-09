// Einplanen, Entfernen, automatisch Füllen und Textbausteine der Disposition.
// Reine Funktionen auf dem Zustand des Prototyps.
import type { Job, Schicht } from "../logic/types";
import type { PassungErgebnis } from "../logic/passung";
import { schichtStunden } from "../logic/passung";
import { formatDatumDE, tagNummer } from "../logic/zeit";
import { HEUTE, type PvState } from "../state/store";
import { passungFuer } from "./helfer";

export function besetzungSchicht(st: PvState, schicht: Schicht): number {
  return (st.zuweisung[schicht.id] ?? []).length;
}

export function plane(st: PvState, job: Job, schichtId: string, pnr: string, begruendung: string | null): PvState {
  const liste = st.zuweisung[schichtId] ?? [];
  if (liste.some((z) => z.pnr === pnr)) return st;
  return {
    ...st,
    zuweisung: { ...st.zuweisung, [schichtId]: [...liste, { pnr, begruendung }] },
    bewerbungen: st.bewerbungen.map((a) => (a.jobId === job.id && a.pnr === pnr ? { ...a, status: "bestätigt" } : a)),
  };
}

export function entferne(st: PvState, job: Job, schichtId: string, pnr: string): PvState {
  const zuweisung = { ...st.zuweisung, [schichtId]: (st.zuweisung[schichtId] ?? []).filter((z) => z.pnr !== pnr) };
  const nochEingeplant = job.schichten.some((sch) => (zuweisung[sch.id] ?? []).some((z) => z.pnr === pnr));
  return {
    ...st,
    zuweisung,
    bewerbungen: st.bewerbungen.map((a) => (a.jobId === job.id && a.pnr === pnr && !nochEingeplant && a.status === "bestätigt" ? { ...a, status: "passt" } : a)),
  };
}

// Konflikte, die vor dem Einplanen eine Begründung verlangen (inklusive Überbesetzung)
export function einplanKonflikte(st: PvState, p: PassungErgebnis, schicht: Schicht): string[] {
  const texte = p.konflikte.map((k) => k.text);
  const besetzt = besetzungSchicht(st, schicht);
  if (besetzt >= schicht.bedarf) texte.push(`Die Schicht ist bereits voll besetzt (${besetzt} von ${schicht.bedarf}).`);
  return texte;
}

// Füllt freie Plätze mit den am besten passenden Bewerbern – nur Personen ohne
// Konflikt. Alles andere bleibt für die Disposition offen.
export function autoFuellen(st: PvState, job: Job): { state: PvState; eingeplant: number; offen: number } {
  let aktuell = st;
  let eingeplant = 0;
  const crew = new Map(st.crew.map((c) => [c.pnr, c]));
  for (const schicht of job.schichten) {
    const anzahlFrei = () => Math.max(0, schicht.bedarf - besetzungSchicht(aktuell, schicht));
    const kandidaten = aktuell.bewerbungen
      .filter((a) => a.jobId === job.id && a.schichtIds.includes(schicht.id) && a.status !== "abgelehnt" && a.status !== "bestätigt")
      .map((a) => crew.get(a.pnr))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));
    while (anzahlFrei() > 0 && kandidaten.length > 0) {
      const bewertet = kandidaten
        .filter((c) => !job.schichten.some((x) => (aktuell.zuweisung[x.id] ?? []).some((z) => z.pnr === c.pnr)))
        .map((c) => ({ c, p: passungFuer(aktuell, c, job, schicht) }))
        .filter((x) => x.p.konflikte.length === 0)
        .sort((a, b) => b.p.score - a.p.score);
      if (bewertet.length === 0) break;
      const bester = bewertet[0].c;
      aktuell = plane(aktuell, job, schicht.id, bester.pnr, null);
      kandidaten.splice(kandidaten.indexOf(bester), 1);
      eingeplant++;
    }
  }
  const offen = job.schichten.reduce((n, sch) => n + Math.max(0, sch.bedarf - besetzungSchicht(aktuell, sch)), 0);
  return { state: aktuell, eingeplant, offen };
}

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];

export function wochentag(datum: string): string {
  return WOCHENTAGE[new Date(`${datum}T12:00:00Z`).getUTCDay()];
}

function tagLabel(datum: string): string {
  const diff = tagNummer(datum) - tagNummer(HEUTE);
  return diff === 0 ? "HEUTE" : diff === 1 ? "MORGEN" : `AM ${wochentag(datum).toUpperCase()}, ${formatDatumDE(datum).slice(0, 6)}`;
}

// Aushang für die WhatsApp-Gruppe zum Rauskopieren
export function whatsappAushang(st: PvState, job: Job, link?: string): string {
  const zeilen: string[] = [];
  const kurzfristig = tagNummer(job.datumVon) - tagNummer(HEUTE) <= 2;
  zeilen.push(`🚨 ${kurzfristig ? "KURZFRISTIGER " : ""}EINSATZ ${tagLabel(job.datumVon)} 🚨`);
  zeilen.push("");
  zeilen.push(`📍 ${job.titel} – ${job.ort}`);
  zeilen.push(job.datumVon === job.datumBis ? `📅 ${wochentag(job.datumVon)}, ${formatDatumDE(job.datumVon)}` : `📅 ${formatDatumDE(job.datumVon)} bis ${formatDatumDE(job.datumBis)}`);
  for (const sch of job.schichten) {
    const frei = Math.max(0, sch.bedarf - besetzungSchicht(st, sch));
    zeilen.push(`⏰ ${sch.bezeichnung}: ${sch.start}–${sch.ende} Uhr · ${sch.taetigkeit} · ${frei > 0 ? `${frei} Plätze frei` : "komplett besetzt"} (${schichtStunden(sch).toString().replace(".", ",")} h)`);
  }
  zeilen.push(`👕 ${job.dresscode}`);
  if (job.psa.length) zeilen.push(`🦺 Mitbringen: ${job.psa.join(", ")}`);
  zeilen.push(`🍽️ ${job.verpflegung}`);
  zeilen.push("");
  zeilen.push(`👉 Bewerben in 1 Minute: ${link ?? `https://fess.jobs/jobs/${job.id}`}`);
  zeilen.push("Danke euch 💪");
  return zeilen.join("\n");
}

export function belegLinkFuer(job: Job): string {
  let h = 5381;
  for (const ch of job.id) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return `https://app.fess.jobs/b/${h.toString(36).padStart(7, "x")}`;
}
