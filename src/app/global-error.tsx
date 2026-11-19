"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/report-client-error";

/** Last-resort boundary when the root layout itself fails. Has to bring its own html/body. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(error); }, [error]);
  return (
    <html lang="en">
      <body style={{ background: "#0a0b0d", color: "#f2f3f5", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 16 }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 28, margin: "0 0 8px" }}>RevMatch hit a problem</h1>
          <p style={{ color: "#9aa0a6" }}>We&apos;ve logged it. Reload to try again.</p>
          {error.digest && <p style={{ fontFamily: "monospace", fontSize: 12, color: "#6b7177" }}>Reference: {error.digest}</p>}
          <button type="button" onClick={reset} style={{ marginTop: 12, padding: "10px 18px", borderRadius: 10, border: 0, background: "#e10600", color: "#000", fontWeight: 700, cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
