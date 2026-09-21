"use client";

import { useEffect, useState } from "react";

// Der fertige, unterschriebene Stundennachweis auf dem Handy: ansehen,
// teilen (WhatsApp, Mail, Dateien) oder herunterladen. Das PDF entsteht in
// einem Hintergrund-Job, sobald alle unterschrieben haben und der Kunde
// bestätigt hat – "noch nicht fertig" ist deshalb ein normaler Zustand und
// kein Fehler. Wird vom Gruppenlink und vom Einzellink benutzt.
export function PdfKarte({ url }: { url: string }) {
  const [status, setStatus] = useState<"prueft" | "da" | "wartet" | "fehler">("prueft");
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    let abbruch = false;
    let versuche = 0;
    const pruefe = async () => {
      try {
        const res = await fetch(url, { method: "HEAD", cache: "no-store" });
        if (abbruch) return;
        if (res.ok) return setStatus("da");
        if (res.status === 404 && versuche < 10) {
          versuche++;
          setStatus("wartet");
          setTimeout(() => void pruefe(), 3000);
          return;
        }
        setStatus(res.status === 404 ? "wartet" : "fehler");
      } catch {
        if (!abbruch) setStatus("fehler");
      }
    };
    void pruefe();
    return () => {
      abbruch = true;
    };
  }, [url]);

  const teilen = async () => {
    setInfo(null);
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("nicht verfügbar");
      const blob = await res.blob();
      const datei = new File([blob], "Stundennachweis.pdf", { type: "application/pdf" });
      // Erst die Datei selbst, sonst den Link – je nachdem, was das Gerät kann
      if (navigator.canShare?.({ files: [datei] })) {
        await navigator.share({ files: [datei], title: "Stundennachweis" });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "Stundennachweis", url: new URL(url, window.location.href).toString() });
        return;
      }
      setInfo("Teilen geht auf diesem Gerät nicht – bitte herunterladen und von Hand weiterschicken.");
    } catch (err) {
      // Abbruch durch den Nutzer ist kein Fehler
      if (err instanceof DOMException && err.name === "AbortError") return;
      setInfo("Teilen hat nicht geklappt – bitte herunterladen.");
    }
  };

  if (status === "prueft") return null;
  if (status !== "da") {
    return (
      <p className="ez-muted" style={{ marginTop: "0.6rem", fontSize: "0.9rem" }} data-testid="crew-pdf-wartet">
        {status === "wartet" ? "Der unterschriebene Stundennachweis wird gerade erstellt – gleich hier abrufbar." : "Der Stundennachweis lässt sich gerade nicht laden. Bitte später noch einmal öffnen."}
      </p>
    );
  }

  return (
    <div style={{ marginTop: "0.8rem" }} data-testid="crew-pdf">
      <p style={{ fontSize: "0.92rem" }}>Der unterschriebene Stundennachweis ist fertig.</p>
      <div className="ez-row" style={{ marginTop: "0.6rem" }}>
        <a className="ez-btn ez-btn-small" href={url} target="_blank" rel="noreferrer" data-testid="crew-pdf-ansehen">
          Ansehen
        </a>
        <button type="button" className="ez-btn ez-btn-ghost ez-btn-small" onClick={() => void teilen()} data-testid="crew-pdf-teilen">
          Teilen
        </button>
      </div>
      <a className="ez-linkbtn" style={{ display: "inline-block", marginTop: "0.5rem" }} href={`${url}?dl=1`} data-testid="crew-pdf-download">
        Herunterladen
      </a>
      {info ? <p className="ez-muted" style={{ marginTop: "0.5rem", fontSize: "0.85rem" }}>{info}</p> : null}
    </div>
  );
}
