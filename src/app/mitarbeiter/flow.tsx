"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  employeeGate,
  employeeOverview,
  employeeSubmit,
  type EmployeeItem,
  type EmployeeOverview,
} from "./actions";

// fess.jobs Belegtool – Mitarbeiter-Flow:
// Intro (animiert) → Passwort → Name → Übersicht (Hero + Status) → Einreichen

function Wordmark() {
  return (
    <p className="text-xl font-bold tracking-tight">
      fess<span style={{ color: "#E8560F" }}>.jobs</span>
    </p>
  );
}

// Fotos vor dem Upload verkleinern (schneller, sicher fürs Auslesen)
const MAX_EDGE = 2576;
async function prepareFile(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    if (Math.max(width, height) <= MAX_EDGE && file.size < 2.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], "beleg.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

type Step = "intro" | "gate" | "name" | "home" | "form" | "done";

export function EmployeeFlow() {
  const [step, setStep] = useState<Step>("intro");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");
  const [overview, setOverview] = useState<EmployeeOverview | null>(null);
  const [doneNumber, setDoneNumber] = useState<string | null>(null);

  const loadOverview = useCallback(async (password: string, fullName: string) => {
    const res = await employeeOverview(password, fullName);
    if (res.ok) setOverview(res);
    return res.ok;
  }, []);

  // Wiederkehrende Nutzer: Passwort + Name aus localStorage, Intro überspringen
  useEffect(() => {
    const savedPw = localStorage.getItem("fess-pw");
    const savedName = localStorage.getItem("fess-name");
    if (savedPw && savedName) {
      loadOverview(savedPw, savedName).then((ok) => {
        if (ok) {
          setPw(savedPw);
          setName(savedName);
          setStep("home");
        } else {
          localStorage.removeItem("fess-pw");
        }
      });
    }
  }, [loadOverview]);

  if (step === "intro") return <Intro onDone={() => setStep("gate")} />;
  if (step === "gate")
    return (
      <Gate
        onOk={(password) => {
          setPw(password);
          localStorage.setItem("fess-pw", password);
          setStep("name");
        }}
      />
    );
  if (step === "name")
    return (
      <NameStep
        initial={name}
        onOk={async (fullName) => {
          setName(fullName);
          localStorage.setItem("fess-name", fullName);
          await loadOverview(pw, fullName);
          setStep("home");
        }}
      />
    );
  if (step === "form")
    return (
      <SubmitForm
        pw={pw}
        name={name}
        onBack={() => setStep("home")}
        onDone={async (receiptNumber) => {
          setDoneNumber(receiptNumber);
          await loadOverview(pw, name);
          setStep("done");
        }}
      />
    );
  if (step === "done")
    return (
      <Done
        receiptNumber={doneNumber}
        onNext={() => setStep("form")}
        onHome={() => setStep("home")}
      />
    );
  return (
    <Home
      name={name}
      overview={overview}
      onSubmit={() => setStep("form")}
      onSwitchName={() => setStep("name")}
    />
  );
}

// ── Intro: kurzes animiertes Erklär-Video (3 Szenen) ────────────────────────

const SCENES = [
  {
    title: "Beleg fotografieren",
    text: "Bon oder Rechnung einfach mit dem Handy abfotografieren – direkt nach dem Einsatz.",
  },
  {
    title: "Kurz ausfüllen",
    text: "Dein Name, der Einsatz und der Grund – dauert keine 30 Sekunden.",
  },
  {
    title: "Senden – fertig!",
    text: "Die Dispo bekommt alles automatisch. Den Status siehst du jederzeit hier.",
  },
];

function Intro({ onDone }: { onDone: () => void }) {
  const [scene, setScene] = useState(0);

  useEffect(() => {
    if (scene >= SCENES.length - 1) return;
    const t = setTimeout(() => setScene((s) => s + 1), 3000);
    return () => clearTimeout(t);
  }, [scene]);

  return (
    <div className="flex min-h-[85vh] flex-col">
      <div className="flex items-center justify-between">
        <Wordmark />
        <button type="button" className="text-sm font-medium" style={{ color: "rgba(26,22,19,0.45)" }} onClick={onDone}>
          Überspringen
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        {/* Szene-Illustration */}
        <div key={scene} className="relative mb-8 flex h-36 w-36 items-center justify-center">
          <span className="fess-intro-ring absolute inset-0 rounded-full" style={{ background: "rgba(232,86,15,0.25)" }} />
          <span className="fess-intro-icon relative flex h-24 w-24 items-center justify-center rounded-3xl text-white" style={{ background: "#E8560F" }}>
            {scene === 0 && (
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            )}
            {scene === 1 && (
              <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8M8 17h5" />
              </svg>
            )}
            {scene === 2 && (
              <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path className="fess-intro-check" d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </span>
        </div>

        {scene === 1 && (
          <div className="mb-6 w-48 space-y-2">
            <div className="fess-intro-line" style={{ animationDelay: "0.1s", width: "100%" }} />
            <div className="fess-intro-line" style={{ animationDelay: "0.3s", width: "75%" }} />
            <div className="fess-intro-line" style={{ animationDelay: "0.5s", width: "60%" }} />
          </div>
        )}

        <h1 key={`t-${scene}`} className="fess-fade-in text-2xl font-bold tracking-tight">
          {SCENES[scene].title}
        </h1>
        <p key={`p-${scene}`} className="fess-fade-in mt-2 max-w-xs text-sm" style={{ color: "rgba(26,22,19,0.55)" }}>
          {SCENES[scene].text}
        </p>

        {/* Fortschritts-Punkte */}
        <div className="mt-8 flex gap-2">
          {SCENES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Schritt ${i + 1}`}
              onClick={() => setScene(i)}
              className="h-2 rounded-full transition-all"
              style={{
                width: i === scene ? 24 : 8,
                background: i === scene ? "#E8560F" : "rgba(26,22,19,0.15)",
              }}
            />
          ))}
        </div>
      </div>

      <button type="button" className="fess-btn fess-btn-orange" onClick={onDone}>
        Los geht&apos;s
      </button>
    </div>
  );
}

// ── Passwort-Gate ────────────────────────────────────────────────────────────

function Gate({ onOk }: { onOk: (password: string) => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    const res = await employeeGate(value);
    setBusy(false);
    if (res.ok) onOk(value);
    else setError("Das Passwort stimmt nicht – frag kurz bei der Dispo nach.");
  }

  return (
    <div className="flex min-h-[85vh] flex-col">
      <Wordmark />
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="text-2xl font-bold tracking-tight">Team-Passwort</h1>
        <p className="mt-1 text-sm" style={{ color: "rgba(26,22,19,0.55)" }}>
          Das kurze Passwort hast du mit dem Link bekommen.
        </p>
        <input
          className="fess-input mt-6 text-center text-2xl font-bold tracking-[0.4em]"
          type="password"
          inputMode="numeric"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && value && check()}
          placeholder="•••"
        />
        {error && (
          <p className="mt-3 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(232,86,15,0.1)", color: "#C74708" }}>
            {error}
          </p>
        )}
      </div>
      <button type="button" disabled={busy || !value} className="fess-btn" onClick={check}>
        {busy ? "Prüfe …" : "Weiter"}
      </button>
    </div>
  );
}

// ── Name ─────────────────────────────────────────────────────────────────────

function NameStep({ initial, onOk }: { initial: string; onOk: (name: string) => void }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function next() {
    if (!value.trim()) return;
    setBusy(true);
    await onOk(value.trim());
  }

  return (
    <div className="flex min-h-[85vh] flex-col">
      <Wordmark />
      <div className="flex flex-1 flex-col justify-center">
        <h1 className="text-2xl font-bold tracking-tight">Moin! Wie heißt du?</h1>
        <p className="mt-1 text-sm" style={{ color: "rgba(26,22,19,0.55)" }}>
          Voller Name – so weiß die Dispo sofort, von wem der Beleg ist, und du siehst
          deinen Erstattungsstatus.
        </p>
        <input
          className="fess-input mt-6"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && next()}
          placeholder="Vor- und Nachname"
          autoComplete="name"
        />
      </div>
      <button type="button" disabled={busy || !value.trim()} className="fess-btn" onClick={next}>
        {busy ? "Lade …" : "Weiter"}
      </button>
    </div>
  );
}

// ── Übersicht (Hero + Status-Liste) ──────────────────────────────────────────

function Home({
  name,
  overview,
  onSubmit,
  onSwitchName,
}: {
  name: string;
  overview: EmployeeOverview | null;
  onSubmit: () => void;
  onSwitchName: () => void;
}) {
  const [filter, setFilter] = useState<"alle" | "pruefung" | "erstattet" | "abgelehnt">("alle");
  const items = (overview?.items ?? []).filter((i) => filter === "alle" || i.status === filter);
  const firstName = name.split(/\s+/)[0] || name;
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Wordmark />
        <button
          type="button"
          onClick={onSwitchName}
          title="Name ändern"
          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: "#1A1613" }}
        >
          {initials || "?"}
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Moin {firstName}</h1>
        <p className="text-sm" style={{ color: "rgba(26,22,19,0.55)" }}>
          Deine Auslagen im Überblick
        </p>
      </div>

      {/* Hero: offene Erstattung */}
      <div className="fess-hero p-5">
        <div className="flex items-start justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.8)" }}>
            Offene Erstattung
          </p>
          {(overview?.openCount ?? 0) > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "rgba(255,255,255,0.2)" }}>
              {overview?.openCount} in Prüfung
            </span>
          )}
        </div>
        <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight">{overview?.openAmount ?? "0,00 €"}</p>
        <div className="mt-4 flex gap-6 text-sm">
          <div>
            <p className="font-semibold tabular-nums">{overview?.reimbursedAmount ?? "0,00 €"}</p>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.75)" }}>erstattet</p>
          </div>
          <div>
            <p className="font-semibold tabular-nums">{overview?.totalCount ?? 0}</p>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.75)" }}>Belege gesamt</p>
          </div>
        </div>
      </div>

      {/* Die eine Aktion */}
      <button type="button" className="fess-btn" onClick={onSubmit}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <path d="M12 8v8M8 12h8" />
        </svg>
        Beleg einreichen
      </button>

      {/* Filter */}
      <div className="flex gap-2">
        {(
          [
            { v: "alle", l: "Alle" },
            { v: "pruefung", l: "In Prüfung" },
            { v: "erstattet", l: "Erstattet" },
            { v: "abgelehnt", l: "Abgelehnt" },
          ] as const
        ).map((f) => (
          <button
            key={f.v}
            type="button"
            onClick={() => setFilter(f.v)}
            className="rounded-full px-3.5 py-1.5 text-sm font-medium transition"
            style={
              filter === f.v
                ? { background: "#1A1613", color: "#fff" }
                : { background: "transparent", border: "1.5px solid rgba(26,22,19,0.14)", color: "rgba(26,22,19,0.6)" }
            }
          >
            {f.l}
          </button>
        ))}
      </div>

      {/* Beleg-Liste */}
      <div className="space-y-2.5">
        {items.length === 0 ? (
          <div className="fess-card p-6 text-center text-sm" style={{ color: "rgba(26,22,19,0.5)" }}>
            {overview?.items?.length
              ? "Nichts in dieser Ansicht."
              : "Noch keine Belege – reich deinen ersten ein!"}
          </div>
        ) : (
          items.map((item) => <ReceiptRow key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}

function ReceiptRow({ item }: { item: EmployeeItem }) {
  const initials = (item.einsatz || item.title)
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <div className="fess-card p-3.5">
    <div className="flex items-center gap-3">
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
        style={{ background: "rgba(26,22,19,0.06)", color: "rgba(26,22,19,0.6)" }}
      >
        {initials || "B"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.title}</p>
        <p className="truncate text-xs" style={{ color: "rgba(26,22,19,0.45)" }}>
          {item.einsatz ? `${item.einsatz} · ` : ""}{item.date}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-bold tabular-nums">{item.amount}</p>
        <span
          className={`fess-chip ${
            item.status === "erstattet"
              ? "fess-chip-erstattet"
              : item.status === "abgelehnt"
                ? "fess-chip-abgelehnt"
                : "fess-chip-pruefung"
          }`}
        >
          {item.status === "erstattet" ? "Erstattet" : item.status === "abgelehnt" ? "Abgelehnt" : "In Prüfung"}
        </span>
      </div>
    </div>
    {item.status === "abgelehnt" && (
      <p className="mt-2 rounded-lg px-2.5 py-1.5 text-xs" style={{ background: "rgba(220,60,60,.08)", color: "#b3362c" }}>
        {item.comment
          ? `Hinweis vom Team: ${item.comment}`
          : "Dieser Beleg wurde abgelehnt – bitte melde dich kurz beim Team."}
      </p>
    )}
    </div>
  );
}

// ── Einreichen-Formular ──────────────────────────────────────────────────────

function SubmitForm({
  pw,
  name,
  onBack,
  onDone,
}: {
  pw: string;
  name: string;
  onBack: () => void;
  onDone: (receiptNumber: string | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [auftrag, setAuftrag] = useState("");
  const [grund, setGrund] = useState("");
  const [zahlungsart, setZahlungsart] = useState<"BAR" | "PRIVATE_KARTE">("PRIVATE_KARTE");
  const [erhalten, setErhalten] = useState<"ERHALTEN" | "AUSSTEHEND">("AUSSTEHEND");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setError(null);
    if (f.type.startsWith("image/")) setPreview(URL.createObjectURL(f));
    else setPreview(null);
  }

  async function submit() {
    setError(null);
    if (!file) return setError("Bitte einen Beleg fotografieren oder wählen.");
    if (!auftrag.trim()) return setError("Bitte den Einsatz / Auftrag eingeben.");
    if (!grund.trim()) return setError("Bitte kurz den Grund eingeben.");
    setBusy(true);
    try {
      const prepared = await prepareFile(file);
      const fd = new FormData();
      fd.append("file", prepared);
      fd.append("name", name);
      fd.append("auftrag", auftrag.trim());
      fd.append("grund", grund.trim());
      fd.append("zahlungsart", zahlungsart);
      fd.append("erhalten", erhalten);
      const res = await employeeSubmit(pw, fd);
      if (res.ok) {
        onDone(res.receiptNumber ?? null);
        return;
      }
      setError(res.error ?? "Senden fehlgeschlagen.");
    } catch {
      setError("Senden fehlgeschlagen – bitte nochmal versuchen.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm font-medium" style={{ color: "rgba(26,22,19,0.55)" }}>
          ← Zurück
        </button>
        <Wordmark />
      </div>

      <h1 className="text-2xl font-bold tracking-tight">Beleg einreichen</h1>

      {/* Beleg */}
      {preview ? (
        <div className="fess-card overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Beleg" className="max-h-64 w-full object-contain" style={{ background: "rgba(26,22,19,0.04)" }} />
          <button type="button" className="w-full py-2.5 text-sm font-medium" style={{ color: "rgba(26,22,19,0.55)", borderTop: "1px solid rgba(26,22,19,0.07)" }} onClick={() => { setFile(null); setPreview(null); }}>
            Anderes Foto
          </button>
        </div>
      ) : file ? (
        <div className="fess-card flex items-center justify-between p-4 text-sm">
          <span className="truncate font-medium">{file.name}</span>
          <button type="button" className="underline" style={{ color: "rgba(26,22,19,0.55)" }} onClick={() => setFile(null)}>ändern</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className="fess-btn fess-btn-orange !py-6" onClick={() => cameraRef.current?.click()}>
            <span className="flex flex-col items-center gap-1.5 text-sm">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              Foto machen
            </span>
          </button>
          <button type="button" className="fess-btn fess-btn-ghost !py-6" onClick={() => fileRef.current?.click()}>
            <span className="flex flex-col items-center gap-1.5 text-sm">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              Datei wählen
            </span>
          </button>
        </div>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      <div className="fess-card space-y-4 p-4">
        <div>
          <label className="fess-label">Einsatz / Auftrag</label>
          <input className="fess-input" value={auftrag} onChange={(e) => setAuftrag(e.target.value)} placeholder="z. B. Rock am Ring, Messe InterGem" />
        </div>
        <div>
          <label className="fess-label">Grund der Ausgabe</label>
          <input className="fess-input" value={grund} onChange={(e) => setGrund(e.target.value)} placeholder="z. B. Bahnticket zur Anreise" />
        </div>
        <div>
          <label className="fess-label">Wie bezahlt?</label>
          <div className="flex gap-2">
            <button type="button" className="fess-choice" data-active={zahlungsart === "BAR"} onClick={() => setZahlungsart("BAR")}>
              Bar
            </button>
            <button type="button" className="fess-choice" data-active={zahlungsart === "PRIVATE_KARTE"} onClick={() => setZahlungsart("PRIVATE_KARTE")}>
              Eigene Karte
            </button>
          </div>
        </div>
        <div>
          <label className="fess-label">Geld schon zurückbekommen?</label>
          <div className="flex gap-2">
            <button type="button" className="fess-choice" data-active={erhalten === "AUSSTEHEND"} onClick={() => setErhalten("AUSSTEHEND")}>
              Noch offen
            </button>
            <button type="button" className="fess-choice" data-active={erhalten === "ERHALTEN"} onClick={() => setErhalten("ERHALTEN")}>
              Schon erhalten
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(232,86,15,0.1)", color: "#C74708" }}>
          {error}
        </p>
      )}

      <button type="button" disabled={busy} className="fess-btn fess-btn-orange" onClick={submit}>
        {busy ? "Wird gesendet …" : "Absenden"}
      </button>
      <p className="text-center text-xs" style={{ color: "rgba(26,22,19,0.4)" }}>
        Eingereicht als {name}
      </p>
    </div>
  );
}

// ── Erfolg ───────────────────────────────────────────────────────────────────

function Done({
  receiptNumber,
  onNext,
  onHome,
}: {
  receiptNumber: string | null;
  onNext: () => void;
  onHome: () => void;
}) {
  return (
    <div className="flex min-h-[85vh] flex-col">
      <Wordmark />
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="fess-intro-icon flex h-24 w-24 items-center justify-center rounded-full text-white" style={{ background: "#1E8A5B" }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path className="fess-intro-check" d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h1 className="mt-6 text-2xl font-bold tracking-tight">Beleg ist drin!</h1>
        <p className="mt-2 max-w-xs text-sm" style={{ color: "rgba(26,22,19,0.55)" }}>
          {receiptNumber ? `Belegnummer ${receiptNumber} · ` : ""}Die Dispo hat ihn erhalten –
          den Status siehst du in deiner Übersicht.
        </p>
      </div>
      <div className="space-y-3">
        <button type="button" className="fess-btn" onClick={onNext}>
          Nächsten Beleg einreichen
        </button>
        <button type="button" className="fess-btn fess-btn-ghost" onClick={onHome}>
          Zur Übersicht
        </button>
      </div>
    </div>
  );
}
