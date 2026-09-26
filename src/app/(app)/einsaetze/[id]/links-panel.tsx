"use client";

// Drei Zuschnitte, von grob nach fein: ein Link für den ganzen Einsatz
// (Hauptweg), ein Link je Schicht (eigene Gruppe pro Tag) und darunter
// ausklappbar die Einzellinks je Person (Nachzügler, automatischer Versand).
import { useState } from "react";
import type { Gruppenlink, LinkRow, Schichtlink } from "@/lib/einsatz/service/links";
import { formatDateTime } from "@/lib/format";

function CopyButton({ text, label, testId }: { text: string; label: string; testId?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary text-xs"
      title={text}
      data-testid={testId}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          window.prompt("Kopieren:", text);
        }
      }}
    >
      {done ? "Kopiert ✓" : label}
    </button>
  );
}

export function LinksPanel({
  assignmentId,
  rows,
  gruppe,
  schichten,
  baseConfigured,
  fehlkonfiguriert,
}: {
  assignmentId: string;
  rows: LinkRow[];
  gruppe: Gruppenlink | null;
  schichten: Schichtlink[];
  baseConfigured: boolean;
  fehlkonfiguriert?: string | null;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [einzelnOffen, setEinzelnOffen] = useState(false);
  const [textOffen, setTextOffen] = useState(false);
  const [schichtText, setSchichtText] = useState<string | null>(null);
  void assignmentId;
  const unterschrieben = rows.filter((r) => r.tokenUsedAt).length;
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">Link für die Gruppe</p>
        {gruppe ? (
          <span className="text-xs text-navy-400" data-testid="gruppen-stand">
            {unterschrieben} von {gruppe.personen} unterschrieben
          </span>
        ) : null}
      </div>
      {fehlkonfiguriert ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          APP_BASE_URL steht auf „{fehlkonfiguriert}“. Das ist keine von außen erreichbare Adresse, Links darüber lassen sich auf dem Handy nicht öffnen.
          Tragen Sie in Railway die öffentliche Domain ein (oder löschen Sie die Variable, dann wird sie automatisch ermittelt).
        </p>
      ) : !baseConfigured ? (
        <p className="mt-2 text-xs text-amber-600">
          Hinweis: APP_BASE_URL ist nicht gesetzt. Die Links hier werden aus dem Aufruf abgeleitet und funktionieren, im automatischen E-Mail-Versand fehlt aber die Adresse.
        </p>
      ) : null}
      {gruppe ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-navy-500">
            Eine Nachricht für alle: in die WhatsApp-Gruppe schicken. Jede Person öffnet den Link auf dem eigenen Handy, tippt den eigenen Namen an und unterschreibt.
          </p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={gruppe.whatsapp} label="WhatsApp-Nachricht kopieren" testId="gruppen-text-kopieren" />
            <a href={gruppe.teilen} target="_blank" rel="noreferrer" className="btn-secondary text-xs" data-testid="gruppen-teilen">
              In WhatsApp öffnen
            </a>
            <CopyButton text={gruppe.url} label="Nur den Link" testId="gruppen-link" />
            <a href={gruppe.url} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
              Öffnen
            </a>
            <button type="button" className="text-xs text-navy-400 hover:underline" onClick={() => setTextOffen((v) => !v)}>
              {textOffen ? "Nachricht ausblenden" : "Nachricht anzeigen"}
            </button>
          </div>
          {textOffen ? (
            <pre className="whitespace-pre-wrap rounded-lg bg-navy-50 p-3 font-mono text-xs dark:bg-navy-800" data-testid="gruppen-nachricht">
              {gruppe.whatsapp}
            </pre>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-navy-400">Für diesen Einsatz gibt es noch keinen Gruppenlink. Über „Tokens erneuern“ wird einer erzeugt.</p>
      )}

      {schichten.length > 0 ? (
        <div className="mt-5 border-t border-navy-100 pt-4 dark:border-navy-800" data-testid="schichtlinks">
          <p className="eyebrow">Link je Schicht</p>
          <p className="mt-1 text-sm text-navy-500">
            {schichten.length === 1
              ? "Derselbe Weg, nur auf diese eine Schicht zugeschnitten."
              : "Für jede Schicht eine eigene Nachricht – wer sie öffnet, sieht nur die Personen dieser Schicht."}
          </p>
          <div className="mt-2 divide-y divide-navy-100 dark:divide-navy-800">
            {schichten.map((s) => (
              <div key={s.shiftId} className="py-2" data-testid={`schichtlink-${s.shiftId}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {s.bezeichnung}
                      {s.taetigkeit ? <span className="text-xs text-navy-400"> · {s.taetigkeit}</span> : null}
                    </p>
                    <p className="text-xs text-navy-400">
                      {s.datumDE} · {s.zeit} · {s.unterschrieben} von {s.personen} unterschrieben
                      {s.kundeMoeglich ? "" : " · Kundenbestätigung über den Einsatzlink"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <CopyButton text={s.whatsapp} label="WhatsApp-Nachricht" testId={`schicht-text-kopieren-${s.shiftId}`} />
                    <a href={s.teilen} target="_blank" rel="noreferrer" className="btn-secondary text-xs" data-testid={`schicht-teilen-${s.shiftId}`}>
                      In WhatsApp öffnen
                    </a>
                    <CopyButton text={s.url} label="Nur den Link" testId={`schicht-link-${s.shiftId}`} />
                    <a href={s.url} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                      Öffnen
                    </a>
                    <button type="button" className="text-xs text-navy-400 hover:underline" onClick={() => setSchichtText(schichtText === s.shiftId ? null : s.shiftId)}>
                      {schichtText === s.shiftId ? "Text ausblenden" : "Text anzeigen"}
                    </button>
                  </div>
                </div>
                {schichtText === s.shiftId ? (
                  <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-navy-50 p-3 font-mono text-xs dark:bg-navy-800" data-testid={`schicht-nachricht-${s.shiftId}`}>
                    {s.whatsapp}
                  </pre>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <button type="button" className="mt-4 text-xs text-navy-400 hover:underline" onClick={() => setEinzelnOffen((v) => !v)} data-testid="einzellinks-toggle">
        {einzelnOffen ? "Einzellinks ausblenden" : `Einzellinks je Person anzeigen (${rows.length})`}
      </button>

      <div className={`mt-3 divide-y divide-navy-100 text-sm dark:divide-navy-800 ${einzelnOffen ? "" : "hidden"}`}>
        {rows.map((r) => (
          <div key={r.shiftAssignmentId} className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">
                  {r.name} <span className="text-xs text-navy-400">· {r.schicht}</span>
                </p>
                <p className="text-xs text-navy-400">
                  {r.tokenUsedAt ? `unterschrieben ${formatDateTime(r.tokenUsedAt)}` : r.linkSentAt ? `Link versendet ${formatDateTime(r.linkSentAt)}` : "Link noch nicht versendet"}
                  {r.reminderSentAt ? ` · Erinnerung ${formatDateTime(r.reminderSentAt)}` : ""}
                  {r.email ? ` · ${r.email}` : " · keine E-Mail"}
                  {r.mobil ? ` · ${r.mobil}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={r.url} label="Link" />
                <CopyButton text={r.whatsapp} label="WhatsApp-Text" />
                <a href={r.url} target="_blank" rel="noreferrer" className="btn-secondary text-xs">
                  Öffnen
                </a>
                <button type="button" className="text-xs text-navy-400 hover:underline" onClick={() => setOpen(open === r.shiftAssignmentId ? null : r.shiftAssignmentId)}>
                  {open === r.shiftAssignmentId ? "Text ausblenden" : "Text anzeigen"}
                </button>
              </div>
            </div>
            {open === r.shiftAssignmentId ? <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-navy-50 p-3 font-mono text-xs dark:bg-navy-800">{r.whatsapp}</pre> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
