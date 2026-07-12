import { requireUser } from "@/lib/auth";
import { Wordmark } from "@/components/wordmark";
import { logout } from "@/app/login/actions";

export default async function ErfassenLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <div className="min-h-screen bg-surface-muted dark:bg-navy-950">
      <header className="flex items-center justify-between border-b border-navy-100 bg-white px-4 py-3 dark:border-navy-800 dark:bg-navy-900">
        <Wordmark className="text-lg" />
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-navy-400 sm:inline">{user.name}</span>
          <form action={logout}>
            <button type="submit" className="text-sm text-navy-500 underline underline-offset-2">
              Abmelden
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-lg px-4 py-8">{children}</main>
    </div>
  );
}
