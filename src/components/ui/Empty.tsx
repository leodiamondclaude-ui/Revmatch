export function Empty({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="panel carbon flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="h-display text-2xl">{title}</div>
      {body && <p className="max-w-md text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}
