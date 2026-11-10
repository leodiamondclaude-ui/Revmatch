"use client";
import type { BodyStyle, ModelConfig } from "@/lib/types";
import { PAINT_SWATCHES } from "@/lib/color";

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5"><div className="label">{label}</div>{children}</div>
);

function Seg<T extends string>({ value, options, onChange }: { value: T | undefined; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`rounded-md border px-2.5 py-1.5 text-xs transition ${value === v ? "border-accent bg-accent/15 text-ink" : "border-line text-muted hover:border-line-strong"}`}>{l}</button>
      ))}
    </div>
  );
}

function ColorField({ value, onChange, swatches = false }: { value?: string | null; onChange: (v: string) => void; swatches?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="color" value={value ?? "#888888"} onChange={(e) => onChange(e.target.value)} className="h-9 w-12 cursor-pointer rounded border border-line bg-transparent" />
      <input className="input !w-28 font-mono" value={value ?? ""} onChange={(e) => /^#[0-9a-f]{0,6}$/i.test(e.target.value) && onChange(e.target.value)} />
      {swatches && PAINT_SWATCHES.map((s) => (
        <button key={s.hex} type="button" title={s.name} onClick={() => onChange(s.hex)} className="h-6 w-6 rounded-full border border-white/20" style={{ background: s.hex }} />
      ))}
    </div>
  );
}

export function ModelConfigurator({ bodyStyle, config, onBodyStyle, onChange }: {
  bodyStyle: BodyStyle; config: ModelConfig; onBodyStyle: (b: BodyStyle) => void; onChange: (c: ModelConfig) => void;
}) {
  const set = <K extends keyof ModelConfig>(k: K, v: ModelConfig[K]) => onChange({ ...config, [k]: v });
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Row label="3D representation">
          <Seg value={config.representation ?? "studio"} onChange={(v) => set("representation", v)}
            options={[["studio", "Realistic studio model"], ["parametric", "Parametric (matches body style)"]]} />
          <p className="text-xs text-muted">
            {(config.representation ?? "studio") === "studio"
              ? "A photoreal sports-car body shown with your paint, finish, wheel colour, calipers, tint, ride height and aero. It is a stand-in, not your car's exact shape. For an exact match, import a library model or generate one from your photos."
              : "A simplified model generated from your body style. Less realistic, but its proportions follow your car type and every option below applies."}
          </p>
        </Row>
      </div>
      <Row label="Body style">
        <Seg value={bodyStyle} onChange={onBodyStyle} options={[["coupe", "Coupe"], ["sedan", "Sedan"], ["hatch", "Hatch"], ["wagon", "Wagon"], ["suv", "SUV"], ["truck", "Truck"]]} />
      </Row>
      <Row label="Paint finish">
        <Seg value={config.finish} onChange={(v) => set("finish", v)} options={[["gloss", "Gloss"], ["metallic", "Metallic"], ["satin", "Satin"], ["matte", "Matte"]]} />
      </Row>
      <div className="sm:col-span-2"><Row label="Paint"><ColorField swatches value={config.paint} onChange={(v) => set("paint", v)} /></Row></div>
      <Row label={(config.representation ?? "studio") === "studio" ? "Wheel design (parametric only)" : "Wheel design"}>
        <Seg value={config.wheelStyle} onChange={(v) => set("wheelStyle", v)} options={[["five_spoke", "5-spoke"], ["multi_spoke", "Multi"], ["mesh", "Mesh"], ["dish", "Dish"], ["turbofan", "Turbofan"]]} />
      </Row>
      <Row label={`Wheel size · ${config.wheelSize ?? 18}"${(config.representation ?? "studio") === "studio" ? " (parametric only)" : ""}`}>
        <input type="range" min={15} max={22} value={config.wheelSize ?? 18} onChange={(e) => set("wheelSize", +e.target.value)} className="w-full accent-[var(--accent)]" />
      </Row>
      <Row label="Wheel finish"><ColorField value={config.wheelColor} onChange={(v) => set("wheelColor", v)} /></Row>
      <Row label="Calipers"><ColorField value={config.caliperColor} onChange={(v) => set("caliperColor", v)} /></Row>
      <Row label={`Ride height · ${(config.rideHeight ?? 0) < -0.6 ? "slammed" : (config.rideHeight ?? 0) < -0.1 ? "lowered" : (config.rideHeight ?? 0) > 0.2 ? "lifted" : "stock"}`}>
        <input type="range" min={-1} max={1} step={0.1} value={config.rideHeight ?? 0} onChange={(e) => set("rideHeight", +e.target.value)} className="w-full accent-[var(--accent)]" />
      </Row>
      <Row label={`Window tint · ${Math.round((config.tint ?? 0.35) * 100)}%`}>
        <input type="range" min={0} max={1} step={0.05} value={config.tint ?? 0.35} onChange={(e) => set("tint", +e.target.value)} className="w-full accent-[var(--accent)]" />
      </Row>
      <Row label="Rear aero">
        <Seg value={config.spoiler ?? "none"} onChange={(v) => set("spoiler", v)} options={[["none", "None"], ["lip", "Lip"], ["ducktail", "Ducktail"], ["wing", "Wing"], ["gt_wing", "GT wing"]]} />
      </Row>
      <Row label="Aero & body kit">
        <div className="flex flex-wrap gap-1.5">
          {([["splitter", "Splitter"], ["diffuser", "Diffuser"], ["sideSkirts", "Side skirts"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => set(k, !config[k])}
              className={`rounded-md border px-2.5 py-1.5 text-xs ${config[k] ? "border-accent bg-accent/15" : "border-line text-muted"}`}>{l}</button>
          ))}
        </div>
      </Row>
      <Row label="Exhaust layout">
        <Seg value={config.exhaust ?? "dual"} onChange={(v) => set("exhaust", v)} options={[["single", "Single"], ["dual", "Dual"], ["quad", "Quad"], ["center", "Center"]]} />
      </Row>
      <Row label="Tip finish">
        <Seg value={config.exhaustFinish ?? "chrome"} onChange={(v) => set("exhaustFinish", v)} options={[["chrome", "Chrome"], ["black", "Black"], ["titanium", "Titanium"]]} />
      </Row>
      <Row label={(config.representation ?? "studio") === "studio" ? "Decals / stripes (parametric only)" : "Decals / stripes"}>
        <Seg value={config.stripe ?? "none"} onChange={(v) => onChange({ ...config, stripe: v, stripeColor: config.stripeColor ?? "#ffffff" })} options={[["none", "None"], ["racing", "Racing"], ["side", "Side"]]} />
      </Row>
      {config.stripe && config.stripe !== "none" && <Row label="Stripe colour"><ColorField value={config.stripeColor} onChange={(v) => set("stripeColor", v)} /></Row>}
    </div>
  );
}
