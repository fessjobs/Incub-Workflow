"use client";
// Mitarbeiterlink: Anmeldung per WhatsApp-Code (simuliert), Startseite, Profil.
import { useState, type ReactNode } from "react";
import { Link, gehe } from "../nav";
import { usePv, selbst, HEUTE } from "../state/store";
import { Bar, Btn, Chip, Karte, LinkBtn, Modal, Note, Offen, Seg, ladeTextHerunter } from "../ui/kit";
import type { FreigabeAnzeige } from "../logic/freigabe";
import { fortschritt } from "../logic/profil";
import { levelFuer } from "../logic/xp";
import { MODULE } from "../data/trainings";
import { statusFuer } from "../logic/unterweisung";
import { formatDatumDE } from "../logic/zeit";
import type { Lang } from "../logic/types";
import { handyGueltig } from "../logic/profil";

export function SpracheSchalter() {
  const { s, set } = usePv();
  return <Seg<Lang> wert={s.lang} onChange={(l) => set((st) => ({ ...st, lang: l }))} optionen={[{ wert: "de", label: "DE" }, { wert: "en", label: "EN" }]} />;
}

export function CrewGate({ children }: { children: ReactNode }) {
  const { s, geladen } = usePv();
  if (!geladen) return <div className="muted small">…</div>;
  if (!s.eingeloggt) {
    return (
      <Karte>
        <h2>{s.lang === "de" ? "Bitte anmelden" : "Please sign in"}</h2>
        <p className="muted mt1">{s.lang === "de" ? "Dieser Bereich ist nur mit Anmeldung sichtbar." : "This area needs a sign-in."}</p>
        <div className="mt2"><LinkBtn href="/crew" block>{s.lang === "de" ? "Zur Anmeldung" : "Sign in"}</LinkBtn></div>
      </Karte>
    );
  }
  return <>{children}</>;
}

// Hinweis, solange das Team die Aufträge noch nicht freigeschaltet hat
export function FreigabeHinweis({ status, de, aktualisieren }: { status: FreigabeAnzeige; de: boolean; aktualisieren?: () => Promise<void> }) {
  if (status === "freigegeben") return null;
  const text: Record<Exclude<FreigabeAnzeige, "freigegeben">, [string, string]> = {
    offen: ["Die Aufträge schaltet das Team frei, sobald du den Fragebogen und die Grund-Unterweisung gemacht hast.", "The team unlocks the jobs once you have completed the questionnaire and the basic safety briefing."],
    wartet: ["Danke! Das Team prüft deine Angaben und schaltet die Aufträge für dich frei. Du bekommst Bescheid.", "Thank you! The team is reviewing your details and will unlock the jobs for you. We will let you know."],
    abgelehnt: ["Zurzeit können wir dir keine Aufträge freischalten. Bei Fragen melde dich bitte bei FESS.", "We cannot unlock jobs for you at the moment. Please contact FESS if you have questions."],
  };
  return (
    <Note ton={status === "abgelehnt" ? "warn" : undefined}>
      <span data-testid="freigabe-hinweis" data-status={status}>{text[status][de ? 0 : 1]}</span>
      {aktualisieren && status !== "abgelehnt" ? <div className="mt1"><Btn v="sec" groesse="sm" onClick={() => void aktualisieren()} data-testid="freigabe-pruefen">{de ? "Status prüfen" : "Check status"}</Btn></div> : null}
    </Note>
  );
}

