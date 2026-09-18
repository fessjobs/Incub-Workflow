import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { disponentDarf, homePathFor } from "@/lib/einsatz/roles";

const PUBLIC_PATHS = ["/login", "/registrieren"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Mitarbeiter-Link: komplett öffentlich (Passwort-Gate in der Seite selbst)
  if (pathname.startsWith("/mitarbeiter")) return NextResponse.next();
  // Einsatzmodul: Token-Links für Mitarbeiter/Ansprechpartner (Schutz über
  // unerratbare Tokens + Rate-Limit in den Routen) und Job-Runner (Secret)
  if (pathname.startsWith("/e/") || pathname.startsWith("/api/e/") || pathname === "/api/jobs/run" || pathname === "/sw-einsatz.js") {
    return NextResponse.next();
  }
  // Alter Kiosk-Pfad → neuer Mitarbeiter-Link
  if (pathname.startsWith("/erfassen")) {
    const url = request.nextUrl.clone();
    url.pathname = "/mitarbeiter";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let authenticated = false;
  let role: string | null = null;
  if (token && process.env.AUTH_SECRET) {
    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET));
      authenticated = true;
      role = (payload.role as string) ?? null;
    } catch {
      authenticated = false;
    }
  }

  if (!authenticated && !isPublic) {
    // API-Routen antworten mit 401 statt Redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Kiosk-Konten (EINREICHER) dürfen nur den Mitarbeiter-Bildschirm sehen
  if (authenticated && role === "EINREICHER" && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/mitarbeiter";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Disponenten-Konten sehen ausschließlich das Einsatzmodul
  if (authenticated && role === "DISPONENT" && !isPublic && !disponentDarf(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Für dieses Konto nicht freigegeben." }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/einsaetze";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (authenticated && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = homePathFor(role ?? "");
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Alles außer statischen Assets, Next-Internals und dem Healthcheck
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icons|manifest|api/health).*)"],
};
