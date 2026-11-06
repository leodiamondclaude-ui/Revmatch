import Link from "next/link";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="RevMatch home">
      <svg viewBox="0 0 40 28" className="h-6 w-auto" aria-hidden>
        <path d="M2 26 L14 2 H24 L14 20 H34 L31 26 Z" fill="var(--accent)" />
        <path d="M27 2 H38 L35 8 H24 Z" fill="currentColor" opacity="0.85" />
      </svg>
      {!compact && <span className="h-display text-xl leading-none">Rev<span className="text-accent">Match</span></span>}
    </Link>
  );
}
