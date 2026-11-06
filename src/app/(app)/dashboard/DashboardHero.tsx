"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { accentFromPaint } from "@/lib/color";
import type { Vehicle } from "@/lib/types";
import type { ViewerMod } from "@/components/three/VehicleViewer";

const VehicleViewer = dynamic(() => import("@/components/three/VehicleViewer"), { ssr: false, loading: () => <div className="h-full animate-pulse bg-surface-2" /> });

export function DashboardHero({ vehicle: v, mods }: { vehicle: Vehicle; mods: ViewerMod[] }) {
  return (
    <section className="panel panel-accent relative overflow-hidden">
      <VehicleViewer bodyStyle={v.body_style} config={v.model_config ?? {}} accent={accentFromPaint(v.model_config?.paint ?? v.exterior_color_hex)}
        modelUrl={v.model_url} mods={mods} autoRotate showPins={false} className="relative h-[300px] w-full sm:h-[380px]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-bg/90 via-bg/30 to-transparent" />
      <div className="absolute bottom-0 left-0 p-5 sm:p-7">
        <div className="label text-accent">Primary · {v.year} {v.make}</div>
        <div className="h-display text-4xl leading-none sm:text-5xl">{v.nickname || v.model}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {v.horsepower && <span className="chip bg-black/50">{v.horsepower} hp</span>}
          {v.drivetrain && <span className="chip bg-black/50">{v.drivetrain}</span>}
          <span className="chip bg-black/50">{mods.length} mods</span>
        </div>
        <Link href={`/v/${v.slug}`} className="btn-ghost pointer-events-auto mt-4 bg-black/40">Open build sheet</Link>
      </div>
    </section>
  );
}
