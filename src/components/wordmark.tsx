// Wortmarke in Anlehnung an die Gruppen-Schreibweise (incub:live)
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-semibold tracking-tight ${className}`}>
      incub<span className="text-navy-400">:</span>workflow
    </span>
  );
}
