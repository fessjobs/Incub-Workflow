import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GameResultProps } from '../types';
import type { DartClockConfig } from './config';
import type { TargetStat, WindowBucket } from './stats';

/**
 * Auswertung einer Session.
 *
 * Eine Abweichung von der ursprünglichen Vorgabe: Trefferquote und Wurfzahlen
 * stehen in zwei getrennten Diagrammen übereinander, nicht in einem mit zwei
 * Achsen. Eine zweite y-Achse mit anderem Maßstab lässt sich nicht zuverlässig
 * ablesen — der Verlauf bleibt vergleichbar, weil beide dieselbe x-Achse haben.
 *
 * Farben: Treffer und Fehlwurf sind gegen die dunkle Fläche auf Lesbarkeit und
 * Farbfehlsichtigkeit geprüft (ΔE 16.7 deutan, 32.7 normal).
 *
 * Alle Diagramme ohne Einblend-Animation: sie startet bei jeder
 * Größenänderung neu (Drehen des Handys), ignoriert prefers-reduced-motion
 * und bringt hier nichts, was das Ablesen erleichtert.
 */

const HIT = '#0891B2';
const MISS = '#E11D48';
const AXIS = '#5C6875';
const GRID = '#1C242E';

export function DartClockResult({ config, stats }: GameResultProps<DartClockConfig>) {
  const [asTable, setAsTable] = useState(false);

  const windows = (stats.detail.windows as WindowBucket[] | undefined) ?? [];
  const retrievals = (stats.detail.retrievals as number[] | undefined) ?? [];
  const perTarget = (stats.detail.perTarget as TargetStat[] | undefined) ?? [];
  const histogram =
    (stats.detail.errorHistogram as Array<{ distance: number; count: number }> | undefined) ?? [];

  const windowData = windows.map((w) => ({
    label: `${w.fromSec}`,
    Treffer: w.hits,
    Fehlwurf: w.throws - w.hits,
    quote: w.throws > 0 ? Math.round(w.hitRate * 100) : null,
  }));

  const hasErrorData = histogram.some((h) => h.count > 0);

  return (
    <div className="space-y-8">
      <p className="text-xl font-semibold">{stats.headline}</p>

      <div className="grid grid-cols-2 gap-3">
        <Tile
          label="Zahlen"
          value={`${stats.metrics.numbersCleared} / ${config.highestTarget}`}
        />
        <Tile label="Trefferquote" value={`${Math.round(stats.metrics.hitRate * 100)} %`} />
        <Tile label="Würfe / Minute" value={stats.metrics.throwsPerMinute.toFixed(1)} />
        <Tile
          label="Ø Ziehzeit"
          value={
            retrievals.length > 0 ? `${(stats.metrics.avgRetrievalMs / 1000).toFixed(1)} s` : '—'
          }
        />
      </div>

      {/* --- Würfe über die Zeit ------------------------------------- */}
      <section>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">Würfe je 10 Sekunden</h2>
          <button
            type="button"
            onClick={() => setAsTable(!asTable)}
            className="text-xs text-slate-500 underline"
          >
            {asTable ? 'Als Diagramm' : 'Als Tabelle'}
          </button>
        </div>

        <Legend />

        {asTable ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-1 pr-3 font-normal">Ab Sek.</th>
                  <th className="py-1 pr-3 font-normal">Würfe</th>
                  <th className="py-1 pr-3 font-normal">Treffer</th>
                  <th className="py-1 font-normal">Quote</th>
                </tr>
              </thead>
              <tbody>
                {windows.map((w) => (
                  <tr key={w.fromSec} className="border-t border-surface-border">
                    <td className="py-1 pr-3">{w.fromSec}</td>
                    <td className="py-1 pr-3">{w.throws}</td>
                    <td className="py-1 pr-3">{w.hits}</td>
                    <td className="py-1">{w.throws > 0 ? `${Math.round(w.hitRate * 100)} %` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={windowData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} />
                  <YAxis stroke={AXIS} fontSize={11} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    contentStyle={{
                      background: '#141A22',
                      border: '1px solid #2A343F',
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    labelFormatter={(v) => `Sekunde ${v}–${Number(v) + 10}`}
                  />
                  {/* Gestapelt: Treffer plus Fehlwurf ergibt die Wurfzahl,
                      die Höhe des farbigen Anteils ist die Quote. */}
                  <Bar dataKey="Treffer" stackId="w" fill={HIT} isAnimationActive={false} />
                  <Bar dataKey="Fehlwurf" stackId="w" fill={MISS} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <h3 className="mb-1 mt-4 text-sm text-slate-400">Trefferquote im Verlauf</h3>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={windowData} margin={{ top: 4, right: 4, bottom: 0, left: -4 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} />
                  <YAxis
                    stroke={AXIS}
                    fontSize={11}
                    tickLine={false}
                    domain={[0, 100]}
                    ticks={[0, 50, 100]}
                    tickFormatter={(v) => `${v}%`}
                    width={40}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#141A22',
                      border: '1px solid #2A343F',
                      borderRadius: 10,
                      fontSize: 12,
                    }}
                    formatter={(v) => [`${v} %`, 'Trefferquote']}
                    labelFormatter={(v) => `Sekunde ${v}–${Number(v) + 10}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="quote"
                    stroke={HIT}
                    strokeWidth={2}
                    dot={{ r: 3, fill: HIT, stroke: 'none' }}
                    connectNulls
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      {/* --- Ziehzeiten ----------------------------------------------- */}
      {retrievals.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-semibold">Ziehzeiten</h2>
          <p className="mb-2 text-sm text-slate-400">
            {Math.round(stats.metrics.retrievalShare * 100)} % der Zeit gingen fürs Pfeileholen
            drauf. Reine Wurfzeit: {(stats.metrics.activeMs / 1000).toFixed(0)} s.
          </p>
          <ul className="space-y-1">
            {retrievals.map((ms, i) => {
              const max = Math.max(...retrievals);
              return (
                <li key={i} className="flex items-center gap-3">
                  <span className="w-12 text-xs text-slate-500">Runde {i + 1}</span>
                  <span className="h-4 flex-1 rounded bg-surface-raised">
                    <span
                      className="block h-full rounded"
                      style={{ width: `${(ms / max) * 100}%`, background: HIT }}
                    />
                  </span>
                  <span className="w-14 text-right text-sm tabular-nums">
                    {(ms / 1000).toFixed(1)} s
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* --- Fehler-Range ---------------------------------------------- */}
      {hasErrorData && (
        <section>
          <h2 className="mb-1 text-base font-semibold">Wie weit daneben</h2>
          <p className="mb-2 text-sm text-slate-400">
            Abstand in Segmenten auf dem Kranz, nicht als Zahlendifferenz — die 20 liegt
            neben der 1. Im Schnitt {stats.metrics.avgErrorSegments.toFixed(1)} Segmente.
          </p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="distance" stroke={AXIS} fontSize={11} tickLine={false} />
                <YAxis stroke={AXIS} fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{
                    background: '#141A22',
                    border: '1px solid #2A343F',
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => `${v} Segmente daneben`}
                  formatter={(v) => [`${v}`, 'Würfe']}
                />
                <Bar dataKey="count" fill={MISS} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* --- Würfe je Zielzahl ----------------------------------------- */}
      {perTarget.length > 0 && (
        <section>
          <h2 className="mb-1 text-base font-semibold">Würfe bis zum Treffer</h2>
          <p className="mb-2 text-sm text-slate-400">
            Hohe Balken sind deine Angstzahlen.
          </p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perTarget} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="target" stroke={AXIS} fontSize={11} tickLine={false} />
                <YAxis stroke={AXIS} fontSize={11} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  contentStyle={{
                    background: '#141A22',
                    border: '1px solid #2A343F',
                    borderRadius: 10,
                    fontSize: 12,
                  }}
                  labelFormatter={(v) => `Zielzahl ${v}`}
                  formatter={(v) => [`${v}`, 'Würfe']}
                />
                <Bar dataKey="throws" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {perTarget.map((t) => (
                    // Nicht geschaffte Zahlen abgesetzt, damit der letzte,
                    // abgebrochene Balken nicht wie eine Angstzahl aussieht.
                    <Cell key={t.target} fill={t.cleared ? HIT : MISS} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {stats.insights.length > 0 && (
        <section>
          <h2 className="mb-2 text-base font-semibold">Aufgefallen</h2>
          <ul className="space-y-1 text-sm text-slate-400">
            {stats.insights.map((line) => (
              <li key={line}>· {line}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-slate-600">
        Heatmap über die Scheibe und der Vergleich über mehrere Sessions kommen mit
        dem Logbuch.
      </p>
    </div>
  );
}

function Legend() {
  return (
    <div className="mb-2 flex gap-4 text-xs text-slate-400">
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: HIT }} /> Treffer
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: MISS }} /> Fehlwurf
      </span>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-raised p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
