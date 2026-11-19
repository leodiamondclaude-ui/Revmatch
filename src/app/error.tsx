"use client";
import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(error); }, [error]);
  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
      <h1 className="h-display text-3xl">Something broke</h1>
      <p className="text-muted">We&apos;ve logged it. Try again, and if it keeps happening, head back to your garage.</p>
      {error.digest && <p className="font-mono text-xs text-dim">Reference: {error.digest}</p>}
      <div className="flex justify-center gap-2">
        <button type="button" className="btn-primary" onClick={reset}>Try again</button>
        <Link href="/dashboard" className="btn-ghost">Garage</Link>
      </div>
    </div>
  );
}
