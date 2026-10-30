import { useMemo } from 'react';
import { BOARD_MM, BOARD_ORDER, type Ring, type Segment } from './segments';

/**
 * Maßstabsgetreues Dartboard, jedes der 82 Felder einzeln antippbar.
 *
 * Zwei Dinge weichen bewusst von der reinen Lehre ab, weil mit dem Daumen
 * getippt wird und nicht mit der Maus:
 *
 *  - Die inneren Ringe bekommen vergrößerte, unsichtbare Trefferflächen.
 *    Single-innen ist am echten Board nur gut einen Zentimeter breit; auf
 *    einem Handy wäre das nicht zu treffen.
 *  - Bull und Bullseye haben eine gemeinsame Mindestgröße, damit man das
 *    Zentrum überhaupt erwischt.
 */

const SIZE = 400;
const C = SIZE / 2;
/** Spielfläche auf 168 px, der Rest bleibt für den Zahlenkranz. */
const K = 168 / BOARD_MM.doubleOuter;

const R = {
  bullseye: BOARD_MM.bullseye * K,
  bull: BOARD_MM.bull * K,
  tripleInner: BOARD_MM.tripleInner * K,
  tripleOuter: BOARD_MM.tripleOuter * K,
  doubleInner: BOARD_MM.doubleInner * K,
  doubleOuter: BOARD_MM.doubleOuter * K,
};

/** Mindestradius für die Mitte, damit sie mit dem Daumen erreichbar bleibt. */
const TOUCH_BULLSEYE = Math.max(R.bullseye, 13);
const TOUCH_BULL = Math.max(R.bull, 26);

export interface BoardTheme {
  even: string;
  odd: string;
  double: string;
  triple: string;
  wire: string;
  label: string;
}

export const defaultBoardTheme: BoardTheme = {
  even: '#12161B',
  odd: '#D9CFB4',
  double: '#C3352B',
  triple: '#1F7A4C',
  wire: '#8A7040',
  label: '#D9CFB4',
};

