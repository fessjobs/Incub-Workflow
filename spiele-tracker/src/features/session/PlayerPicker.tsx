import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SessionPlayer } from '@/games/types';

/**
 * Wer spielt mit?
 *
 * Alle Teilnehmer haben einen Account (Entscheidung vom 30.10.: kein
 * Gastzugang). Gespielt wird an einem Handy, das herumgereicht wird – deshalb
 * wählt der, der das Gerät hält, hier einfach die Mitspieler aus.
 *
 * Die Liste kommt direkt aus `profiles`. Mehr als die eigenen Gruppenmitglieder
 * liefert die Datenbank ohnehin nicht zurück, dafür sorgt die RLS-Policy – der
 * Client muss also nicht filtern.
 */
export function PlayerPicker({
  selected,
  onChange,
  min,
  max,
  meId,
}: {
  selected: SessionPlayer[];
  onChange: (players: SessionPlayer[]) => void;
  min: number;
  max: number;
  meId: string | null;
}) {
  const [available, setAvailable] = useState<SessionPlayer[]>([]);
  const [loading, setLoading] = useState(true);

  // Einzelspieler-Spiele brauchen weder Auswahl noch Abfrage.
  const soloOnly = max <= 1;

  useEffect(() => {
    let cancelled = false;

    if (soloOnly) {
      setLoading(false);
      return;
    }

    void supabase
      .from('profiles')
      .select('id, display_name, avatar_url')
      .order('display_name')
      .then(({ data }) => {
        if (cancelled) return;
        const people = (data ?? []).map((row) => ({
          id: row.id,
          displayName: row.display_name,
          avatarUrl: row.avatar_url,
        }));
        setAvailable(people);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Bewusst nur einmal: die Liste ändert sich während des Setups nicht.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloOnly]);

  function toggle(player: SessionPlayer) {
    const isOn = selected.some((p) => p.id === player.id);
    if (isOn) {
      onChange(selected.filter((p) => p.id !== player.id));
    } else if (selected.length < max) {
      onChange([...selected, player]);
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...selected];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  // Bei Einzelspieler-Spielen ist die Auswahl nur Ballast – und zwar bevor
  // irgendetwas geladen wird.
  if (soloOnly) return null;

  if (loading) {
    return <p className="text-sm text-slate-500">Mitspieler werden geladen …</p>;
  }

  return (
    <div>
      <span className="mb-2 block text-sm text-slate-400">
        Wer spielt mit? {min === max ? `(genau ${min})` : `(${min} bis ${max})`}
      </span>

      <div className="flex flex-wrap gap-2">
        {available.map((person) => {
          const index = selected.findIndex((p) => p.id === person.id);
          const isOn = index >= 0;
          return (
            <button
              key={person.id}
              type="button"
              onClick={() => toggle(person)}
              aria-pressed={isOn}
              disabled={!isOn && selected.length >= max}
              className={[
                'rounded-xl border px-3 py-2 text-sm',
                isOn
                  ? 'border-accent bg-accent-muted text-slate-100'
                  : 'border-surface-border text-slate-400',
                !isOn && selected.length >= max ? 'opacity-40' : '',
              ].join(' ')}
            >
              {isOn && <span className="mr-1 tabular-nums text-accent">{index + 1}</span>}
              {person.displayName}
              {person.id === meId && <span className="ml-1 text-slate-500">(du)</span>}
            </button>
          );
        })}
      </div>

      {selected.length > 1 && (
        <div className="mt-3 space-y-1">
          <span className="block text-xs text-slate-500">
            Reihenfolge am Abwurfpunkt
          </span>
          {selected.map((player, i) => (
            <div key={player.id} className="flex items-center gap-2 text-sm">
              <span className="w-5 tabular-nums text-slate-500">{i + 1}.</span>
              <span className="flex-1 truncate">{player.displayName}</span>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`${player.displayName} nach vorn`}
                className="rounded-lg border border-surface-border px-2 py-1 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === selected.length - 1}
                aria-label={`${player.displayName} nach hinten`}
                className="rounded-lg border border-surface-border px-2 py-1 disabled:opacity-30"
              >
                ↓
              </button>
            </div>
          ))}
        </div>
      )}

      {selected.length < min && (
        <p className="mt-2 text-sm text-warn">
          Noch {min - selected.length} {min - selected.length === 1 ? 'Spieler' : 'Spieler'} nötig.
        </p>
      )}

      {available.length <= 1 && (
        <p className="mt-2 text-sm text-slate-500">
          Es taucht nur dein eigenes Profil auf. Mitspieler erscheinen hier,
          sobald ihr in derselben Gruppe seid.
        </p>
      )}
    </div>
  );
}
