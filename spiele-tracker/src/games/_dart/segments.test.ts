import { describe, expect, it } from 'vitest';
import {
  BOARD_ORDER,
  allSegments,
  neighbours,
  ringDistance,
  segmentLabel,
  segmentScore,
  signedRingDistance,
  verticalHalf,
  verticalPosition,
} from './segments';

describe('BOARD_ORDER', () => {
  it('enthält jede Zahl von 1 bis 20 genau einmal', () => {
    expect([...BOARD_ORDER].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('beginnt oben bei der 20 und läuft im Uhrzeigersinn weiter', () => {
    expect(BOARD_ORDER[0]).toBe(20);
    expect(BOARD_ORDER[1]).toBe(1);
    expect(BOARD_ORDER[19]).toBe(5);
  });
});

describe('ringDistance', () => {
  it('misst Segmente auf dem Kranz, nicht die Differenz der Zahlen', () => {
    // Der Kern der Fehler-Range: die 20 liegt neben der 1 und der 5.
    expect(ringDistance(20, 1)).toBe(1);
    expect(ringDistance(20, 5)).toBe(1);
    // Die 19 sieht numerisch nah aus, liegt aber weit weg.
    expect(ringDistance(20, 19)).toBe(9);
  });

  it('ist null für dieselbe Zahl', () => {
    expect(ringDistance(7, 7)).toBe(0);
  });

  it('ist symmetrisch', () => {
    for (const a of BOARD_ORDER) {
      for (const b of BOARD_ORDER) {
        expect(ringDistance(a, b)).toBe(ringDistance(b, a));
      }
    }
  });

  it('wird nie größer als zehn', () => {
    for (const a of BOARD_ORDER) {
      for (const b of BOARD_ORDER) {
        expect(ringDistance(a, b)).toBeLessThanOrEqual(10);
      }
    }
  });

  it('ist zehn für gegenüberliegende Zahlen', () => {
    expect(ringDistance(20, 3)).toBe(10);
    expect(ringDistance(6, 11)).toBe(10);
  });

  it('meldet -1, wenn Bull beteiligt ist', () => {
    expect(ringDistance(0, 20)).toBe(-1);
  });
});

describe('signedRingDistance', () => {
  it('ist positiv im Uhrzeigersinn', () => {
    // Von der 20 aus ist die 1 der nächste Nachbar im Uhrzeigersinn.
    expect(signedRingDistance(20, 1)).toBe(1);
    expect(signedRingDistance(20, 18)).toBe(2);
  });

  it('ist negativ gegen den Uhrzeigersinn', () => {
    expect(signedRingDistance(20, 5)).toBe(-1);
    expect(signedRingDistance(20, 12)).toBe(-2);
  });

  it('hat denselben Betrag wie ringDistance', () => {
    for (const a of BOARD_ORDER) {
      for (const b of BOARD_ORDER) {
        expect(Math.abs(signedRingDistance(a, b))).toBe(ringDistance(a, b));
      }
    }
  });

  it('kehrt sich mit der Richtung um', () => {
    expect(signedRingDistance(1, 20)).toBe(-signedRingDistance(20, 1));
  });
});

describe('verticalHalf', () => {
  it('ordnet die 20 oben und die 3 unten zu', () => {
    expect(verticalHalf(20)).toBe('oben');
    expect(verticalHalf(3)).toBe('unten');
  });

  it('nennt die seitlichen Zahlen Mitte', () => {
    // 6 steht rechts, 11 links – beide auf der Waagerechten.
    expect(verticalHalf(6)).toBe('mitte');
    expect(verticalHalf(11)).toBe('mitte');
  });

  it('teilt oben und unten gleich auf', () => {
    const halves = BOARD_ORDER.map(verticalHalf);
    expect(halves.filter((h) => h === 'oben')).toHaveLength(9);
    expect(halves.filter((h) => h === 'unten')).toHaveLength(9);
    expect(halves.filter((h) => h === 'mitte')).toHaveLength(2);
  });
});

describe('neighbours', () => {
  it('liefert beide Nachbarn der 20', () => {
    expect(neighbours(20)).toEqual([5, 1]);
  });

  it('läuft am Anfang des Kranzes sauber um', () => {
    expect(neighbours(5)).toEqual([12, 20]);
  });
});

describe('segmentScore', () => {
  it('rechnet Double und Triple hoch', () => {
    expect(segmentScore({ number: 20, ring: 'single-inner' })).toBe(20);
    expect(segmentScore({ number: 20, ring: 'single-outer' })).toBe(20);
    expect(segmentScore({ number: 20, ring: 'double' })).toBe(40);
    expect(segmentScore({ number: 20, ring: 'triple' })).toBe(60);
  });

  it('kennt Bull und Bullseye', () => {
    expect(segmentScore({ number: 0, ring: 'bull' })).toBe(25);
    expect(segmentScore({ number: 0, ring: 'bullseye' })).toBe(50);
  });

  it('erreicht das Maximum von 180 mit drei Triple-20', () => {
    const t20 = { number: 20, ring: 'triple' as const };
    expect(segmentScore(t20) * 3).toBe(180);
  });
});

describe('segmentLabel', () => {
  it('schreibt Ringe kurz an', () => {
    expect(segmentLabel({ number: 7, ring: 'triple' })).toBe('T7');
    expect(segmentLabel({ number: 7, ring: 'double' })).toBe('D7');
    expect(segmentLabel({ number: 7, ring: 'single-inner' })).toBe('7');
    expect(segmentLabel({ number: 0, ring: 'bullseye' })).toBe('Bullseye');
  });
});

describe('allSegments', () => {
  it('ergibt die 82 Felder aus der Anforderung', () => {
    expect(allSegments()).toHaveLength(82);
  });

  it('enthält jedes Feld nur einmal', () => {
    const keys = allSegments().map((s) => `${s.number}-${s.ring}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('verticalPosition', () => {
  it('setzt die 20 ganz oben und die 3 ganz unten', () => {
    expect(verticalPosition(20)).toBeCloseTo(1, 6);
    expect(verticalPosition(3)).toBeCloseTo(-1, 6);
  });

  it('setzt die seitlichen Zahlen auf die Mitte', () => {
    expect(verticalPosition(6)).toBeCloseTo(0, 6);
    expect(verticalPosition(11)).toBeCloseTo(0, 6);
  });
});
