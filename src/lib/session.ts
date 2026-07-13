import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "iw_session";
const SESSION_DAYS = 30;

export type SessionPayload = {
  userId: string;
  organizationId: string;
  role: "ADMIN" | "BUCHHALTUNG" | "MEMBER" | "EINREICHER";
};

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET fehlt oder ist zu kurz (min. 16 Zeichen).");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    // Version 1 läuft lokal über HTTP (auch vom Handy via Rechner-IP) –
    // Secure-Cookies würden dort verworfen. Beim späteren Hosting: COOKIE_SECURE=true.
    secure: process.env.COOKIE_SECURE === "true",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
    path: "/",
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      userId: payload.userId as string,
      organizationId: payload.organizationId as string,
      role: payload.role as "ADMIN" | "BUCHHALTUNG" | "MEMBER" | "EINREICHER",
    };
  } catch {
    return null;
  }
}

export async function destroySession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
