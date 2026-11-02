"use client";

// Monatszettel im Dashboard: Kunde und Monat wählen, Personen ankreuzen, Links erstellen und als Nachricht verschicken,
// Stand je Person und der Link für den Kunden.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STAND_TEXT, STANDARD_VORLAGE, fuelleVorlage, kundenNachricht, monatsName, waLinkAn, formatStunden, type ZettelStand } from "@/lib/einsatz/monatszettel";
import type { StapelAnsicht } from "@/lib/einsatz/service/monatszettel";
import { entferneZettelAction, erstelleLinksAction, markiereGesendetAction, setzeKontaktAction } from "./actions";

type Kunde = { id: string; name: string };
type Person = { id: string; vorname: string; nachname: string; personalnummer: string | null };

const STAND_FARBE: Record<ZettelStand, string> = {
  leer: "bg-navy-100 text-navy-600",
  in_arbeit: "bg-sky-100 text-sky-700",
  wartet_kunde: "bg-amber-100 text-amber-800",
  zurueck: "bg-red-100 text-red-700",
  fertig: "bg-emerald-100 text-emerald-700",
};

const VORLAGE_KEY = "mz-vorlage-v1";

async function kopiere(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function MonatszettelPanel({ kunden, mitarbeiter, monate, kundeId, monat, stapel, basis, heute }: { kunden: Kunde[]; mitarbeiter: Person[]; monate: Array<{ wert: string; label: string }>; kundeId: string; monat: string; stapel: StapelAnsicht; basis: string; heute: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [meldung, setMeldung] = useState<{ ok: boolean; text: string } | null>(null);
  const [suche, setSuche] = useState("");
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [vorlage, setVorlage] = useState(STANDARD_VORLAGE);
  const [vorlageOffen, setVorlageOffen] = useState(false);
  const [kontakt, setKontakt] = useState(stapel.batch?.kontakt ?? "");

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VORLAGE_KEY);
      if (v) setVorlage(v);
    } catch {
      /* ohne Speicher gilt der Standardtext */
    }
  }, []);
  useEffect(() => setKontakt(stapel.batch?.kontakt ?? ""), [stapel.batch?.kontakt]);

  const kunde = kunden.find((k) => k.id === kundeId) ?? null;
  const base = basis || (typeof window !== "undefined" ? window.location.origin : "");
  const hatLink = useMemo(() => new Set(stapel.zettel.map((z) => z.employeeId)), [stapel.zettel]);
  const sichtbar = mitarbeiter.filter((m) => !suche.trim() || `${m.vorname} ${m.nachname} ${m.personalnummer ?? ""}`.toLowerCase().includes(suche.trim().toLowerCase()));
  const zaehler = {
    offen: stapel.zettel.filter((z) => ["leer", "in_arbeit", "zurueck"].includes(z.stand)).length,
    wartet: stapel.zettel.filter((z) => z.stand === "wartet_kunde").length,
    fertig: stapel.zettel.filter((z) => z.stand === "fertig").length,
  };

  // Die Auswahl gilt sofort (auch wenn die Seite noch lädt), die Adresse folgt
  const [auswahl, setAuswahl] = useState({ kunde: kundeId, monat });
  useEffect(() => setAuswahl({ kunde: kundeId, monat }), [kundeId, monat]);
  const waehle = (neu: { kunde?: string; monat?: string }) => {
    const n = { ...auswahl, ...neu };
    setAuswahl(n);
    const q = new URLSearchParams();
    if (n.kunde) q.set("kunde", n.kunde);
    q.set("monat", n.monat);
    router.push(`/einsaetze/monatszettel?${q.toString()}`);
  };
  const lauf = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, danach?: () => void) =>
    start(async () => {
      const r = await fn();
      setMeldung({ ok: r.ok, text: r.ok ? r.message ?? "Erledigt." : r.error ?? "Fehler." });
      if (r.ok) {
        danach?.();
        router.refresh();
      }
    });

  const nachricht = (vorname: string, token: string) => fuelleVorlage(vorlage, { vorname, kunde: kunde?.name ?? "", monat: monatsName(monat), link: `${base}/e/m/${token}` });
  const kundenText = stapel.batch ? kundenNachricht({ anrede: kontakt.split("(")[0].trim(), kunde: kunde?.name ?? "", monat: monatsName(monat), link: `${base}/e/k/${stapel.batch.token}` }) : "";

  return (
    <div className="space-y-6" data-testid="monatszettel">
      <div>
        <p className="eyebrow">Stundenlisten</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Monatszettel</h1>
        <p className="mt-1 text-sm text-navy-400">
          Für Personen, die laufend für einen Kunden arbeiten – ohne Auftrag je Einsatz. Jede Person bekommt einen eigenen Link und trägt über den Monat ihre Tage ein; am Monatsende unterschreibt sie, danach der Kunde. Die Stunden laufen wie alle anderen
          durch Freigabe, Auswertung und Dokumente.
        </p>
      </div>

      {meldung ? (
        <p className={`rounded-md px-3 py-2 text-sm ${meldung.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`} role="status" data-testid="mz-meldung">
          {meldung.text}
        </p>
      ) : null}

      <div className="card space-y-3 p-5">
        <p className="eyebrow">1 · Kunde und Monat</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="mz-kunde">Kunde</label>
            <select id="mz-kunde" className="input-accent" value={auswahl.kunde} onChange={(e) => waehle({ kunde: e.target.value })} data-testid="mz-kunde">
              <option value="">– Kunde wählen –</option>
              {kunden.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="mz-monat">Monat</label>
            <select id="mz-monat" className="input-accent" value={auswahl.monat} onChange={(e) => waehle({ monat: e.target.value })} data-testid="mz-monat">
              {monate.map((m) => (
                <option key={m.wert} value={m.wert}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {kunde ? (
        <div className="card space-y-3 p-5">
          <p className="eyebrow">2 · Personen auswählen</p>
          <div className="flex flex-wrap items-center gap-2">
            <input className="input-accent max-w-xs" placeholder="Name oder Personalnummer" value={suche} onChange={(e) => setSuche(e.target.value)} aria-label="Person suchen" />
            <button type="button" className="btn-secondary" onClick={() => setGewaehlt(sichtbar.filter((m) => !hatLink.has(m.id)).map((m) => m.id))}>
              Alle sichtbaren auswählen
            </button>
            <button type="button" className="btn-secondary" onClick={() => setGewaehlt([])}>
              Auswahl leeren
            </button>
          </div>
          <div className="max-h-72 divide-y divide-navy-100 overflow-auto rounded-md border border-navy-100 dark:divide-navy-800 dark:border-navy-800" data-testid="mz-personen">
            {sichtbar.slice(0, 80).map((m) => (
              <label key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input type="checkbox" checked={gewaehlt.includes(m.id)} disabled={hatLink.has(m.id)} onChange={() => setGewaehlt((g) => (g.includes(m.id) ? g.filter((x) => x !== m.id) : [...g, m.id]))} data-testid={`mz-wahl-${m.id}`} />
                <span className="flex-1">
                  <span className="font-medium">{m.vorname} {m.nachname}</span> <span className="text-xs text-navy-400">{m.personalnummer ?? ""}</span>
                </span>
                {hatLink.has(m.id) ? <span className="badge bg-sky-100 text-sky-700">hat Link</span> : null}
              </label>
            ))}
            {sichtbar.length === 0 ? <p className="p-3 text-sm text-navy-400">Niemand gefunden.</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn-accent"
              disabled={pending || gewaehlt.length === 0}
              onClick={() => lauf(() => erstelleLinksAction({ customerId: kundeId, monat, employeeIds: gewaehlt }), () => setGewaehlt([]))}
              data-testid="mz-links-erstellen"
            >
              Monatslinks erstellen{gewaehlt.length > 0 ? ` (${gewaehlt.length})` : ""}
            </button>
            <span className="text-xs text-navy-400">Jede Person bekommt einen eigenen Link für {kunde.name} im {monatsName(monat)}.</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-navy-400">Wähle oben einen Kunden, dann kannst du Personen auswählen und Links erstellen.</p>
      )}

      {kunde && stapel.zettel.length > 0 ? (
        <div className="card space-y-4 p-5" data-testid="mz-uebersicht">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="eyebrow">3 · Stand {kunde.name} · {monatsName(monat)}</p>
            <p className="text-xs text-navy-400">
              {zaehler.offen} offen · {zaehler.wartet} warten auf den Kunden · {zaehler.fertig} fertig
              {stapel.batch?.einsatznummer ? <> · Einsatz <a className="underline" href={`/einsaetze/${stapel.batch.assignmentId}`}>{stapel.batch.einsatznummer}</a></> : null}
            </p>
          </div>
          {zaehler.offen === 0 && zaehler.wartet > 0 ? <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Alle Personen haben unterschrieben – jetzt kannst du den Link an den Kunden schicken.</p> : null}
          {zaehler.offen > 0 && monat < heute.slice(0, 7) ? <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">Der Monat ist vorbei, aber {zaehler.offen} Zettel {zaehler.offen === 1 ? "ist" : "sind"} noch offen – am besten noch einmal erinnern.</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="mz-tabelle">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-navy-400">
                  <th className="py-2 pr-3">Person</th>
                  <th className="py-2 pr-3">Stand</th>
                  <th className="py-2 pr-3">Tage / Stunden</th>
                  <th className="py-2 pr-3">Nachricht</th>
                  <th className="py-2">Ansehen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100 dark:divide-navy-800">
                {stapel.zettel.map((z) => (
                  <tr key={z.id} data-testid={`mz-zeile-${z.employeeId}`}>
                    <td className="py-2 pr-3">
                      <p className="font-medium">{z.name}</p>
                      <p className="text-xs text-navy-400">{z.personalnummer ?? ""}</p>
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`badge ${STAND_FARBE[z.stand]}`} data-testid={`mz-stand-${z.employeeId}`}>{STAND_TEXT[z.stand]}</span>
                      <p className="mt-1 text-xs text-navy-400">{z.linkSentAt ? "Link versendet" : "Link noch nicht versendet"}</p>
                      {z.stand === "zurueck" && z.kundeHinweis ? <p className="mt-1 text-xs text-red-600">„{z.kundeHinweis}“</p> : null}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{z.tage} / {formatStunden(z.stunden)} h</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={async () => {
                            const ok = await kopiere(nachricht(z.vorname, z.token));
                            setMeldung({ ok, text: ok ? "Nachricht kopiert." : "Kopieren nicht möglich." });
                            if (ok) lauf(() => markiereGesendetAction(z.id));
                          }}
                          data-testid={`mz-kopieren-${z.employeeId}`}
                        >
                          Kopieren
                        </button>
                        <a className="btn-secondary" href={waLinkAn(z.mobil, nachricht(z.vorname, z.token))} target="_blank" rel="noreferrer" onClick={() => lauf(() => markiereGesendetAction(z.id))} data-testid={`mz-wa-${z.employeeId}`}>
                          WhatsApp
                        </a>
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <a className="btn-secondary" href={`/e/m/${z.token}`} target="_blank" rel="noreferrer" data-testid={`mz-person-oeffnen-${z.employeeId}`}>
                          Als Person öffnen
                        </a>
                        <a className="btn-secondary" href={`/einsaetze/monatszettel/${z.id}`} data-testid={`mz-detail-${z.employeeId}`}>
                          Details / PDF
                        </a>
                        {z.stand === "leer" ? (
                          <button type="button" className="btn-secondary" disabled={pending} onClick={() => lauf(() => entferneZettelAction(z.id))} aria-label={`Link für ${z.name} entfernen`}>
                            ✕
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {stapel.batch ? (
            <div className="space-y-2 rounded-md bg-navy-50 p-4 dark:bg-navy-900" data-testid="mz-kundenbox">
              <p className="font-medium">Link für den Kunden</p>
              <p className="text-xs text-navy-400">Der Kunde sieht alle Personen dieses Monats auf einer Seite und unterschreibt einmal. Es zählen nur Zettel, die die Person schon unterschrieben hat.</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-60 flex-1">
                  <label className="label" htmlFor="mz-kontakt">Ansprechpartner beim Kunden (nur zur Information)</label>
                  <input id="mz-kontakt" className="input-accent" value={kontakt} onChange={(e) => setKontakt(e.target.value)} onBlur={() => stapel.batch && kontakt !== (stapel.batch.kontakt ?? "") && lauf(() => setzeKontaktAction(stapel.batch!.id, kontakt))} placeholder="z. B. Frau Berger, Hallenleitung" data-testid="mz-kontakt" />
                </div>
              </div>
              <p className="break-all font-mono text-xs" data-testid="mz-kundenlink">{`${base}/e/k/${stapel.batch.token}`}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={async () => {
                    const ok = await kopiere(kundenText);
                    setMeldung({ ok, text: ok ? "Nachricht an den Kunden kopiert." : "Kopieren nicht möglich." });
                  }}
                  data-testid="mz-kundenlink-kopieren"
                >
                  Nachricht an den Kunden kopieren
                </button>
                <a className="btn-accent" href={`/e/k/${stapel.batch.token}`} target="_blank" rel="noreferrer" data-testid="mz-kundenlink-oeffnen">
                  Kundenlink öffnen
                </a>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {kunde ? (
        <div className="card space-y-2 p-5">
          <div className="flex items-center justify-between">
            <p className="eyebrow">Nachrichtentext an die Personen</p>
            <button type="button" className="btn-secondary" onClick={() => setVorlageOffen(!vorlageOffen)}>{vorlageOffen ? "Zuklappen" : "Ansehen und ändern"}</button>
          </div>
          {vorlageOffen ? (
            <div className="space-y-2">
              <textarea
                className="input-accent min-h-28"
                value={vorlage}
                onChange={(e) => {
                  setVorlage(e.target.value);
                  try {
                    window.localStorage.setItem(VORLAGE_KEY, e.target.value);
                  } catch {
                    /* nur für diesen Browser */
                  }
                }}
                aria-label="Nachrichtentext"
                data-testid="mz-vorlage"
              />
              <p className="text-xs text-navy-400">Platzhalter: {"{vorname}"}, {"{kunde}"}, {"{monat}"}, {"{link}"}. Der Text wird in diesem Browser gemerkt.</p>
              <button type="button" className="btn-secondary" onClick={() => { setVorlage(STANDARD_VORLAGE); try { window.localStorage.removeItem(VORLAGE_KEY); } catch { /* egal */ } }}>Standardtext</button>
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-navy-500">{fuelleVorlage(vorlage, { vorname: stapel.zettel[0]?.vorname ?? "Anna", kunde: kunde.name, monat: monatsName(monat), link: `${base}/e/m/…` })}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