export function CrewStart() {
  const { s, set, melde, geladen, aktualisieren } = usePv();
  const de = s.lang === "de";
  const ich = selbst(s);
  const [handy, setHandy] = useState("0151 0000 9001");
  const [codeGesendet, setCodeGesendet] = useState(false);
  const [code, setCode] = useState("");
  const [zustimmung, setZustimmung] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  if (!geladen) return null;

  if (!s.eingeloggt) {
    return (
      <div className="col gap3">
        <div className="pv-hero" style={{ borderRadius: 18 }}>
          <div className="eyebrow">fess.jobs</div>
          <h1 className="mt1" style={{ fontSize: "2.2rem" }}>{de ? "Jobs im Event. Dein Link." : "Event jobs. Your link."}</h1>
          <p className="mt2" style={{ opacity: 0.9, maxWidth: 260 }}>{de ? "Bewirb dich in einer Minute, mach die Unterweisung am Handy und sieh, wo du eingeteilt bist." : "Apply in a minute, do the safety briefing on your phone and see where you are scheduled."}</p>
        </div>
        <Karte>
          <div className="row between"><h3>{de ? "Anmelden" : "Sign in"}</h3><SpracheSchalter /></div>
          <label className="pv-label mt2" htmlFor="handy">{de ? "Handynummer" : "Mobile number"}</label>
          <input id="handy" className="pv-input" inputMode="tel" value={handy} onChange={(e) => setHandy(e.target.value)} />
          {!codeGesendet ? (
            <>
              <label className="pv-check mt2"><input type="checkbox" checked={zustimmung} onChange={(e) => setZustimmung(e.target.checked)} data-testid="dsgvo" /><span>{de ? "Ich bin einverstanden, dass fess.jobs meine Angaben zur Vermittlung speichert. Details in der Datenschutzerklärung." : "I agree that fess.jobs stores my details for job matching. See the privacy notice."}</span></label>
              {fehler ? <div className="pv-error">{fehler}</div> : null}
              <Btn block className="mt2" data-testid="code-senden" onClick={() => {
                if (!handyGueltig(handy)) return setFehler(de ? "Bitte eine gültige Handynummer eingeben." : "Please enter a valid mobile number.");
                if (!zustimmung) return setFehler(de ? "Bitte der Datenspeicherung zustimmen." : "Please agree to the data storage.");
                setFehler(null);
                setCodeGesendet(true);
                setCode("482913");
                melde(de ? "Prototyp: Der Code kommt im echten System per WhatsApp." : "Prototype: the code would arrive via WhatsApp.");
              }}>{de ? "Code per WhatsApp senden" : "Send code via WhatsApp"}</Btn>
            </>
          ) : (
            <>
              <label className="pv-label mt2" htmlFor="code">{de ? "6-stelliger Code" : "6-digit code"}</label>
              <input id="code" className="pv-input mono" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} />
              <div className="pv-hint">{de ? "Im Prototyp ist der Code vorausgefüllt." : "In the prototype the code is prefilled."}</div>
              <Btn block className="mt2" data-testid="anmelden" onClick={() => {
                if (code.trim().length !== 6) return setFehler(de ? "Der Code hat 6 Ziffern." : "The code has 6 digits.");
                set((st) => ({ ...st, eingeloggt: true, dsgvo: true }));
              }}>{de ? "Anmelden" : "Sign in"}</Btn>
              {fehler ? <div className="pv-error">{fehler}</div> : null}
            </>
          )}
        </Karte>
        <Note>{de ? "Kein Passwort nötig. Der Code läuft nach 10 Minuten ab." : "No password needed. The code expires after 10 minutes."}</Note>
      </div>
    );
  }

  const fb = fortschritt(s.antworten);
  const anteil = s.fragebogenFertig ? 1 : fb.beantwortet / fb.gesamt;
  const lv = levelFuer(ich.xp, s.einst.xp);
  const offeneUW = MODULE.filter((m) => statusFuer(ich.unterweisungen[m.id], HEUTE) === "fehlt").length;
  const meine = s.bewerbungen.filter((a) => a.pnr === ich.pnr);
  return (
    <div className="col gap3">
      <div>
        <div className="eyebrow">{de ? "Willkommen" : "Welcome"}</div>
        <h1>{de ? `Hallo ${ich.vorname}` : `Hi ${ich.vorname}`}</h1>
      </div>

      <Karte>
        <div className="row between"><h3>{de ? "So geht es los" : "Getting started"}</h3><SpracheSchalter /></div>
        <ol className="col mt2" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li>
            <Link href="/crew/fragebogen" className="row" style={{ textDecoration: "none" }}>
              <span className="pv-ic">{s.fragebogenFertig ? "✓" : "1"}</span>
              <span className="grow"><b>{de ? "Fragebogen" : "Questionnaire"}</b><div className="small muted">{s.fragebogenFertig ? (de ? "abgeschickt – danke!" : "sent – thank you!") : de ? `${fb.beantwortet} von ${fb.gesamt} Fragen · ca. 8 Minuten` : `${fb.beantwortet} of ${fb.gesamt} questions · about 8 minutes`}</div><Bar anteil={anteil} ton={s.fragebogenFertig ? "gut" : undefined} /></span>
            </Link>
          </li>
          <li className="mt2">
            <Link href="/crew/unterweisung" className="row" style={{ textDecoration: "none" }}>
              <span className="pv-ic">{offeneUW === 0 ? "✓" : "2"}</span>
              <span className="grow"><b>{de ? "Unterweisung" : "Safety briefing"}</b><div className="small muted">{offeneUW === 0 ? (de ? "alles gültig" : "all valid") : de ? `${offeneUW} Module offen · je ca. 3 Minuten` : `${offeneUW} modules open · about 3 minutes each`}</div></span>
            </Link>
          </li>
          <li className="mt2">
            <Link href="/crew/jobs" className="row" style={{ textDecoration: "none" }}>
              <span className="pv-ic">{s.meineFreigabe === "freigegeben" ? "3" : "🔒"}</span>
              <span className="grow"><b>{de ? "Job finden und bewerben" : "Find a job and apply"}</b><div className="small muted">{s.meineFreigabe !== "freigegeben" ? (s.meineFreigabe === "wartet" ? (de ? "wartet auf Freischaltung durch das Team" : "waiting for the team to unlock") : de ? "wird nach Fragebogen und Unterweisung freigeschaltet" : "unlocked after questionnaire and briefing") : de ? `${s.jobs.filter((j) => j.status === "offen").length} offene Jobs` : `${s.jobs.filter((j) => j.status === "offen").length} open jobs`}</div></span>
            </Link>
          </li>
        </ol>
      </Karte>

      {s.meineFreigabe !== "freigegeben" ? <FreigabeHinweis status={s.meineFreigabe} de={de} aktualisieren={aktualisieren} /> : null}

      <Karte>
        <div className="row between"><h3>Level</h3><Chip ton="orange">{lv.name}</Chip></div>
        <div className="mono small mt1">{ich.xp} XP</div>
        <Bar anteil={lv.fortschritt} />
        <div className="tiny muted mt1">{lv.naechstes ? (de ? `Noch ${lv.naechstes.fehlend} XP bis ${lv.naechstes.name}. XP gibt es für Einsätze, Pünktlichkeit und gute Bewertungen.` : `${lv.naechstes.fehlend} XP to ${lv.naechstes.name}. You earn XP for jobs, punctuality and good ratings.`) : ""}</div>
      </Karte>

      {meine.length > 0 ? (
        <Karte titel={de ? "Meine Bewerbungen" : "My applications"}>
          <div className="col">
            {meine.map((a) => {
              const job = s.jobs.find((j) => j.id === a.jobId);
              return (
                <Link key={a.id} href={`/crew/jobs/${a.jobId}`} className="row between" style={{ textDecoration: "none" }}>
                  <span><b>{job?.titel}</b><div className="tiny muted">{job ? formatDatumDE(job.datumVon) : ""}</div></span>
                  <Chip ton={a.status === "bestätigt" ? "gut" : a.status === "abgelehnt" ? "err" : "info"}>{statusText(a.status, de)}</Chip>
                </Link>
              );
            })}
          </div>
        </Karte>
      ) : null}
    </div>
  );
}

