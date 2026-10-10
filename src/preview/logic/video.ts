// Video-Adressen für die Unterweisung: nur https, YouTube (ohne Cookies), Vimeo und
// direkte Videodateien werden eingebettet, alles andere wird als Link angeboten.
export type VideoEinbettung = { art: "iframe" | "video" | "link"; src: string };

// Eigene Videos (mitgeliefert oder auf dem eigenen Server): nur diese beiden Pfade, nur Dateien mit Videoendung
const EIGENE_PFADE = ["/api/neu/crew/video/", "/videos/"];

export function videoEinbettung(roh: string): VideoEinbettung | null {
  const text = roh.trim();
  if (!text) return null;
  if (text.startsWith("/")) {
    if (text.startsWith("//") || !EIGENE_PFADE.some((p) => text.startsWith(p)) || /[?#\\]|\.\./.test(text) || !/\.(mp4|webm|mov|m4v)$/i.test(text)) return null;
    return { art: "video", src: text };
  }
  let u: URL;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0];
    return /^[\w-]{6,20}$/.test(id) ? { art: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const teile = u.pathname.split("/").filter(Boolean);
    const id = u.searchParams.get("v") ?? (["embed", "shorts", "live"].includes(teile[0]) ? teile[1] : undefined);
    return id && /^[\w-]{6,20}$/.test(id) ? { art: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean).find((t) => /^\d{5,12}$/.test(t));
    return id ? { art: "iframe", src: `https://player.vimeo.com/video/${id}` } : null;
  }
  if (/\.(mp4|webm|mov|m4v)$/i.test(u.pathname)) return { art: "video", src: u.toString() };
  return { art: "link", src: u.toString() };
}

// Vorschaubild zu einem eigenen Video (gleicher Name mit .jpg), sonst keins
export function videoPoster(src: string): string | undefined {
  return EIGENE_PFADE.some((p) => src.startsWith(p)) && /\.mp4$/i.test(src) ? src.replace(/\.mp4$/i, ".jpg") : undefined;
}

// Beim Vorspulen: wohin darf der Player springen? Höchstens ein Stück über die bisher gesehene Stelle hinaus.
// Zurückspulen ist immer erlaubt.
export function begrenzeSprung(ziel: number, maxGesehen: number, toleranz = 0.75): number {
  return ziel > maxGesehen + toleranz ? maxGesehen : ziel;
}

// Die Wiedergabe gilt als vollständig, wenn mindestens `anteil` der Videolänge seit dem Start vergangen ist
export function videoZeitErfuellt(startMs: number | null, jetztMs: number, dauerSekunden: number | null, anteil: number): boolean {
  if (anteil <= 0 || dauerSekunden === null) return true;
  if (startMs === null) return false;
  return jetztMs - startMs >= dauerSekunden * anteil * 1000;
}
