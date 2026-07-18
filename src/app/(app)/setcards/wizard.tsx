"use client";

// Setcard-Wizard: Unterlagen/Freitext → Personendaten → Firma → Einsatzbereich
// → Live-Vorschau (editierbar) → PDF speichern.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SetcardData, SetcardTheme, SetcardExperience } from "@/lib/setcard/themes";
import { SetcardPreview } from "./setcard-preview";
import {
  extractPersonAction,
  savePersonAction,
  loadPersonAction,
  previewSetcardAction,
  saveSetcardAction,
  type PersonInput,
} from "./actions";

type CompanyOpt = { id: string; brandName: string; shortCode: string; color: string | null };
type PersonOpt = { id: string; name: string };

// Foto clientseitig verkleinern (Setcard braucht kein 12-MP-Bild)
async function resizePhoto(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const max = 700;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.86);
  } catch {
    return null;
  }
}

const EMPTY_FORM = {
  firstName: "",
  lastName: "",
  age: "" as string,
  city: "",
  region: "",
  phone: "",
  email: "",
  languages: "",
  mobility: "",
  profileText: "",
  experiencesText: "", // "Zeitraum | Titel | Firma | Details" je Zeile
  qualificationsText: "",
  skillsText: "",
};

function experiencesFromText(text: string): SetcardExperience[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [period = "", title = "", company = "", details = ""] = l.split("|").map((s) => s.trim());
      return { period, title, company, details: details || undefined };
    })
    .filter((e) => e.title || e.period);
}

function experiencesToText(list: SetcardExperience[]): string {
  return list.map((e) => [e.period, e.title, e.company, e.details ?? ""].join(" | ")).join("\n");
}

const linesFrom = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);
const splitChips = (t: string) => t.split(/[,\n]/).map((l) => l.trim()).filter(Boolean);