export function statusText(st: string, de: boolean): string {
  const m: Record<string, [string, string]> = { neu: ["eingegangen", "received"], passt: ["in Prüfung", "under review"], Warteliste: ["Warteliste", "waitlist"], abgelehnt: ["leider nicht", "not this time"], "bestätigt": ["bestätigt", "confirmed"] };
  return (m[st] ?? [st, st])[de ? 0 : 1];
}

export function CrewProfil() {
  const { s, set, melde, reset, abmelden } = usePv();
  const de = s.lang === "de";
  const ich = selbst(s);
  const [loeschen, setLoeschen] = useState(false);
  const lv = levelFuer(ich.xp, s.einst.xp);
  const gueltig = MODULE.filter((m) => ["gueltig", "laeuftBaldAb"].includes(statusFuer(ich.unterweisungen[m.id], HEUTE))).length;
  return (
    <div className="col gap3">
      <div className="row between"><h1>{de ? "Profil" : "Profile"}</h1><SpracheSchalter /></div>
      <Karte>
        <div className="row"><span className="pvd-score" style={{ minWidth: 0 }}>{ich.vorname[0]}{ich.nachname[0]}</span><div><b>{ich.vorname} {ich.nachname}</b><div className="small muted">{ich.telefon} · {ich.plz} {ich.wohnort}</div></div></div>
        <div className="row wrap mt2"><Chip ton="orange">{lv.name}</Chip><Chip mono>{ich.xp} XP</Chip><Chip ton={gueltig === MODULE.length ? "gut" : "warn"}>{de ? `Unterweisung ${gueltig}/${MODULE.length}` : `Briefing ${gueltig}/${MODULE.length}`}</Chip></div>
        <div className="tiny muted mt2">{de ? "Weitere Angaben wie dein Score sind nur für das Team sichtbar." : "Further details such as scores are visible to the team only."}</div>
      </Karte>
      <Karte titel={de ? "Fragebogen" : "Questionnaire"}>
        <p className="small">{s.fragebogenFertig ? (de ? "Abgeschickt. Du kannst deine Angaben jederzeit ändern." : "Sent. You can change your answers any time.") : de ? "Noch nicht abgeschickt." : "Not sent yet."}</p>
        <div className="mt2"><LinkBtn href="/crew/fragebogen" v="sec" block>{s.fragebogenFertig ? (de ? "Angaben ändern" : "Edit answers") : de ? "Fragebogen ausfüllen" : "Fill in questionnaire"}</LinkBtn></div>
      </Karte>
      <Karte titel={de ? "Meine Daten (DSGVO)" : "My data (GDPR)"}>
        <p className="small">{de ? "Du kannst deine Daten jederzeit einsehen und löschen lassen." : "You can view and delete your data any time."}</p>
        <div className="row wrap mt2">
          <Btn v="sec" groesse="sm" onClick={() => { ladeTextHerunter("meine-daten.json", JSON.stringify({ name: `${ich.vorname} ${ich.nachname}`, telefon: ich.telefon, plz: ich.plz, wohnort: ich.wohnort, antworten: s.fragebogenFertig ? s.antworten : null, unterweisungen: ich.unterweisungen }, null, 2), "application/json;charset=utf-8"); melde(de ? "Daten als Datei geladen." : "Data downloaded."); }}>{de ? "Daten herunterladen" : "Download my data"}</Btn>
          <Btn v="danger" groesse="sm" onClick={() => setLoeschen(true)}>{de ? "Daten löschen" : "Delete my data"}</Btn>
        </div>
        <div className="mt2"><Offen nr={17}>{de ? "Bewerber ohne Einsatz werden nach 6 Monaten zum Löschen gemeldet" : "Applicants without a job are flagged for deletion after 6 months"}</Offen></div>
      </Karte>
      <Btn v="ghost" block onClick={() => { if (abmelden) return abmelden(); set((st) => ({ ...st, eingeloggt: false })); gehe("/crew"); }}>{de ? "Abmelden" : "Sign out"}</Btn>

      {loeschen ? (
        <Modal titel={de ? "Daten wirklich löschen?" : "Delete your data?"} onClose={() => setLoeschen(false)} fuss={<><Btn v="sec" onClick={() => setLoeschen(false)}>{de ? "Abbrechen" : "Cancel"}</Btn><Btn v="danger" data-testid="loeschen-ok" onClick={() => { reset(); setLoeschen(false); gehe("/crew"); melde(de ? "Alle Angaben gelöscht (Prototyp: zurück auf Anfang)." : "All data deleted (prototype: back to start)."); }}>{de ? "Ja, löschen" : "Yes, delete"}</Btn></>}>
          <p>{de ? "Fragebogen, Bewerbungen und Unterweisungsnachweise werden entfernt. Das geht nicht rückgängig." : "Questionnaire, applications and briefing records are removed. This cannot be undone."}</p>
          <div className="small muted mt2">{de ? "Aufbewahrungspflichtige Unterlagen (z. B. Stundennachweise) bleiben nach den gesetzlichen Fristen erhalten." : "Records we are legally required to keep (e.g. timesheets) are kept for the statutory period."}</div>
        </Modal>
      ) : null}
      <div className="tiny muted">{HEUTE}</div>
    </div>
  );
}
