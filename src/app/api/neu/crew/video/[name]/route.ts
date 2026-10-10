import { createReadStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { crewSitzung } from "@/lib/neu/crew";
import { neuBenutzer } from "@/lib/neu/auth";
import { medienName, videoOrdner } from "@/lib/neu/video";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Mitgelieferte Unterweisungsvideos und Vorschaubilder. Nur für Personen mit Crew-Sitzung und für angemeldete
// Konten des neuen Dashboards. Mit Range-Unterstützung, damit Handys (iPhone!) das Video abspielen und anspringen können.
export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name: roh } = await ctx.params;
  const name = medienName(roh);
  if (!name) return new Response("Nicht gefunden", { status: 404 });
  if (!(await crewSitzung())) {
    const a = await neuBenutzer();
    if (!a.ok) return new Response("Nicht angemeldet", { status: 401 });
  }
  const datei = path.join(videoOrdner(), name);
  let size: number;
  try {
    const st = await fs.stat(datei);
    if (!st.isFile()) return new Response("Nicht gefunden", { status: 404 });
    size = st.size;
  } catch {
    return new Response("Nicht gefunden", { status: 404 });
  }
  const typ = name.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
  const kopf: Record<string, string> = { "Content-Type": typ, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" };

  const range = req.headers.get("range");
  let start = 0;
  let ende = size - 1;
  let status = 200;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === "" && m[2] === "")) return new Response("Ungültiger Bereich", { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    if (m[1] === "") {
      // letzte n Bytes
      start = Math.max(0, size - Number(m[2]));
    } else {
      start = Number(m[1]);
      if (m[2] !== "") ende = Math.min(ende, Number(m[2]));
    }
    if (start > ende || start >= size) return new Response("Ungültiger Bereich", { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    status = 206;
    kopf["Content-Range"] = `bytes ${start}-${ende}/${size}`;
  }
  kopf["Content-Length"] = String(ende - start + 1);
  const stream = Readable.toWeb(createReadStream(datei, { start, end: ende })) as unknown as ReadableStream;
  return new Response(stream, { status, headers: kopf });
}
