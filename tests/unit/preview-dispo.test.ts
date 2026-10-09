import { describe, expect, it } from "vitest";
import { autoFuellen, belegLinkFuer, besetzungSchicht, einplanKonflikte, entferne, plane, whatsappAushang } from "@/preview/pages/dispo-aktionen";
import { initialerZustand } from "@/preview/state/store";
import { passungFuer } from "@/preview/pages/helfer";

describe("Disposition", () => {
  const start = () => {
    const st = initialerZustand();
    // leere Ausgangsbesetzung, damit die Tests nicht von den Beispielzusagen abhängen
    return { ...st, zuweisung: {}, bewerbungen: st.bewerbungen.map((a) => (a.status === "bestätigt" ? { ...a, status: "passt" as const } : a)) };
  };

  it("Einplanen setzt Besetzung und Bewerbungsstatus", () => {
    const st = start();
    const job = st.jobs[0];
    const a = st.bewerbungen.find((x) => x.jobId === job.id);
    if (!a) throw new Error("keine Bewerbung");
    const neu = plane(st, job, job.schichten[0].id, a.pnr, null);
    expect(besetzungSchicht(neu, job.schichten[0])).toBe(1);
    expect(neu.bewerbungen.find((x) => x.id === a.id)?.status).toBe("bestätigt");
    // zweimal einplanen ändert nichts
    expect(plane(neu, job, job.schichten[0].id, a.pnr, null)).toBe(neu);
  });

  it("Entfernen setzt die Bewerbung zurück, solange keine andere Schicht des Auftrags gebucht ist", () => {
    const st = start();
    const job = st.jobs[0];
    const a = st.bewerbungen.find((x) => x.jobId === job.id);
    if (!a) throw new Error("keine Bewerbung");
    let neu = plane(st, job, job.schichten[0].id, a.pnr, null);
    neu = plane(neu, job, job.schichten[1].id, a.pnr, null);
    neu = entferne(neu, job, job.schichten[0].id, a.pnr);
    expect(neu.bewerbungen.find((x) => x.id === a.id)?.status).toBe("bestätigt");
    neu = entferne(neu, job, job.schichten[1].id, a.pnr);
    expect(neu.bewerbungen.find((x) => x.id === a.id)?.status).toBe("passt");
  });

  it("Konflikte verlangen eine Begründung, auch die Überbesetzung", () => {
    const st = start();
    const job = st.jobs[3];
    const schicht = { ...job.schichten[0], bedarf: 1 };
    const crew = st.crew.find((c) => c.status === "aktiv");
    if (!crew) throw new Error("keine Crew");
    const p = passungFuer(st, crew, job, schicht);
    const voll = plane(st, job, schicht.id, "P0000", null);
    expect(einplanKonflikte(voll, p, schicht).some((t) => /voll besetzt/.test(t))).toBe(true);
    expect(einplanKonflikte(st, p, schicht).some((t) => /voll besetzt/.test(t))).toBe(false);
  });

  it("automatisch Füllen plant nur Personen ohne Konflikt ein und meldet, was offen bleibt", () => {
    const st = start();
    const job = st.jobs[3];
    const { state, eingeplant, offen } = autoFuellen(st, job);
    expect(eingeplant).toBeGreaterThan(0);
    const bedarf = job.schichten.reduce((n, s) => n + s.bedarf, 0);
    expect(offen).toBe(bedarf - eingeplant);
    for (const sch of job.schichten) {
      for (const z of state.zuweisung[sch.id] ?? []) {
        const c = state.crew.find((x) => x.pnr === z.pnr);
        if (!c) throw new Error("Person fehlt");
        // ohne sich selbst darf kein Konflikt bestehen
        const ohne = { ...state, zuweisung: { ...state.zuweisung, [sch.id]: (state.zuweisung[sch.id] ?? []).filter((x) => x.pnr !== z.pnr) } };
        expect(passungFuer(ohne, c, job, sch).konflikte).toEqual([]);
      }
    }
  });

  it("niemand wird in zwei Schichten desselben Auftrags automatisch eingeplant", () => {
    const st = start();
    const job = st.jobs[0];
    const { state } = autoFuellen(st, job);
    const alle = job.schichten.flatMap((s) => (state.zuweisung[s.id] ?? []).map((z) => z.pnr));
    expect(new Set(alle).size).toBe(alle.length);
  });

  it("der Aushang nennt Ort, Zeiten, freie Plätze und den Bewerbungslink", () => {
    const st = start();
    const job = st.jobs[0];
    const text = whatsappAushang(st, job);
    expect(text).toContain("EINSATZ HEUTE");
    expect(text).toContain(job.ort);
    expect(text).toContain("08:00–16:00 Uhr");
    expect(text).toMatch(/\d+ Plätze frei/);
    expect(text).toContain(`https://fess.jobs/jobs/${job.id}`);
  });

  it("komplett besetzte Schichten stehen als besetzt im Aushang", () => {
    const st = start();
    const job = { ...st.jobs[3], schichten: st.jobs[3].schichten.map((s) => ({ ...s, bedarf: 0 })) };
    expect(whatsappAushang(st, job)).toContain("komplett besetzt");
  });

  it("der Beleg-Link ist je Auftrag stabil und verschieden", () => {
    const st = start();
    expect(belegLinkFuer(st.jobs[0])).toBe(belegLinkFuer(st.jobs[0]));
    expect(belegLinkFuer(st.jobs[0])).not.toBe(belegLinkFuer(st.jobs[1]));
    expect(belegLinkFuer(st.jobs[0])).toMatch(/^https:\/\/app\.fess\.jobs\/b\/[a-z0-9]{7,}$/);
  });
});
