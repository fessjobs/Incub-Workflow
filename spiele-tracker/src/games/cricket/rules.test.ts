import { describe, expect, it } from 'vitest';
import { buildCricketStates, marksFor, defaultCricketConfig } from './rules';
import type { GameEvent } from '../types';
import type { Segment } from '../_dart/segments';

let seq = 0;
function ev(playerId: string, number: number, ring: Segment['ring']): GameEvent {
  seq += 1;
  return {
    sessionId: 's',
    playerId,
    tMs: seq * 100,
    type: 'throw',
    payload: { segment: { number, ring } },
    source: 'tap',
    clientSeq: seq,
    id: seq,
  };
}

const cfg = defaultCricketConfig;
const cut = { ...defaultCricketConfig, cutthroat: true };

describe('marksFor', () => {
  it('gibt Triple drei und Double zwei Marks', () => {
    expect(marksFor({ number: 20, ring: 'triple' })).toEqual({ number: 20, marks: 3 });
    expect(marksFor({ number: 20, ring: 'double' })).toEqual({ number: 20, marks: 2 });
    expect(marksFor({ number: 20, ring: 'single-inner' })).toEqual({ number: 20, marks: 1 });
  });

  it('zählt Bull einfach und Bullseye doppelt', () => {
    expect(marksFor({ number: 0, ring: 'bull' })).toEqual({ number: 25, marks: 1 });
    expect(marksFor({ number: 0, ring: 'bullseye' })).toEqual({ number: 25, marks: 2 });
  });

  it('ignoriert Zahlen, um die nicht gespielt wird', () => {
    expect(marksFor({ number: 14, ring: 'triple' })).toBeNull();
    expect(marksFor(null)).toBeNull();
  });
});

describe('buildCricketStates', () => {
  it('macht eine Zahl nach drei Marks zu', () => {
    const s = buildCricketStates([ev('A', 20, 'triple')], cfg, ['A']);
    expect(s.A.marks[20]).toBe(3);
    expect(s.A.points).toBe(0); // kein Überschuss
  });

  it('gibt Punkte erst für Marks über drei hinaus', () => {
    // T20 macht zu, das zweite T20 bringt 3 × 20 Punkte.
    const s = buildCricketStates([ev('A', 20, 'triple'), ev('A', 20, 'triple')], cfg, ['A', 'B']);
    expect(s.A.points).toBe(60);
  });

  it('gibt keine Punkte, wenn alle Gegner die Zahl auch zu haben', () => {
    const events = [
      ev('A', 20, 'triple'),
      ev('B', 20, 'triple'),
      ev('A', 20, 'triple'), // niemand mehr offen → keine Punkte
    ];
    const s = buildCricketStates(events, cfg, ['A', 'B']);
    expect(s.A.points).toBe(0);
  });

  it('verteilt Punkte bei Cutthroat an die Gegner', () => {
    const events = [ev('A', 20, 'triple'), ev('A', 20, 'triple')];
    const s = buildCricketStates(events, cut, ['A', 'B', 'C']);
    expect(s.A.points).toBe(0);
    expect(s.B.points).toBe(60);
    expect(s.C.points).toBe(60);
  });

  it('teilt einen Wurf zwischen Zumachen und Punkten auf', () => {
    // Zwei Marks vorhanden, T20 bringt drei: eine macht zu, zwei zählen.
    const events = [
      ev('A', 20, 'double'), // 2 Marks
      ev('A', 20, 'triple'), // 1 zum Zumachen, 2 als Punkte = 40
    ];
    const s = buildCricketStates(events, cfg, ['A', 'B']);
    expect(s.A.marks[20]).toBe(3);
    expect(s.A.points).toBe(40);
  });

  it('erkennt, wenn alle sieben Zahlen zu sind', () => {
    const events = [20, 19, 18, 17, 16, 15].map((n) => ev('A', n, 'triple'));
    events.push(ev('A', 0, 'bullseye'), ev('A', 0, 'bull')); // 2 + 1 = 3 Bull-Marks
    const s = buildCricketStates(events, cfg, ['A']);
    expect(s.A.closedAll).toBe(true);
  });

  it('zählt Bull korrekt bis zum Zumachen', () => {
    const s = buildCricketStates([ev('A', 0, 'bullseye'), ev('A', 0, 'bullseye')], cfg, ['A', 'B']);
    expect(s.A.marks[25]).toBe(3);
    expect(s.A.points).toBe(25); // ein überzähliger Mark
  });
});
