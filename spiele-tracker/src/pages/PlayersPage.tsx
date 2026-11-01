import { useEffect, useRef, useState } from 'react';
import { backend, testMode, type Profile } from '@/lib/backend';
import { PLAYER_COLORS, PLAYER_EMOJI } from '@/lib/backend/localBackend';
import { Layout } from '@/components/Layout';

/**
 * Spielerverwaltung: Name, Bild, Farbe und Charakter.
 *
 * Das Foto landet als Data-URL im Profil. Für ein paar Freunde ist das in
 * Ordnung — es wird vorher auf 256 px heruntergerechnet, damit der Speicher
 * nicht vollläuft. Im echten Betrieb gehört das Bild nach Supabase Storage;
 * dieselbe Oberfläche, nur ein anderer Ablageort.
 */
export function PlayersPage() {
  const [players, setPlayers] = useState<Profile[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);

  async function reload() {
    setPlayers(await backend.profiles.list());
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function addPlayer() {
    const name = newName.trim();
    if (!name || !backend.profiles.createLocal) return;
    await backend.profiles.createLocal(name);
    setNewName('');
    await reload();
  }

  return (
    <Layout title="Spieler">
      {loading ? (
        <p className="text-slate-500">Wird geladen …</p>
      ) : (
        <ul className="space-y-3">
          {players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              open={editing === player.id}
              onToggle={() => setEditing(editing === player.id ? null : player.id)}
              onChanged={reload}
            />
          ))}
        </ul>
      )}

      {testMode && backend.profiles.createLocal && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void addPlayer();
          }}
          className="mt-5 flex gap-2"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Neuer Spieler"
            maxLength={40}
            className="min-w-0 flex-1 rounded-xl border border-surface-border bg-surface-raised px-3 py-3 placeholder:text-slate-600"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="rounded-xl bg-accent px-5 py-3 font-semibold text-surface disabled:opacity-40"
          >
            Anlegen
          </button>
        </form>
      )}
    </Layout>
  );
}

function PlayerCard({
  player,
  open,
  onToggle,
  onChanged,
}: {
  player: Profile;
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(player.displayName);
  const [character, setCharacter] = useState(player.character ?? '');
  const fileRef = useRef<HTMLInputElement>(null);

  async function patch(changes: Partial<Profile>) {
    await backend.profiles.update(player.id, changes);
    await onChanged();
  }

  async function handlePhoto(file: File) {
    const dataUrl = await shrinkImage(file, 256);
    await patch({ avatarUrl: dataUrl });
  }

  return (
    <li className="rounded-2xl bg-surface-raised">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <Face player={player} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{player.displayName}</span>
          <span className="block truncate text-sm text-slate-400">
            {player.character || 'Kein Charakter gewählt'}
          </span>
        </span>
        <span className="text-slate-500">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-surface-border p-4">
          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => name.trim() && name !== player.displayName && void patch({ displayName: name.trim() })}
              maxLength={40}
              className="w-full rounded-xl border border-surface-border bg-surface px-3 py-2"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs text-slate-400">
              Charakter (frei, z.B. „Der Ruhige“ oder „Triple-Jäger“)
            </span>
            <input
              value={character}
              onChange={(e) => setCharacter(e.target.value)}
              onBlur={() => character !== (player.character ?? '') && void patch({ character })}
              maxLength={40}
              placeholder="…"
              className="w-full rounded-xl border border-surface-border bg-surface px-3 py-2 placeholder:text-slate-600"
            />
          </label>

          <div>
            <span className="mb-2 block text-xs text-slate-400">Bild</span>
            <div className="flex flex-wrap gap-2">
              {PLAYER_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => void patch({ emoji, avatarUrl: null })}
                  aria-pressed={player.emoji === emoji && !player.avatarUrl}
                  className={[
                    'h-10 w-10 rounded-full text-xl',
                    player.emoji === emoji && !player.avatarUrl
                      ? 'ring-2 ring-accent'
                      : 'bg-surface',
                  ].join(' ')}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePhoto(file);
              }}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-xl border border-surface-border px-4 py-2 text-sm"
              >
                Foto wählen
              </button>
              {player.avatarUrl && (
                <button
                  type="button"
                  onClick={() => void patch({ avatarUrl: null })}
                  className="rounded-xl border border-surface-border px-4 py-2 text-sm text-slate-400"
                >
                  Foto entfernen
                </button>
              )}
            </div>
          </div>

          <div>
            <span className="mb-2 block text-xs text-slate-400">Farbe</span>
            <div className="flex flex-wrap gap-2">
              {PLAYER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => void patch({ color })}
                  aria-label={`Farbe ${color}`}
                  aria-pressed={player.color === color}
                  className={[
                    'h-8 w-8 rounded-full',
                    player.color === color ? 'ring-2 ring-offset-2 ring-offset-surface-raised ring-slate-100' : '',
                  ].join(' ')}
                  style={{ background: color }}
                />
              ))}
            </div>
          </div>

          {backend.profiles.removeLocal && (
            <button
              type="button"
              onClick={async () => {
                await backend.profiles.removeLocal?.(player.id);
                await onChanged();
              }}
              className="text-sm text-bad underline"
            >
              Spieler entfernen
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function Face({ player, size = 40 }: { player: Profile; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-surface"
      style={{
        width: size,
        height: size,
        background: player.color ?? '#1C242E',
        fontSize: size * 0.5,
      }}
      aria-hidden
    >
      {player.avatarUrl ? (
        <img src={player.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        (player.emoji ?? player.displayName.charAt(0).toUpperCase())
      )}
    </span>
  );
}

/**
 * Bild auf Kantenlänge `max` herunterrechnen und als JPEG-Data-URL liefern.
 * Ein Handyfoto hat schnell 4 MB — das würde den localStorage sprengen.
 */
async function shrinkImage(file: File, max: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas nicht verfügbar');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.8);
}
