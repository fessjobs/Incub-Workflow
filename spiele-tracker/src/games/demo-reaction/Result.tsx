import type { GameResultProps } from '../types';
import type { ReactionConfig } from './config';

export function ReactionResult({ stats }: GameResultProps<ReactionConfig>) {
  const reactions = (stats.detail.reactions as number[] | undefined) ?? [];
  const max = Math.max(1, ...reactions);

  return (
    <div className="space-y-6">
      <p className="text-xl font-semibold">{stats.headline}</p>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Durchschnitt" value={`${Math.round(stats.metrics.avgReactionMs)} ms`} />
        <Tile label="Beste" value={`${stats.metrics.bestReactionMs} ms`} />
        <Tile label="Streuung" value={`± ${Math.round(stats.metrics.consistencyMs)} ms`} />
        <Tile label="Fehlstarts" value={String(stats.metrics.falseStarts)} />
      </div>

      <div className="space-y-2">
        {reactions.map((ms, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="w-6 text-right text-sm text-slate-500">{i + 1}</span>
            <div className="h-6 flex-1 rounded bg-surface-raised">
              <div
                className="h-full rounded bg-accent"
                style={{ width: `${(ms / max) * 100}%` }}
              />
            </div>
            <span className="w-16 text-right text-sm tabular-nums">{ms} ms</span>
          </div>
        ))}
      </div>

      {stats.insights.length > 0 && (
        <ul className="space-y-1 text-sm text-slate-400">
          {stats.insights.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
      )}
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
