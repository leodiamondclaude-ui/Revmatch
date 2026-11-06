/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { accentFromPaint } from "@/lib/color";
import { vehicleName } from "@/lib/units";
import type { Vehicle } from "@/lib/types";
import { AccentScope } from "@/components/ui/AccentScope";

export function VehicleCard({ v, modCount, owner }: { v: Vehicle; modCount?: number; owner?: string }) {
  const accent = accentFromPaint(v.exterior_color_hex);
  return (
    <AccentScope accent={accent}>
      <Link href={`/v/${v.slug}`} className="panel group block overflow-hidden transition duration-300 hover:-translate-y-1 hover:border-accent/50">
        <div className="relative aspect-[16/10] overflow-hidden bg-surface-2">
          {v.cover_photo_url ? (
            <img src={v.cover_photo_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          ) : (
            <div className="carbon grid h-full place-items-center">
              <div className="h-16 w-40 rounded-[40%_40%_12px_12px] opacity-80" style={{ background: `linear-gradient(180deg, ${v.exterior_color_hex ?? "#888"}, #000)` }} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          <div className="absolute left-3 top-3 flex gap-1.5">
            {v.visibility !== "public" && <span className="chip bg-black/60">{v.visibility}</span>}
            {v.model_source !== "procedural" && <span className="chip bg-black/60">{v.model_source === "ai" ? "AI model" : "3D model"}</span>}
          </div>
          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="label !text-accent">{v.year ?? "—"} · {v.make}</div>
            <div className="h-display truncate text-2xl leading-tight">{v.nickname || `${v.model}${v.trim ? " " + v.trim : ""}`}</div>
          </div>
          <div className="absolute bottom-0 left-0 h-[3px] w-0 bg-accent shadow-[0_0_12px_var(--accent)] transition-all duration-500 group-hover:w-full" />
        </div>
        <div className="grid grid-cols-3 divide-x divide-line border-t border-line text-center">
          <div className="p-3"><div className="label">Power</div><div className="num text-sm">{v.horsepower ? `${v.horsepower} hp` : "—"}</div></div>
          <div className="p-3"><div className="label">Mods</div><div className="num text-sm">{modCount ?? "—"}</div></div>
          <div className="p-3"><div className="label">{owner ? "Owner" : "Drive"}</div><div className="truncate text-sm">{owner ? `@${owner}` : v.drivetrain ?? "—"}</div></div>
        </div>
        <span className="sr-only">{vehicleName(v)}</span>
      </Link>
    </AccentScope>
  );
}
