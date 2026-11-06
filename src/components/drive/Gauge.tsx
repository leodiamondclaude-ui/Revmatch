/** Telemetry-style speed arc. */
export function Gauge({ value, max, unit, label, sub }: { value: number | null; max: number; unit: string; label?: string; sub?: React.ReactNode }) {
  const v = Math.max(0, Math.min(max, value ?? 0));
  const START = 135, SWEEP = 270;
  const r = 88, cx = 100, cy = 100;
  const pt = (deg: number, rad = r) => [cx + rad * Math.cos((deg * Math.PI) / 180), cy + rad * Math.sin((deg * Math.PI) / 180)];
  const arc = (a0: number, a1: number) => {
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const end = START + (v / max) * SWEEP;
  const ticks = Array.from({ length: 28 }, (_, i) => START + (i / 27) * SWEEP);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[320px]">
      <svg viewBox="0 0 200 200" className="h-full w-full">
        <path d={arc(START, START + SWEEP)} stroke="rgba(255,255,255,0.07)" strokeWidth="10" fill="none" strokeLinecap="round" />
        {v > 0 && <path d={arc(START, end)} stroke="var(--accent)" strokeWidth="10" fill="none" strokeLinecap="round" style={{ filter: "drop-shadow(0 0 6px var(--accent))", transition: "d 0.4s" }} />}
        {ticks.map((t, i) => {
          const [x0, y0] = pt(t, 74), [x1, y1] = pt(t, i % 3 === 0 ? 66 : 70);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={t <= end && v > 0 ? "var(--accent)" : "rgba(255,255,255,0.2)"} strokeWidth={i % 3 === 0 ? 1.6 : 0.8} />;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label && <div className="label">{label}</div>}
        <div className="num text-7xl font-bold leading-none tracking-tighter">{value == null ? "—" : Math.round(value)}</div>
        <div className="label mt-1">{unit}</div>
        {sub && <div className="mt-2">{sub}</div>}
      </div>
    </div>
  );
}