function point(r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

/** Pfad eines Ringausschnitts zwischen zwei Radien und zwei Winkeln. */
function annulus(r1: number, r2: number, a1: number, a2: number): string {
  const [x1, y1] = point(r2, a1);
  const [x2, y2] = point(r2, a2);
  const [x3, y3] = point(r1, a2);
  const [x4, y4] = point(r1, a1);
  return (
    `M${x1},${y1} A${r2},${r2} 0 0 1 ${x2},${y2} ` +
    `L${x3},${y3} A${r1},${r1} 0 0 0 ${x4},${y4} Z`
  );
}

interface Wedge {
  key: string;
  d: string;
  /** Vergrößerte Trefferfläche, falls die sichtbare zu schmal ist. */
  hit: string;
  fill: string;
  segment: Segment;
}

function buildWedges(): Wedge[] {
  const out: Wedge[] = [];

  BOARD_ORDER.forEach((number, i) => {
    const a1 = -99 + i * 18;
    const a2 = a1 + 18;
    const even = i % 2 === 0;

    const rings: Array<{ ring: Ring; from: number; to: number; multi: boolean }> = [
      { ring: 'single-inner', from: R.bull, to: R.tripleInner, multi: false },
      { ring: 'triple', from: R.tripleInner, to: R.tripleOuter, multi: true },
      { ring: 'single-outer', from: R.tripleOuter, to: R.doubleInner, multi: false },
      { ring: 'double', from: R.doubleInner, to: R.doubleOuter, multi: true },
    ];

    // Die schmalen Ringe bekommen nach außen etwas mehr Trefferfläche, die
    // breiten Singles geben sie her.
    const grow: Record<Ring, number> = {
      'single-inner': 0,
      triple: 5,
      'single-outer': 0,
      double: 5,
      bull: 0,
      bullseye: 0,
    };

    for (const { ring, from, to, multi } of rings) {
      const g = grow[ring];
      out.push({
        key: `${number}-${ring}`,
        d: annulus(from, to, a1, a2),
        hit: annulus(Math.max(TOUCH_BULL, from - g), to + g, a1, a2),
        fill: multi
          ? even
            ? 'var(--board-double)'
            : 'var(--board-triple)'
          : even
            ? 'var(--board-even)'
            : 'var(--board-odd)',
        segment: { number, ring },
      });
    }
  });

  return out;
}

export function Dartboard({
  onHit,
  highlightNumber,
  disabled,
  theme = defaultBoardTheme,
  className,
}: {
  onHit: (segment: Segment) => void;
  /** Die aktuelle Zielzahl wird hervorgehoben. */
  highlightNumber?: number | null;
  disabled?: boolean;
  theme?: BoardTheme;
  className?: string;
}) {
  const wedges = useMemo(buildWedges, []);

  const targetSector = useMemo(() => {
    if (highlightNumber == null) return null;
    const i = BOARD_ORDER.indexOf(highlightNumber as (typeof BOARD_ORDER)[number]);
    if (i < 0) return null;
    const a1 = -99 + i * 18;
    return annulus(R.bull, R.doubleOuter, a1, a1 + 18);
  }, [highlightNumber]);

  const style = {
    '--board-even': theme.even,
    '--board-odd': theme.odd,
    '--board-double': theme.double,
    '--board-triple': theme.triple,
  } as React.CSSProperties;

  function fire(segment: Segment) {
    if (disabled) return;
    onHit(segment);
  }

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={className}
      style={style}
      role="group"
      aria-label="Dartboard"
    >
      <circle cx={C} cy={C} r={R.doubleOuter + 26} fill="#0A0D11" stroke={theme.wire} strokeWidth={1.2} />

      {/* Sichtbare Felder. Für Zeiger inert – getroffen wird über die
          darüberliegenden Hitboxen. */}
      <g pointerEvents="none">
        {wedges.map((w) => (
          <path key={w.key} d={w.d} fill={w.fill} stroke={theme.wire} strokeWidth={0.6} />
        ))}
        <circle cx={C} cy={C} r={R.bull} fill={theme.triple} stroke={theme.wire} strokeWidth={0.6} />
        <circle cx={C} cy={C} r={R.bullseye} fill={theme.double} stroke={theme.wire} strokeWidth={0.6} />

        {/* Das Ziel wird umrandet, nicht der Rest abgedunkelt. Ein gedimmtes
            Board verliert seine Farbcodierung und wird bei schlechtem Licht
            schlechter lesbar, nicht besser. */}
        {targetSector && (
          <>
            <path
              d={targetSector}
              fill="none"
              stroke="#0B0E12"
              strokeWidth={6}
              strokeLinejoin="round"
            />
            <path
              d={targetSector}
              fill="none"
              stroke="#22D3EE"
              strokeWidth={3}
              strokeLinejoin="round"
            />
          </>
        )}
      </g>

      {/* Zahlenkranz */}
      <g pointerEvents="none">
        {BOARD_ORDER.map((number, i) => {
          const [x, y] = point(R.doubleOuter + 13, -99 + i * 18 + 9);
          const isTarget = highlightNumber === number;
          return (
            <text
              key={number}
              x={x}
              y={y}
              fill={isTarget ? '#22D3EE' : theme.label}
              fontSize={isTarget ? 17 : 13}
              fontWeight={isTarget ? 800 : 700}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="ui-monospace, Menlo, monospace"
            >
              {number}
            </text>
          );
        })}
      </g>

      {/* Trefferflächen. Unsichtbar, teils größer als das, was man sieht. */}
      <g>
        {wedges.map((w) => (
          <path
            key={`hit-${w.key}`}
            d={w.hit}
            fill="transparent"
            data-number={w.segment.number}
            data-ring={w.segment.ring}
            style={{ cursor: disabled ? 'default' : 'pointer' }}
            onPointerDown={() => fire(w.segment)}
          >
            <title>{`${w.segment.number} ${w.segment.ring}`}</title>
          </path>
        ))}
        <circle
          cx={C}
          cy={C}
          r={TOUCH_BULL}
          fill="transparent"
          data-number={0}
          data-ring="bull"
          style={{ cursor: disabled ? 'default' : 'pointer' }}
          onPointerDown={() => fire({ number: 0, ring: 'bull' })}
        >
          <title>Bull</title>
        </circle>
        <circle
          cx={C}
          cy={C}
          r={TOUCH_BULLSEYE}
          fill="transparent"
          data-number={0}
          data-ring="bullseye"
          style={{ cursor: disabled ? 'default' : 'pointer' }}
          onPointerDown={() => fire({ number: 0, ring: 'bullseye' })}
        >
          <title>Bullseye</title>
        </circle>
      </g>
    </svg>
  );
}
