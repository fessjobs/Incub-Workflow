import type { Config } from 'tailwindcss';

/**
 * Dunkles Theme mit hohem Kontrast: Der Live-Screen muss aus 2,5 m Entfernung
 * neben der Dartscheibe lesbar sein.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0b0f14',
          raised: '#141a22',
          overlay: '#1c242e',
          border: '#2a343f',
        },
        accent: {
          DEFAULT: '#22d3ee',
          strong: '#06b6d4',
          muted: '#0e7490',
        },
        good: '#4ade80',
        bad: '#f87171',
        warn: '#fbbf24',
      },
      fontSize: {
        // Werte für den Live-Screen, bewusst außerhalb der Default-Skala
        target: ['9rem', { lineHeight: '1', letterSpacing: '-0.04em' }],
        clock: ['4.5rem', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
      screens: {
        // Mobile first – "tall" für Geräte, auf denen der Live-Screen mehr Luft hat
        tall: { raw: '(min-height: 720px)' },
      },
    },
  },
  plugins: [],
} satisfies Config;
