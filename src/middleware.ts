import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { SESSION_COOKIE_NAME } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/registrieren"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Kiosk-Konten (EINREICHER) dürfen nur den Erfassen-Bildschirm sehen
  if (authenticated && role === "EINREICHER") {
    const allowed = pathname.startsWith("/erfassen");
    if (!allowed && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/erfassen";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (authenticated && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = role === "EINREICHER" ? "/erfassen" : "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Alles außer statischen Assets, Next-Internals und dem Healthcheck
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icons|manifest|api/health).*)"],
};
