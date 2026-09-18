import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { envBase, hasConfiguredBase, isPublicHost, misconfiguredBase, normalizeBase } from "@/lib/einsatz/base-url";
import { employeeLinkUrl } from "@/lib/einsatz/mail";

const TOKEN = "e1fc95d3-8479-4c76-bfc3-015995ac35a3";
const VARS = ["APP_BASE_URL", "NEXT_PUBLIC_APP_URL", "RAILWAY_PUBLIC_DOMAIN"] as const;

beforeEach(() => VARS.forEach((v) => delete process.env[v]));
afterEach(() => VARS.forEach((v) => delete process.env[v]));

describe("Öffentlich erreichbare Adressen", () => {
  it("verwirft interne Hosts, die auf dem Handy nicht aufgehen", () => {
    for (const host of ["incub-workflow.railway.internal", "localhost", "127.0.0.1", "10.1.2.3", "192.168.0.5", "172.16.0.9", "incub-workflow", "::1"]) {
      expect(isPublicHost(host), host).toBe(false);
    }
  });

  it("akzeptiert echte Domains", () => {
    for (const host of ["incub-workflow-production.up.railway.app", "app.fess.jobs", "example.com:8443"]) {
      expect(isPublicHost(host), host).toBe(true);
    }
  });

  it("normalisiert und ergänzt fehlendes https", () => {
    expect(normalizeBase("incub.up.railway.app")).toBe("https://incub.up.railway.app");
    expect(normalizeBase("https://incub.up.railway.app/")).toBe("https://incub.up.railway.app");
    expect(normalizeBase("https://incub.up.railway.app/einsaetze?x=1")).toBe("https://incub.up.railway.app");
    expect(normalizeBase("https://incub-workflow.railway.internal")).toBeNull();
    expect(normalizeBase("   ")).toBeNull();
    expect(normalizeBase(undefined)).toBeNull();
  });
});

describe("Auflösung der Basis-Adresse", () => {
  it("die interne Railway-Adresse wird übersprungen, die öffentliche gewinnt", () => {
    process.env.APP_BASE_URL = "https://incub-workflow.railway.internal";
    process.env.RAILWAY_PUBLIC_DOMAIN = "incub-workflow-production.up.railway.app";
    expect(envBase()).toBe("https://incub-workflow-production.up.railway.app");
    expect(employeeLinkUrl(TOKEN)).toBe(`https://incub-workflow-production.up.railway.app/e/${TOKEN}`);
    expect(misconfiguredBase()).toBe("https://incub-workflow.railway.internal");
  });

  it("Railway-Domain allein genügt, ohne jede eigene Konfiguration", () => {
    process.env.RAILWAY_PUBLIC_DOMAIN = "incub-workflow-production.up.railway.app";
    expect(hasConfiguredBase()).toBe(true);
    expect(employeeLinkUrl(TOKEN)).toBe(`https://incub-workflow-production.up.railway.app/e/${TOKEN}`);
  });

  it("eine gültige eigene Adresse hat Vorrang", () => {
    process.env.APP_BASE_URL = "https://app.fess.jobs";
    process.env.RAILWAY_PUBLIC_DOMAIN = "incub-workflow-production.up.railway.app";
    expect(envBase()).toBe("https://app.fess.jobs");
    expect(misconfiguredBase()).toBeNull();
  });

  it("ohne alles greift die Adresse aus dem Aufruf, interne werden verworfen", () => {
    expect(employeeLinkUrl(TOKEN, "https://incub-workflow-production.up.railway.app")).toBe(`https://incub-workflow-production.up.railway.app/e/${TOKEN}`);
    expect(employeeLinkUrl(TOKEN, "https://incub-workflow.railway.internal")).toBe(`/e/${TOKEN}`);
  });
});
