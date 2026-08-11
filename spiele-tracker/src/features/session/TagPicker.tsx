import { useEffect, useState, type KeyboardEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { normaliseTags } from './sessionStore';

/**
 * Freitext-Tags plus zuletzt verwendete zur schnellen Auswahl.
 * Keine festen Kategorien – die Auswertung vergleicht später generisch
 * Sessions mit und ohne einen Tag.
 */
export function TagPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void supabase
      .rpc('recent_tags', { p_limit: 12 })
      .then(({ data }) => {
        if (!cancelled && data) setRecent(data.map((r) => r.tag));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function add(tag: string) {
    const next = normaliseTags([...value, tag]);
    onChange(next);
    setInput('');
  }

  function remove(tag: string) {
    onChange(value.filter((t) => t !== tag));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (input.trim()) add(input);
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      remove(value[value.length - 1]);
    }
  }

  const suggestions = recent.filter((t) => !value.includes(t));

  return (
    <div>
      <span className="mb-2 block text-sm text-slate-400">Tags für diese Session</span>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-surface-border bg-surface-raised p-2">
        {value.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => remove(tag)}
            className="rounded-lg bg-accent-muted px-2 py-1 text-sm"
          >
            {tag} ×
          </button>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => input.trim() && add(input)}
          placeholder={value.length === 0 ? 'z.B. kneipe, müde, turnier' : ''}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-base outline-none placeholder:text-slate-600"
        />
      </div>

      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add(tag)}
              className="rounded-lg border border-surface-border px-2 py-1 text-sm text-slate-400"
            >
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
