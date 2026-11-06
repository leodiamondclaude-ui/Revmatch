import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-4 text-center">
      <div>
        <div className="h-display text-8xl text-accent glow-text">404</div>
        <p className="mt-2 text-muted">Wrong turn. This page isn&apos;t on the map.</p>
        <Link href="/" className="btn-ghost mt-6">Back to the pits</Link>
      </div>
    </div>
  );
}
