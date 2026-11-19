/** Send a browser crash to /api/errors. Fire and forget. */
export function reportClientError(error: Error & { digest?: string }) {
  try {
    const body = JSON.stringify({ message: String(error.message || "Unknown error").slice(0, 2000), stack: error.stack?.slice(0, 8000), digest: error.digest, path: location.pathname });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/errors", new Blob([body], { type: "application/json" }));
    else fetch("/api/errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } catch { /* nothing else to do */ }
}
