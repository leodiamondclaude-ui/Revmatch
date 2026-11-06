export function Stat({ label, value, unit, sub, big }: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode; big?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={`num mt-1 flex items-baseline gap-1 font-semibold ${big ? "text-4xl" : "text-2xl"}`}>
        <span className="truncate">{value}</span>
        {unit && <span className="text-xs font-normal uppercase text-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function StatPanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`panel grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-4 ${className}`}>{children}</div>;
}
