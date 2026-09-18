"use client";

import { useEffect } from "react";
import { flushQueue } from "./offline";

// Registriert den Service Worker für /e/ (Offline-Shell) und stößt beim
// Wiederverbinden das Nachsenden gepufferter Eingaben an.
export function SwRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-einsatz.js", { scope: "/e/" }).catch(() => {
        // ohne SW funktioniert die Seite online trotzdem
      });
      navigator.serviceWorker.addEventListener("message", (ev) => {
        if (ev.data === "flush") void flushQueue();
      });
    }
    const onOnline = () => void flushQueue();
    window.addEventListener("online", onOnline);
    void flushQueue();
    return () => window.removeEventListener("online", onOnline);
  }, []);
  return null;
}
