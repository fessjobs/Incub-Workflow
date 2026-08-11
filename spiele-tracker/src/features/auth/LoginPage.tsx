import { useState, type FormEvent } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Layout } from '@/components/Layout';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const error = useAuthStore((s) => s.error);
  const signInWithEmail = useAuthStore((s) => s.signInWithEmail);
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    await signInWithEmail(email.trim());
    setBusy(false);
    setSent(true);
  }

  return (
    <Layout title="Anmelden">
      {sent ? (
        <div className="rounded-xl bg-surface-raised p-6">
          <p className="text-lg font-semibold">Link ist unterwegs</p>
          <p className="mt-2 text-slate-400">
            Wir haben eine E-Mail an <span className="text-slate-200">{email}</span> geschickt.
            Der Link darin meldet dich direkt an.
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-4 text-sm text-accent underline"
          >
            Andere Adresse verwenden
          </button>
        </div>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <label className="block">
            <span className="mb-2 block text-sm text-slate-400">E-Mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="du@example.com"
              className="w-full rounded-xl border border-surface-border bg-surface-raised px-4 py-3 text-base placeholder:text-slate-600"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-accent px-6 py-4 text-lg font-semibold text-surface disabled:opacity-50"
          >
            {busy ? 'Wird gesendet …' : 'Magic Link schicken'}
          </button>

          <div className="flex items-center gap-3 py-2 text-xs uppercase tracking-widest text-slate-600">
            <span className="h-px flex-1 bg-surface-border" />
            oder
            <span className="h-px flex-1 bg-surface-border" />
          </div>

          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            className="w-full rounded-xl border border-surface-border px-6 py-4 text-lg font-semibold"
          >
            Mit Google anmelden
          </button>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-bad">{error}</p>}
    </Layout>
  );
}