export function SetcardWizard({
  companies,
  persons,
  themes,
  aiAvailable,
  initialPersonId,
}: {
  companies: CompanyOpt[];
  persons: PersonOpt[];
  themes: Record<string, SetcardTheme>;
  aiAvailable: boolean;
  initialPersonId?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Schritt 1: Quellen
  const [files, setFiles] = useState<File[]>([]);
  const [freetext, setFreetext] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Schritt 2: Personendaten
  const [personId, setPersonId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [photo, setPhoto] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  // Schritt 3: Firma + Einsatzbereich
  const [companyId, setCompanyId] = useState("");
  const [bereich, setBereich] = useState("");
  const [hinweise, setHinweise] = useState("");

  // Schritt 4: Vorschau
  const [data, setData] = useState<SetcardData | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const company = companies.find((c) => c.id === companyId) ?? null;
  const theme = company ? themes[company.shortCode] : null;

  // Direkteinstieg aus dem Personal-Stamm ("Setcard erstellen")
  useEffect(() => {
    if (initialPersonId) loadExisting(initialPersonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPersonId]);

  async function runExtract() {
    setError(null);
    setBusy(true);
    setInfo(null);
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    fd.append("freetext", freetext);
    const res = await extractPersonAction(fd);
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Auslesen fehlgeschlagen.");
      return;
    }
    const d = res.data;
    setForm({
      firstName: d.firstName ?? "",
      lastName: d.lastName ?? "",
      age: d.age ? String(d.age) : "",
      city: d.city ?? "",
      region: d.region ?? "",
      phone: d.phone ?? "",
      email: d.email ?? "",
      languages: d.languages ?? "",
      mobility: d.mobility ?? "",
      profileText: d.profileText ?? "",
      experiencesText: experiencesToText(d.experiences),
      qualificationsText: d.qualifications.join("\n"),
      skillsText: d.skills.join(", "),
    });
    setPersonId(null);
    setInfo("Daten ausgelesen – bitte prüfen und ergänzen. Die Unterlagen selbst werden nicht gespeichert.");
    setStep(2);
  }

  async function loadExisting(id: string) {
    if (!id) return;
    setBusy(true);
    const res = await loadPersonAction(id);
    setBusy(false);
    if (!res.ok || !res.person) return;
    const p = res.person;
    setPersonId(p.id);
    setForm({
      firstName: p.firstName,
      lastName: p.lastName,
      age: p.age ? String(p.age) : "",
      city: p.city ?? "",
      region: p.region ?? "",
      phone: p.phone ?? "",
      email: p.email ?? "",
      languages: p.languages ?? "",
      mobility: p.mobility ?? "",
      profileText: p.profileText ?? "",
      experiencesText: experiencesToText(p.experiences),
      qualificationsText: p.qualifications.join("\n"),
      skillsText: p.skills.join(", "),
    });
    if (p.photoDataUrl) setPhoto(p.photoDataUrl);
    setInfo(p.hasPhoto ? "Bekannte Person geladen (Foto vorhanden)." : "Bekannte Person geladen.");
    setStep(2);
  }

  function buildPersonInput(): PersonInput {
    return {
      firstName: form.firstName,
      lastName: form.lastName,
      age: form.age ? Number(form.age) : null,
      city: form.city || null,
      region: form.region || null,
      phone: form.phone || null,
      email: form.email || null,
      languages: form.languages || null,
      mobility: form.mobility || null,
      profileText: form.profileText || null,
      experiences: experiencesFromText(form.experiencesText),
      qualifications: linesFrom(form.qualificationsText),
      skills: splitChips(form.skillsText),
      photoDataUrl: photo,
    };
  }

  async function savePersonAndNext() {
    setError(null);
    setBusy(true);
    const res = await savePersonAction(personId, buildPersonInput());
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    setPersonId(res.personId ?? null);
    setStep(3);
  }

  async function makePreview(withHints: boolean) {
    if (!personId || !companyId || !bereich.trim()) {
      setError("Bitte Firma und Einsatzbereich wählen.");
      return;
    }
    setError(null);
    setBusy(true);
    const res = await previewSetcardAction(personId, companyId, bereich.trim(), withHints && hinweise.trim() ? hinweise.trim() : null);
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "Vorschau fehlgeschlagen.");
      return;
    }
    setData(res.data);
    setSavedId(null);
    setInfo(res.reused ? "Aus früherer Setcard übernommen (Mitlernen) – anpassbar." : res.aiUsed ? "Von der KI auf den Einsatzbereich zugeschnitten." : "Ohne KI erstellt (Basisdaten).");
    setStep(4);
  }

  async function save() {
    if (!personId || !companyId || !data) return;
    setError(null);
    setBusy(true);
    const res = await saveSetcardAction(personId, companyId, bereich.trim(), data);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Speichern fehlgeschlagen.");
      return;
    }
    setSavedId(res.setcardId ?? null);
    router.refresh();
  }

  const stepTitles = ["Daten einlesen", "Person prüfen", "Firma & Einsatz", "Vorschau & PDF"];

  return (
    <div className="space-y-6">
      {/* Schritt-Leiste */}
      <div className="flex flex-wrap gap-2">
        {stepTitles.map((t, i) => (
          <span
            key={t}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
              step === i + 1
                ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900"
                : step > i + 1
                  ? "border-emerald-500 text-emerald-700 dark:text-emerald-300"
                  : "border-navy-200 text-navy-400 dark:border-navy-700"
            }`}
          >
            {step > i + 1 ? "✓" : `${i + 1}.`} {t}
          </span>
        ))}
      </div>

      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{info}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}

      {/* ── Schritt 1: Quellen ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="card space-y-4 p-5">
            <div>
              <p className="label">Bekannte Person (Personal-Stamm)</p>
              <select className="input max-w-sm" defaultValue="" onChange={(e) => loadExisting(e.target.value)}>
                <option value="">– neue Person erfassen –</option>
                {persons.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-navy-400">Bereits erfasste Personen sind vorbefüllt – direkt zu Schritt 2.</p>
            </div>
            <div className="border-t border-navy-100 pt-4 dark:border-navy-800">
              <p className="label">Unterlagen (Lebenslauf, Ausweis, Screenshots – werden nur ausgelesen, nicht gespeichert)</p>
              <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()}>
                + Dateien wählen (JPG, PNG, PDF)
              </button>
              <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={(e) => setFiles([...files, ...Array.from(e.target.files ?? [])])} />
              {files.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="truncate">{f.name}</span>
                      <button type="button" className="text-xs text-red-500 underline" onClick={() => setFiles(files.filter((_, j) => j !== i))}>entfernen</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="label">Oder Freitext / Notizen einfügen</p>
              <textarea className="input min-h-28" value={freetext} onChange={(e) => setFreetext(e.target.value)} placeholder="z. B. WhatsApp-Text der Person, Notizen aus dem Telefonat, kopierter Lebenslauf …" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={busy || (!files.length && !freetext.trim()) || !aiAvailable} className="btn-primary" onClick={runExtract}>
              {busy ? "Liest aus …" : "Auslesen & weiter"}
            </button>
            <button type="button" className="btn-secondary" onClick={() => { setInfo(null); setStep(2); }}>
              Ohne Auslesen manuell eintragen
            </button>
          </div>
          {!aiAvailable && <p className="text-xs text-amber-600">Automatisches Auslesen inaktiv (ANTHROPIC_API_KEY fehlt) – manuell eintragen.</p>}
        </div>
      )}

      {/* ── Schritt 2: Personendaten ── */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="card grid gap-4 p-5 sm:grid-cols-2">
            <div><p className="label">Vorname *</p><input className="input" value={form.firstName} onChange={(e) => set({ firstName: e.target.value })} /></div>
            <div><p className="label">Nachname *</p><input className="input" value={form.lastName} onChange={(e) => set({ lastName: e.target.value })} /></div>
            <div><p className="label">Alter</p><input className="input" inputMode="numeric" value={form.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, "") })} /></div>
            <div><p className="label">Wohnort</p><input className="input" value={form.city} onChange={(e) => set({ city: e.target.value })} /></div>
            <div><p className="label">Region / Bundesland</p><input className="input" value={form.region} onChange={(e) => set({ region: e.target.value })} /></div>
            <div><p className="label">Telefon</p><input className="input" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
            <div><p className="label">Sprachen</p><input className="input" value={form.languages} onChange={(e) => set({ languages: e.target.value })} placeholder="Deutsch (Muttersprache) · Englisch (B1)" /></div>
            <div><p className="label">Mobilität</p><input className="input" value={form.mobility} onChange={(e) => set({ mobility: e.target.value })} placeholder="Führerschein Kl. B · eigener Pkw" /></div>
            <div className="sm:col-span-2"><p className="label">Kurzprofil (2–3 Sätze)</p><textarea className="input min-h-20" value={form.profileText} onChange={(e) => set({ profileText: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <p className="label">Berufserfahrung – eine Zeile pro Station: Zeitraum | Titel | Firma | Details</p>
              <textarea className="input min-h-28 font-mono text-xs" value={form.experiencesText} onChange={(e) => set({ experiencesText: e.target.value })} placeholder="01/2020 – 06/2024 | Staplerfahrer | DACHSER, Augsburg | Be- & Entladen, Kommissionierung" />
            </div>
            <div><p className="label">Qualifikationen (eine pro Zeile)</p><textarea className="input min-h-24" value={form.qualificationsText} onChange={(e) => set({ qualificationsText: e.target.value })} /></div>
            <div><p className="label">Skills (kommagetrennt)</p><textarea className="input min-h-24" value={form.skillsText} onChange={(e) => set({ skillsText: e.target.value })} /></div>
            <div className="sm:col-span-2">
              <p className="label">Foto</p>
              <div className="flex items-center gap-3">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt="Foto" className="h-16 w-16 rounded-full border-2 border-navy-200 object-cover dark:border-navy-700" />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-navy-100 text-navy-400 dark:bg-navy-800">📷</span>
                )}
                <button type="button" className="btn-secondary" onClick={() => photoRef.current?.click()}>
                  {photo ? "Anderes Foto" : "Foto wählen"}
                </button>
                <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setPhoto(await resizePhoto(f));
                }} />
                {personId && !photo && <span className="text-xs text-navy-400">Ohne neues Foto bleibt das gespeicherte erhalten.</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>← Zurück</button>
            <button type="button" disabled={busy || !form.firstName.trim() || !form.lastName.trim()} className="btn-primary" onClick={savePersonAndNext}>
              {busy ? "Speichert …" : "Person speichern & weiter"}
            </button>
          </div>
        </div>
      )}

      {/* ── Schritt 3: Firma + Einsatzbereich ── */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="card space-y-4 p-5">
            <div>
              <p className="label">Firma *</p>
              <div className="flex flex-wrap gap-2">
                {companies.map((c) => {
                  const t = themes[c.shortCode];
                  const active = companyId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setCompanyId(c.id); setBereich(""); }}
                      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                        active ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900" : "border-navy-200 hover:border-navy-400 dark:border-navy-700"
                      }`}
                    >
                      <span className="h-3 w-3 rounded-full" style={{ background: t?.primary ?? c.color ?? "#888" }} />
                      {c.brandName}
                    </button>
                  );
                })}
              </div>
            </div>
            {theme && (
              <div>
                <p className="label">Einsatzbereich *</p>
                <div className="flex flex-wrap gap-2">
                  {theme.einsatzbereiche.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBereich(b)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition ${
                        bereich === b ? "border-navy-900 bg-navy-900 text-white dark:border-white dark:bg-white dark:text-navy-900" : "border-navy-200 hover:border-navy-400 dark:border-navy-700"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
                <input className="input mt-2 max-w-sm" value={bereich} onChange={(e) => setBereich(e.target.value)} placeholder="oder eigenen Einsatzbereich eintippen (z. B. Volvo Promotion Tour)" />
              </div>
            )}
            <div>
              <p className="label">Hinweise an die KI (optional)</p>
              <input className="input" value={hinweise} onChange={(e) => setHinweise(e.target.value)} placeholder="z. B. Verfügbarkeit Sylt 31.07.–05.08. hervorheben" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => setStep(2)}>← Zurück</button>
            <button type="button" disabled={busy || !companyId || !bereich.trim()} className="btn-primary" onClick={() => makePreview(true)}>
              {busy ? "Erstellt Vorschau …" : "Vorschau erstellen"}
            </button>
          </div>
        </div>
      )}

      {/* ── Schritt 4: Vorschau + Speichern ── */}
      {step === 4 && data && theme && (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div>
            <SetcardPreview data={data} theme={theme} photo={photo} />
          </div>
          <div className="space-y-4">
            {savedId ? (
              <div className="card space-y-3 p-5 text-center">
                <p className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">✓ Setcard gespeichert</p>
                <a href={`/setcards/${savedId}/pdf`} target="_blank" rel="noreferrer" className="btn-primary w-full justify-center">
                  PDF öffnen
                </a>
                <a href={`/setcards/${savedId}/pdf?dl=1`} className="btn-secondary w-full justify-center">
                  PDF herunterladen
                </a>
                <button type="button" className="btn-secondary w-full justify-center" onClick={() => { setStep(3); setSavedId(null); setData(null); }}>
                  Weitere Setcard (andere Firma/Einsatz)
                </button>
              </div>
            ) : (
              <>
                <div className="card space-y-3 p-4">
                  <button type="button" disabled={busy} className="btn-primary w-full justify-center py-3" onClick={save}>
                    {busy ? "Speichert …" : "Passt – PDF speichern"}
                  </button>
                  <button type="button" disabled={busy} className="btn-secondary w-full justify-center" onClick={() => makePreview(true)}>
                    Neu generieren{hinweise ? " (mit Hinweisen)" : ""}
                  </button>
                  <input className="input" value={hinweise} onChange={(e) => setHinweise(e.target.value)} placeholder="Hinweis ändern und neu generieren …" />
                  <button type="button" className="btn-secondary w-full justify-center" onClick={() => setEditOpen(!editOpen)}>
                    {editOpen ? "Bearbeitung schließen" : "Texte von Hand anpassen"}
                  </button>
                </div>
                {editOpen && (
                  <div className="card space-y-3 p-4">
                    <div><p className="label">Rolle / Untertitel</p><input className="input" value={data.role} onChange={(e) => setData({ ...data, role: e.target.value })} /></div>
                    <div><p className="label">Profiltext</p><textarea className="input min-h-24" value={data.profileText} onChange={(e) => setData({ ...data, profileText: e.target.value })} /></div>
                    <div><p className="label">Einsatzschwerpunkt</p><textarea className="input min-h-16" value={data.einsatzText} onChange={(e) => setData({ ...data, einsatzText: e.target.value })} /></div>
                    <div><p className="label">Skills (kommagetrennt)</p><input className="input" value={data.skills.join(", ")} onChange={(e) => setData({ ...data, skills: splitChips(e.target.value) })} /></div>
                    <div><p className="label">Stärken (eine pro Zeile)</p><textarea className="input min-h-16" value={data.strengths.join("\n")} onChange={(e) => setData({ ...data, strengths: linesFrom(e.target.value) })} /></div>
                    <div><p className="label">Footer-Kontakt</p><input className="input" value={data.footerContact} onChange={(e) => setData({ ...data, footerContact: e.target.value })} /></div>
                  </div>
                )}
                <button type="button" className="btn-secondary w-full justify-center" onClick={() => setStep(3)}>← Firma/Einsatz ändern</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
