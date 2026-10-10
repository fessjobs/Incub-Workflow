// Video-Adressen für die Unterweisung: nur https, YouTube (ohne Cookies), Vimeo und
// direkte Videodateien werden eingebettet, alles andere wird als Link angeboten.
export type VideoEinbettung = { art: "iframe" | "video" | "link"; src: string };

export function videoEinbettung(roh: string): VideoEinbettung | null {
  const text = roh.trim();
  if (!text) return null;
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
