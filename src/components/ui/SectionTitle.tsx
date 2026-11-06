export function SectionTitle({ kicker, title, action }: { kicker?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        {kicker && <div className="label text-accent">{kicker}</div>}
        <h2 className="h-display text-2xl sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}
