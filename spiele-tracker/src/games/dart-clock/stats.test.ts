import { describe, expect, it } from 'vitest';
import { computeDartClockStats, type WindowBucket } from './stats';
import { defaultDartClockConfig } from './config';
import type { GameEvent, StatsContext } from '../types';

const config = defaultDartClockConfig;
const ctx: StatsContext = { playerId: 'A', players: [] };

let seq = 0;
function ev(tMs: number, type: string, payload: Record<string, unknown> = {}): GameEvent {
  return {
    sessionId: 's',
    playerId: 'A',
    tMs,
    type,
    payload,
    source: 'tap',
    clientSeq: ++seq,
  };
}

/** Ein Wurf aufs Ziel, der trifft. */
function hit(tMs: number, target: number): GameEvent {
  return ev(tMs, 'throw', { target, hit: { number: target, ring: 'single-inner' } });
}

/** Ein Wurf, der eine andere Zahl trifft. */
function miss(tMs: number, target: number, landed: number): GameEvent {
  return ev(tMs, 'throw', { target, hit: { number: landed, ring: 'single-outer' } });
}

/** Ein Wurf ganz ohne Feld. */
function offBoard(tMs: number, target: number): GameEvent {
  return ev(tMs, 'throw', { target, hit: null });
}

describe('computeDartClockStats', () => {
  it('zählt getroffene Zahlen und Trefferquote', () => {
    const stats = computeDartClockStats(
      [ev(0, 'run_start'), hit(1000, 1), miss(2000, 2, 17), hit(3000, 2)],
      config,
      ctx,
    );
    expect(stats.metrics.throws).toBe(3);
    expect(stats.metrics.hits).toBe(2);
    expect(stats.metrics.numbersCleared).toBe(2);
    expect(stats.metrics.hitRate).toBeCloseTo(2 / 3, 4);
  });

  it('rechnet Zeiten relativ zum Beginn des eigenen Durchgangs', () => {
    // Der Durchgang startet erst bei 60 s der Session – etwa weil vorher ein
    // anderer Spieler dran war.
    const stats = computeDartClockStats(
      [ev(60_000, 'run_start'), hit(63_000, 1)],
      config,
      ctx,
    );
    const windows = stats.detail.windows as WindowBucket[];
    expect(windows[0].throws).toBe(1);
    expect(windows[0].fromSec).toBe(0);
  });

  it('verteilt Würfe auf Zehn-Sekunden-Fenster', () => {
    const stats = computeDartClockStats(
      [ev(0, 'run_start'), hit(1000, 1), miss(5000, 2, 3), hit(15_000, 2), miss(25_000, 3, 19)],
      config,
      ctx,
    );
    const windows = stats.detail.windows as WindowBucket[];
    expect(windows).toHaveLength(12); // 120 s / 10 s
    expect(windows[0].throws).toBe(2);
    expect(windows[0].hits).toBe(1);
    expect(windows[0].hitRate).toBeCloseTo(0.5, 4);
    expect(windows[1].throws).toBe(1);
    expect(windows[2].throws).toBe(1);
    expect(windows[3].throws).toBe(0);
  });

  it('misst die Fehler-Range in Segmenten, nicht als Zahlendifferenz', () => {
    // Ziel 20, getroffen 1: ein Segment daneben, obwohl 19 Zahlen Differenz.
    const stats = computeDartClockStats(
      [ev(0, 'run_start'), miss(1000, 20, 1)],
      config,
      ctx,
    );
    expect(stats.metrics.avgErrorSegments).toBe(1);
  });

  it('lässt die Abweichung leer, wenn kein Feld bekannt ist', () => {
    // Der Treffer/Daneben-Modus liefert keine getroffene Zahl. Dann darf
    // nichts geraten werden.
    const stats = computeDartClockStats(
      [ev(0, 'run_start'), offBoard(1000, 5), offBoard(2000, 5)],
      config,
      ctx,
    );
    expect(stats.metrics.avgErrorSegments).toBe(0);
    expect(stats.metrics.offBoard).toBe(2);
  });

  it('rechnet Ziehzeiten aus den Ziehphasen-Events', () => {
    const stats = computeDartClockStats(
      [
        ev(0, 'run_start'),
        hit(1000, 1),
        ev(2000, 'retrieval_start'),
        ev(12_000, 'retrieval_end'),
        hit(12_500, 2),
        ev(13_000, 'retrieval_start'),
        ev(19_000, 'retrieval_end'),
      ],
      config,
      ctx,
    );
    expect(stats.detail.retrievals).toEqual([10_000, 6000]);
    expect(stats.metrics.avgRetrievalMs).toBe(8000);
  });

  it('zieht die Ziehzeit von der reinen Wurfzeit ab', () => {
    const stats = computeDartClockStats(
      [
        ev(0, 'run_start'),
        hit(1000, 1),
        ev(2000, 'retrieval_start'),
        ev(12_000, 'retrieval_end'),
        hit(13_000, 2),
        ev(20_000, 'run_end', { reason: 'time' }),
      ],
      config,
      ctx,
    );
    // 20 s gesamt, davon 10 s Ziehen.
    expect(stats.metrics.activeMs).toBe(10_000);
    expect(stats.metrics.retrievalShare).toBeCloseTo(0.5, 3);
  });

  it('erkennt den Richtungs-Bias im Uhrzeigersinn', () => {
    // Von der 20 aus liegt die 1 im Uhrzeigersinn, die 18 zwei weiter.
    const stats = computeDartClockStats(
      [ev(0, 'run_start'), miss(1000, 20, 1), miss(2000, 20, 18), miss(3000, 20, 1)],
      config,
      ctx,
    );
    expect(stats.detail.avgSigned).toBeGreaterThan(0);
    expect(stats.insights.join(' ')).toContain('im Uhrzeigersinn');
  });

  it('zählt Würfe je Zielzahl und findet die Angstzahl', () => {
    // Mindestens vier Zielzahlen, sonst hält die Auswertung bewusst die
    // Klappe — aus drei Datenpunkten lässt sich keine Angstzahl ableiten.
    const events = [ev(0, 'run_start'), hit(500, 1)];
    // Die 2 braucht sechs Versuche, alle anderen einen.
    for (let i = 0; i < 5; i++) events.push(miss(1000 + i * 100, 2, 17));
    events.push(hit(2000, 2), hit(2500, 3), hit(3000, 4), hit(3500, 5));

    const stats = computeDartClockStats(events, config, ctx);
    const perTarget = stats.detail.perTarget as Array<{ target: number; throws: number }>;
    expect(perTarget.find((t) => t.target === 1)?.throws).toBe(1);
    expect(perTarget.find((t) => t.target === 2)?.throws).toBe(6);
    expect(stats.insights.join(' ')).toContain('Hängengeblieben bei: 2');
  });

  it('markiert completed erst bei allen zwanzig Zahlen', () => {
    const events = [ev(0, 'run_start')];
    for (let n = 1; n <= 19; n++) events.push(hit(n * 1000, n));
    expect(computeDartClockStats(events, config, ctx).metrics.completed).toBe(0);

    events.push(hit(20_000, 20));
    const done = computeDartClockStats(events, config, ctx);
    expect(done.metrics.completed).toBe(1);
    expect(done.metrics.timeToCompleteMs).toBe(20_000);
    expect(done.headline).toContain('Alle 20');
  });

  it('meldet keine Bestzeit, wenn nicht durchgespielt wurde', () => {
    const stats = computeDartClockStats([ev(0, 'run_start'), hit(1000, 1)], config, ctx);
    expect(stats.metrics.timeToCompleteMs).toBe(0);
  });

  it('trennt zwei Spieler an einem Handy sauber', () => {
    const mixed: GameEvent[] = [
      { ...ev(0, 'run_start'), playerId: 'A' },
      { ...ev(1000, 'throw', { target: 1, hit: { number: 1 } }), playerId: 'A' },
      { ...ev(2000, 'throw', { target: 2, hit: { number: 2 } }), playerId: 'A' },
      { ...ev(130_000, 'run_start'), playerId: 'B' },
      { ...ev(131_000, 'throw', { target: 1, hit: { number: 5 } }), playerId: 'B' },
    ];

    const a = computeDartClockStats(mixed, config, { playerId: 'A', players: [] });
    const b = computeDartClockStats(mixed, config, { playerId: 'B', players: [] });

    expect(a.metrics.hits).toBe(2);
    expect(b.metrics.hits).toBe(0);
    expect(b.metrics.throws).toBe(1);
    // Bs Durchgang beginnt bei null, obwohl er in der Session spät liegt.
    const bWindows = b.detail.windows as WindowBucket[];
    expect(bWindows[0].throws).toBe(1);
  });

  it('kommt mit einem leeren Log klar', () => {
    const stats = computeDartClockStats([], config, ctx);
    expect(stats.metrics.throws).toBe(0);
    expect(stats.metrics.hitRate).toBe(0);
    expect(stats.insights).toEqual(['Keine Würfe aufgezeichnet.']);
  });

  it('ist eine reine Funktion und verändert die Eingabe nicht', () => {
    const events = [ev(0, 'run_start'), miss(3000, 1, 20), hit(1000, 1)];
    const before = events.map((e) => e.tMs);
    const first = computeDartClockStats(events, config, ctx);
    const second = computeDartClockStats(events, config, ctx);
    expect(first).toEqual(second);
    expect(events.map((e) => e.tMs)).toEqual(before);
  });
});
