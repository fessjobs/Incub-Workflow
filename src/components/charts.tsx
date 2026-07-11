// Schlanke, serverseitig gerenderte SVG-Charts im Marken-Look (Midnight-Navy
// plus abgestimmte Akzente). Keine Client-Bibliothek nötig.
import { formatEuro } from "@/lib/format";
import type { Slice } from "@/lib/analytics";

// Kohärente kategoriale Palette (dunkel→hell, gut unterscheidbar, light+dark)
export const PALETTE = [
  "#0B1220",
  "#2E3B57",
  "#465575",
  "#6B7C9E",
  "#3B82F6",
  "#0EA5E9",
  "#14B8A6",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
];

function polar(cx: number, cy: number, r: number, angle: number) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

export function DonutChart({ data, size = 180 }: { data: Slice[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const top = data.slice(0, PALETTE.length);
  const rest = data.slice(PALETTE.length);
  const restSum = rest.reduce((s, d) => s + d.value, 0);
  const slices = restSum > 0 ? [...top, { label: "Sonstige", value: restSum }] : top;

  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 4;
  const rInner = rOuter * 0.6;

  if (total === 0) {
    return <p className="text-sm text-navy-400">Keine Daten im Zeitraum.</p>;
  }

  let angle = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const frac = s.value / total;
    const start = angle;
    const end = angle + frac * Math.PI * 2;
    angle = end;
    const large = end - start > Math.PI ? 1 : 0;
    const [x1, y1] = polar(cx, cy, rOuter, start);
    const [x2, y2] = polar(cx, cy, rOuter, end);
    const [x3, y3] = polar(cx, cy, rInner, end);
    const [x4, y4] = polar(cx, cy, rInner, start);
    const d = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`;
    return { d, color: PALETTE[i % PALETTE.length], label: s.label, value: s.value, pct: frac };
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Verteilung">
        {arcs.map((a, i) => (
          <path key={i} d={a.d} fill={a.color} stroke="white" strokeWidth="1" className="dark:stroke-navy-900" />
        ))}
      </svg>
      <ul className="min-w-40 flex-1 space-y-1.5 text-sm">
        {arcs.map((a, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: a.color }} />
            <span className="min-w-0 flex-1 truncate">{a.label}</span>
            <span className="tabular-nums text-navy-400">{Math.round(a.pct * 100)}%</span>
            <span className="tabular-nums font-medium">{formatEuro(a.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BarList({ data, max }: { data: Slice[]; max?: number }) {
  const peak = max ?? Math.max(1, ...data.map((d) => d.value));
  if (data.every((d) => d.value === 0)) {
    return <p className="text-sm text-navy-400">Keine Daten im Zeitraum.</p>;
  }
  return (
    <ul className="space-y-2">
      {data.map((d, i) => (
        <li key={i} className="text-sm">
          <div className="flex items-center justify-between">
            <span className="truncate">{d.label}</span>
            <span className="tabular-nums font-medium">{formatEuro(d.value)}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-navy-100 dark:bg-navy-800">
            <div
              className="h-full rounded-full bg-navy-900 dark:bg-white"
              style={{ width: `${Math.max(2, (d.value / peak) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export function MonthlyBars({ values }: { values: number[] }) {
  const peak = Math.max(1, ...values);
  if (values.every((v) => v === 0)) {
    return <p className="text-sm text-navy-400">Keine Daten im Zeitraum.</p>;
  }
  return (
    <div className="flex h-44 items-end gap-2">
      {values.map((v, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <div
            className="w-full rounded-t bg-navy-900 dark:bg-white"
            style={{ height: `${v > 0 ? Math.max(3, (v / peak) * 90) : 0}%` }}
            title={formatEuro(v)}
          />
          <span className="text-[10px] text-navy-400">{MONTH_LABELS[i]}</span>
        </div>
      ))}
    </div>
  );
}
