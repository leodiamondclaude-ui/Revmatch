/* eslint-disable @next/next/no-img-element */
export function Avatar({ url, name, size = 40 }: { url?: string | null; name: string; size?: number }) {
  const initials = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "RM";
  return url ? (
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full border border-line object-cover" style={{ width: size, height: size }} />
  ) : (
    <div className="grid shrink-0 place-items-center rounded-full border border-accent/40 bg-accent-soft font-display font-bold italic text-accent" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
}
