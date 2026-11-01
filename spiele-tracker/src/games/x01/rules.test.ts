import { describe, expect, it } from 'vitest';
import { buildStates, playTurn } from './rules';
import { defaultX01Config } from './config';
import type { DartThrow } from '../_dart/turns';
import type { GameEvent } from '../types';
import type { Segment } from '../_dart/segments';

const cfg = defaultX01Config; // 501, double out

function d(number: number, ring: Segment['ring']): DartThrow {
  return { eventId: undefined, playerId: 'A', segment: { number, ring }, tMs: 0 };
}
const missed: DartThrow = { eventId: undefined, playerId: 'A', segment: null, tMs: 0 };

describe('playTurn', () => {
  it('zieht Single, Double und Triple richtig ab', () => {
    const t = playTurn(501, [d(20, 'triple'), d(20, 'triple'), d(20, 'triple')], cfg);
    expect(t.scored).toBe(180);
    expect(t.after).toBe(321);
    expect(t.bust).toBe(false);
  });

  it('zählt einen Fehlwurf als null', () => {
    const t = playTurn(501, [d(20, 'triple'), missed, d(20, 'single-inner')], cfg);
    expect(t.scored).toBe(80);
  });

  it('bustet, wenn der Rest unter null fiele', () => {
    const t = playTurn(40, [d(20, 'triple')], cfg);
    expect(t.bust).toBe(true);
    expect(t.after).toBe(40); // Die Aufnahme zählt komplett nicht.
    expect(t.scored).toBe(0);
  });

  it('bustet bei genau eins Rest, weil darauf kein Doppel geht', () => {
    const t = playTurn(41, [d(20, 'single-inner'), d(20, 'single-inner')], cfg);
    expect(t.bust).toBe(true);
  });

  it('bustet, wenn null ohne Doppel erreicht wird', () => {
    const t = playTurn(20, [d(20, 'single-inner')], cfg);
    expect(t.bust).toBe(true);
    expect(t.checkout).toBe(false);
  });

  it('checkt mit einem Doppel aus', () => {
    const t = playTurn(40, [d(20, 'double')], cfg);
    expect(t.checkout).toBe(true);
    expect(t.after).toBe(0);
    expect(t.dartsUsed).toBe(1);
  });

  it('lässt Bullseye als Doppel gelten', () => {
    const t = playTurn(50, [{ ...d(0, 'bullseye') }], cfg);
    expect(t.checkout).toBe(true);
  });

  it('erlaubt ohne doubleOut jedes Feld zum Auschecken', () => {
    const t = playTurn(20, [d(20, 'single-inner')], { ...cfg, doubleOut: false });
    expect(t.checkout).toBe(true);
    expect(t.bust).toBe(false);
  });

  it('verwirft auch die guten Pfeile vor einem Bust', () => {
    // 100 übrig: T20 (40 übrig), dann T20 würde unter null gehen.
    const t = playTurn(100, [d(20, 'triple'), d(20, 'triple')], cfg);
    expect(t.bust).toBe(true);
    expect(t.after).toBe(100);
  });

  it('bricht nach dem Checkout ab und wirft keine Pfeile mehr', () => {
    const t = playTurn(40, [d(20, 'double'), d(20, 'triple'), d(20, 'triple')], cfg);
    expect(t.checkout).toBe(true);
    expect(t.after).toBe(0);
    expect(t.dartsUsed).toBe(1);
  });

  it('zählt 170 als höchstes mögliches Finish', () => {
    const t = playTurn(170, [d(20, 'triple'), d(20, 'triple'), { ...d(0, 'bullseye') }], cfg);
    expect(t.checkout).toBe(true);
    expect(t.dartsUsed).toBe(3);
  });
});

// --- aus dem Event-Log ---------------------------------------------------

let seq = 0;
function ev(playerId: string, number: number | null, ring: Segment['ring'] | null): GameEvent {
  seq += 1;
  return {
    sessionId: 's',
    playerId,
    tMs: seq * 100,
    type: 'throw',
    payload: { segment: number === null ? null : { number, ring } },
    source: 'tap',
    clientSeq: seq,
    id: seq,
  };
}

describe('buildStates', () => {
  it('rechnet den Punktestand aus dem Log', () => {
    const events = [
      ev('A', 20, 'triple'),
      ev('A', 20, 'triple'),
      ev('A', 20, 'triple'),
    ];
    const states = buildStates(events, cfg, ['A']);
    expect(states.A.remaining).toBe(321);
    expect(states.A.dartsThrown).toBe(3);
  });

  it('hält zwei Spieler auseinander', () => {
    const events = [
      ev('A', 20, 'triple'),
      ev('A', 20, 'triple'),
      ev('A', 20, 'triple'),
      ev('B', 1, 'single-inner'),
      ev('B', 1, 'single-inner'),
      ev('B', 1, 'single-inner'),
    ];
    const states = buildStates(events, cfg, ['A', 'B']);
    expect(states.A.remaining).toBe(321);
    expect(states.B.remaining).toBe(498);
  });

  it('ignoriert zurückgenommene Würfe', () => {
    const events = [ev('A', 20, 'triple'), ev('A', 20, 'triple')];
    // Der zweite Wurf wird gestrichen: ein neues Event zeigt darauf.
    const undo: GameEvent = {
      sessionId: 's',
      playerId: 'A',
      tMs: 999,
      type: 'throw',
      payload: {},
      source: 'manual',
      voidsTarget: true,
      correctsEventId: events[1].id,
      clientSeq: 99,
    };
    const states = buildStates([...events, undo], cfg, ['A']);
    expect(states.A.remaining).toBe(501 - 60);
    expect(states.A.dartsThrown).toBe(1);
  });

  it('merkt sich die Pfeile bis zum Sieg', () => {
    const events = [
      ev('A', 20, 'triple'), // 441
      ev('A', 20, 'triple'), // 381
      ev('A', 20, 'triple'), // 321
      ev('A', 20, 'triple'), // 261
      ev('A', 20, 'triple'), // 201
      ev('A', 20, 'triple'), // 141
      ev('A', 20, 'triple'), // 81
      ev('A', 17, 'triple'), // 30
      ev('A', 15, 'double'), // 0 – Sieg mit dem 9. Pfeil
    ];
    const states = buildStates(events, cfg, ['A']);
    expect(states.A.finished).toBe(true);
    expect(states.A.remaining).toBe(0);
    expect(states.A.dartsToFinish).toBe(9);
  });

  it('spielt nach dem Sieg nicht weiter', () => {
    const events = [ev('A', 20, 'triple'), ev('A', 20, 'triple'), ev('A', 20, 'triple')];
    const states = buildStates(events, { ...cfg, startScore: 180, doubleOut: false }, ['A']);
    expect(states.A.finished).toBe(true);
    expect(states.A.remaining).toBe(0);
  });
});
