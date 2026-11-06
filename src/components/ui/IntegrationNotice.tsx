export function IntegrationNotice({ name, envVar, children }: { name: string; envVar: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm">
      <div className="label !text-warn">Integration not configured</div>
      <p className="mt-1 text-ink/90">
        {name} needs <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">{envVar}</code> set on the server.
      </p>
      {children && <div className="mt-2 text-muted">{children}</div>}
    </div>
  );
}
