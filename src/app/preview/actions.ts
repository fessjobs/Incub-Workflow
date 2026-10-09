"use server";

import { timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/einsatz/rate-limit";
import { PREVIEW_COOKIE, previewAktiv, zugangsToken } from "./gate";

export type EntsperrenErgebnis = { fehler?: string } | undefined;

function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function entsperren(_vorher: EntsperrenErgebnis, form: FormData): Promise<EntsperrenErgebnis> {
  if (!previewAktiv()) return { fehler: "Nicht verfügbar." };
  const token = zugangsToken();
  const pw = process.env.PREVIEW_PASSWORD;
  if (!token || !pw) return { fehler: "Die Testversion ist nicht eingerichtet (Passwort fehlt)." };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const limit = checkRateLimit(`preview:${ip}`, 8, 15 * 60_000);
  if (!limit.ok) return { fehler: `Zu viele Versuche. Bitte in ${Math.ceil(limit.retryAfterSeconds / 60)} Minuten erneut versuchen.` };

  const eingabe = String(form.get("passwort") ?? "");
  if (!gleich(eingabe, pw)) return { fehler: "Passwort stimmt nicht." };

  (await cookies()).set(PREVIEW_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/preview",
    maxAge: 60 * 60 * 12,
  });
  redirect("/preview");
}
