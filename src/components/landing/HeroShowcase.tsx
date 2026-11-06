"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { accentFromPaint, accentVars } from "@/lib/color";
import type { BodyStyle, ModelConfig } from "@/lib/types";

const VehicleViewer = dynamic(() => import("@/components/three/VehicleViewer"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center font-mono text-xs tracking-widest text-muted">INITIALISING RENDERER…</div>,
});

const BUILDS: { name: string; style: BodyStyle; config: ModelConfig }[] = [
  { name: "Guards Red · GT wing", style: "coupe", config: { paint: "#c8102e", finish: "gloss", spoiler: "gt_wing", splitter: true, diffuser: true, sideSkirts: true, wheelStyle: "five_spoke", wheelColor: "#1a1a1a", wheelSize: 20, rideHeight: -0.8, exhaust: "center", tint: 0.5, caliperColor: "#f2c500" } },
  { name: "Estoril Blue · touring", style: "sedan", config: { paint: "#1f4fa3", finish: "metallic", spoiler: "lip", wheelStyle: "multi_spoke", wheelColor: "#3a3d42", wheelSize: 19, rideHeight: -0.3, exhaust: "quad", tint: 0.6, caliperColor: "#1f4fa3" } },
  { name: "Papaya · stripes", style: "coupe", config: { paint: "#ff7a00", finish: "gloss", stripe: "racing", stripeColor: "#101010", spoiler: "ducktail", wheelStyle: "mesh", wheelColor: "#c9b28a", wheelSize: 18, exhaust: "dual", exhaustFinish: "black", tint: 0.3 } },
  { name: "Nardo Grey · wagon", style: "wagon", config: { paint: "#6f7378", finish: "satin", spoiler: "lip", wheelStyle: "turbofan", wheelColor: "#e5e5e5", wheelSize: 19, rideHeight: -0.5, exhaust: "quad", exhaustFinish: "titanium", tint: 0.8, splitter: true } },
  { name: "Acid Green · SUV", style: "suv", config: { paint: "#9be000", finish: "matte", wheelStyle: "dish", wheelColor: "#111", wheelSize: 21, rideHeight: 0.4, exhaust: "dual", exhaustFinish: "black", tint: 0.9 } },
];

export function HeroShowcase() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % BUILDS.length), 5000);
    return () => clearInterval(t);
  }, [paused]);
  const b = BUILDS[i];
  const accent = accentFromPaint(b.config.paint);

  useEffect(() => {
    const vars = accentVars(accent);
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  }, [accent]);

  return (
    <div className="relative" onPointerDown={() => setPaused(true)}>
      <VehicleViewer bodyStyle={b.style} config={b.config} accent={accent} autoRotate showPins={false} className="relative h-[46vh] min-h-[320px] w-full sm:h-[58vh] lg:h-[80vh] lg:[mask-image:linear-gradient(to_right,transparent,black_18%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-bg to-transparent" />
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3">
        {BUILDS.map((x, k) => (
          <button key={x.name} aria-label={x.name} onClick={() => { setI(k); setPaused(true); }}
            className="h-4 w-4 rounded-full border-2 transition" style={{ background: x.config.paint, borderColor: k === i ? "#fff" : "transparent", transform: k === i ? "scale(1.25)" : undefined }} />
        ))}
      </div>
      <div className="absolute left-4 top-4 chip-accent lg:left-auto lg:right-6 lg:top-24">{b.name}</div>
    </div>
  );
}
