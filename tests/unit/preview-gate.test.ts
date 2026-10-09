import { afterEach, describe, expect, it } from "vitest";
import { previewAktiv, zugangsToken } from "@/app/preview/gate";

const alt = { ...process.env };
afterEach(() => {
  process.env = { ...alt };
});

describe("Zugang zur Testversion", () => {
  it("ohne PREVIEW_ENABLED=1 ist sie aus", () => {
    delete process.env.PREVIEW_ENABLED;
    expect(previewAktiv()).toBe(false);
    process.env.PREVIEW_ENABLED = "true";
    expect(previewAktiv()).toBe(false);
    process.env.PREVIEW_ENABLED = "0";
    expect(previewAktiv()).toBe(false);
    process.env.PREVIEW_ENABLED = "1";
    expect(previewAktiv()).toBe(true);
  });

  it("ohne Passwort gibt es keinen Zugangs-Token – im Zweifel zu", () => {
    delete process.env.PREVIEW_PASSWORD;
    expect(zugangsToken()).toBeNull();
    process.env.PREVIEW_PASSWORD = "";
    expect(zugangsToken()).toBeNull();
  });

  it("der Token hängt am Passwort und am Geheimnis der App", () => {
    process.env.PREVIEW_PASSWORD = "a";
    process.env.AUTH_SECRET = "s1";
    const t1 = zugangsToken();
    expect(t1).toMatch(/^[0-9a-f]{64}$/);
    process.env.AUTH_SECRET = "s2";
    expect(zugangsToken()).not.toBe(t1);
    process.env.AUTH_SECRET = "s1";
    process.env.PREVIEW_PASSWORD = "b";
    expect(zugangsToken()).not.toBe(t1);
  });

  it("das Passwort selbst steht nicht im Token", () => {
    process.env.PREVIEW_PASSWORD = "geheim123";
    process.env.AUTH_SECRET = "x";
    expect(zugangsToken()).not.toContain("geheim123");
  });
});
