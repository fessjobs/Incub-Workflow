import { describe, expect, it } from 'vitest';
import { normaliseTags } from './sessionStore';

describe('normaliseTags', () => {
  it('trimmt, kleint und entfernt Dubletten', () => {
    expect(normaliseTags([' Kneipe ', 'kneipe', 'KNEIPE'])).toEqual(['kneipe']);
  });

  it('wirft leere Eingaben weg', () => {
    expect(normaliseTags(['', '   ', 'bier'])).toEqual(['bier']);
  });

  it('kürzt auf die 32 Zeichen, die die Datenbank erlaubt', () => {
    const long = 'a'.repeat(50);
    expect(normaliseTags([long])[0]).toHaveLength(32);
  });

  it('behält die Reihenfolge der ersten Nennung', () => {
    expect(normaliseTags(['c', 'a', 'b', 'a'])).toEqual(['c', 'a', 'b']);
  });
});
