/**
 * The build sheet: everything an owner can show off about a car beyond the core vehicle columns.
 * Stored in vehicles.build (public, follows the vehicle's visibility) with anything the owner hides
 * moved to vehicle_private.hidden. Shared by the editor, the setup flow and the vehicle page.
 */

export type FieldType = "text" | "number" | "select" | "textarea" | "month" | "date" | "url";
export interface Field { path: string; label: string; type?: FieldType; unit?: string; opts?: string[]; ph?: string; span?: boolean; step?: string; max?: number }

const T = (path: string, label: string, ph?: string, extra: Partial<Field> = {}): Field => ({ path, label, type: "text", ph, ...extra });
const N = (path: string, label: string, unit?: string, extra: Partial<Field> = {}): Field => ({ path, label, type: "number", unit, ...extra });
const S = (path: string, label: string, opts: string[], extra: Partial<Field> = {}): Field => ({ path, label, type: "select", opts, ...extra });
const A = (path: string, label: string, ph?: string): Field => ({ path, label, type: "textarea", ph, span: true, max: 3000 });

export const BUILD_STYLES = ["Daily driver", "Weekend car", "Track build", "Show car", "Canyon carver", "Drag build", "Overland / off-road", "Project in progress", "Stock & original"] as const;
const FUELS = ["91 octane", "93 octane", "98 octane", "E85", "Race fuel", "Diesel", "Electric"];

export interface Section { id: string; title: string; hint?: string; fields: Field[] }

/** Editor sections, in order. Paths are inside vehicles.build. */
export const SECTIONS: Section[] = [
  { id: "story", title: "Story & ownership", fields: [
    T("profile.tagline", "Tagline", "One line that sums up the build", { span: true, max: 90 }),
    S("profile.status", "What it's built for", [...BUILD_STYLES]),
    T("profile.clubs", "Clubs & crews", "e.g. Local GT club"),
    A("profile.next", "What's next", "The plan for the next stage"),
    { path: "profile.since", label: "Owned since", type: "month" },
    S("profile.owner", "Ownership", ["1st owner", "2nd owner", "3rd owner", "4th owner or later"]),
    T("profile.from", "Bought from", "Dealer, private sale, auction"),
    T("profile.location", "Based in", "City"),
    T("profile.edition", "Edition / build number", "e.g. #142 of 500"),
    T("profile.insta", "Car's Instagram", "@yourbuild"),
  ] },
  { id: "engine", title: "Engine & drivetrain", fields: [
    T("specs.engineCode", "Engine code", "e.g. EA888"), S("specs.aspiration", "Aspiration", ["Naturally aspirated", "Turbocharged", "Twin-turbo", "Supercharged", "Hybrid", "Electric"]),
    T("specs.displacement", "Displacement", "e.g. 1,984 cc"), T("specs.gears", "Gears", "e.g. 6-speed"), S("specs.fuel", "Fuel", FUELS),
    N("specs.redline", "Redline", "rpm"), N("specs.hpRpm", "Peak power at", "rpm"), N("specs.boost", "Boost", "psi", { step: "0.1" }), T("specs.compression", "Compression", "e.g. 9.6:1"),
    T("engine.turbo", "Turbo / supercharger"), T("engine.intercooler", "Intercooler"), T("engine.intake", "Intake"), T("engine.headers", "Headers / manifold"),
    T("engine.exhaust", "Exhaust"), T("engine.fuel", "Fuel system", "Injectors, pump"), T("engine.internals", "Internals", "Pistons, rods, cams"),
    T("engine.tune", "ECU & tune"), T("engine.tuner", "Tuned by"), T("engine.cooling", "Cooling"),
    T("driveline.clutch", "Clutch"), T("driveline.flywheel", "Flywheel"), T("driveline.diff", "Differential"), T("driveline.final", "Final drive", "e.g. 4.10"), T("driveline.shifter", "Shifter"),
  ] },
  { id: "performance", title: "Performance", hint: "Factory power goes here; current power is on the Details tab.", fields: [
    N("specs.stockHp", "Factory power", "hp"), N("specs.weight", "Curb weight", "lb"), T("specs.dist", "Weight split", "e.g. 39 / 61"),
    N("specs.zero60", "0–60 mph", "s", { step: "0.01" }), N("specs.s0100", "0–100 mph", "s", { step: "0.01" }), N("specs.s60130", "60–130 mph", "s", { step: "0.01" }),
    N("specs.eighth", "Eighth mile", "s", { step: "0.001" }), N("specs.quarter", "Quarter mile", "s", { step: "0.001" }), N("specs.trap", "Trap speed", "mph", { step: "0.1" }),
    N("specs.top", "Top speed", "mph"), N("specs.brake60", "60–0 braking", "ft"), N("specs.latg", "Lateral grip", "g", { step: "0.01" }),
    N("specs.mpg", "Fuel economy", "mpg", { step: "0.1" }), N("specs.range", "Range", "mi"),
  ] },
  { id: "chassis", title: "Wheels, brakes & suspension", fields: [
    T("chassis.wheelBrand", "Wheel brand"), T("chassis.wheelModel", "Wheel model"), T("chassis.wheelF", "Front wheel size", "20×9.5 ET50"), T("chassis.wheelR", "Rear wheel size"),
    T("chassis.tyreBrand", "Tyre brand"), T("chassis.tyreModel", "Tyre model"), T("chassis.tyreF", "Front tyres", "275/35 R20"), T("chassis.tyreR", "Rear tyres"),
    N("chassis.psiF", "Pressure front", "psi"), N("chassis.psiR", "Pressure rear", "psi"), T("chassis.spacers", "Spacers"),
    T("chassis.brakesF", "Front brakes"), T("chassis.brakesR", "Rear brakes"), T("chassis.pads", "Pads & fluid"),
    T("chassis.susp", "Suspension", "e.g. 3-way coilovers", { span: true }), T("chassis.springs", "Spring rates"), T("chassis.dampers", "Damper settings"),
    T("chassis.rideH", "Ride height"), T("chassis.camber", "Camber"), T("chassis.toe", "Toe"), T("chassis.corner", "Corner weights"), T("chassis.braces", "Braces & bars"),
  ] },
  { id: "exterior", title: "Exterior details", fields: [
    T("exterior.wrap", "Wrap / PPF"), T("exterior.coating", "Coating"), T("exterior.kit", "Body kit"), T("exterior.hood", "Hood"), T("exterior.bumpers", "Bumpers & lip"),
    T("exterior.mirrors", "Mirrors"), T("exterior.lights", "Lighting"), T("exterior.taillights", "Taillights"), T("exterior.badges", "Badges"), A("exterior.notes", "Body & aero details"),
  ] },
  { id: "interior", title: "Interior", fields: [
    T("interior.material", "Seat material", "e.g. Black leather"), T("interior.seats", "Seats"), T("interior.wheel", "Steering wheel"), T("interior.gauges", "Gauges"),
    T("interior.lighting", "Interior lighting"), T("interior.console", "Centre console"), T("interior.harness", "Harness"), T("interior.cage", "Cage / bar"),
    T("interior.audio", "Audio"), T("interior.knob", "Shift knob"), A("interior.notes", "Interior details"),
  ] },
];

export interface RecordField extends Field { req?: boolean }
export interface RecordKind { id: "dyno" | "crew" | "links"; title: string; add: string; empty: string; fields: RecordField[] }
export const RECORDS: RecordKind[] = [
  { id: "dyno", title: "Dyno runs", add: "Add a dyno run", empty: "No dyno sheets yet.", fields: [
    { path: "date", label: "Date", type: "date" }, { path: "whp", label: "Wheel power", type: "number", unit: "whp", req: true },
    { path: "shop", label: "Dyno / shop", type: "text" }, { path: "fuel", label: "Fuel", type: "select", opts: FUELS }, { path: "setup", label: "Setup at the time", type: "text", ph: "e.g. Stage 1 + exhaust" },
  ] },
  { id: "crew", title: "Shops & shout-outs", add: "Add a shout-out", empty: "No one credited yet.", fields: [
    { path: "name", label: "Name", type: "text", req: true }, { path: "role", label: "Role", type: "select", opts: ["Tuner", "Install shop", "Fabrication", "Paint & body", "Wrap & PPF", "Detailer", "Photographer", "Sponsor", "Friend who helped"] },
    { path: "handle", label: "Instagram / website", type: "text" }, { path: "what", label: "What they did", type: "text" },
  ] },
  { id: "links", title: "Videos & links", add: "Add a link", empty: "No links yet.", fields: [
    { path: "kind", label: "Type", type: "select", opts: ["YouTube video", "Instagram post", "TikTok", "Exhaust sound clip", "Feature article", "Build thread", "Other"] },
    { path: "title", label: "Title", type: "text", req: true }, { path: "url", label: "Link", type: "url", req: true, ph: "https://…" },
  ] },
];

export interface BuildSheet {
  profile?: Record<string, string | number | null | string[]>;
  specs?: Record<string, string | number | null>;
  engine?: Record<string, string | null>;
  driveline?: Record<string, string | null>;
  chassis?: Record<string, string | number | null>;
  exterior?: Record<string, string | null>;
  interior?: Record<string, string | null>;
  looks?: { headlights?: string | null; interiorHex?: string | null; tips?: string | null };
  flair?: string[];
  dyno?: { id: string; date?: string | null; whp: number; shop?: string | null; fuel?: string | null; setup?: string | null }[];
  crew?: { id: string; name: string; role?: string | null; handle?: string | null; what?: string | null }[];
  links?: { id: string; kind?: string | null; title: string; url: string }[];
  privacy?: { hideLocation?: boolean; hideMileage?: boolean; showPrice?: boolean };
  /** Purchase price, present only when the owner chose to show it. */
  price?: number | null;
  /** Fields that came from AI and haven't been confirmed (the setup flow only writes confirmed ones). */
  aiUnconfirmed?: string[];
}

export const getPath = (o: unknown, p: string): unknown => p.split(".").reduce<unknown>((a, k) => (a == null ? a : (a as Record<string, unknown>)[k]), o);
export function setPath<T extends object>(o: T, p: string, v: unknown): T {
  const ks = p.split("."), out = structuredClone(o) as Record<string, unknown>;
  let t = out;
  for (const k of ks.slice(0, -1)) t = (t[k] = { ...((t[k] as Record<string, unknown>) ?? {}) }) as Record<string, unknown>;
  t[ks[ks.length - 1]] = v === "" ? null : v;
  return out as T;
}

/** Links must be real https URLs on a public host. */
export const safeUrl = (u: string) => { try { const x = new URL(u); return x.protocol === "https:" && x.hostname.includes(".") ? x.toString() : null; } catch { return null; } };

/** Clean a build sheet before saving: drop empty values, cap lengths, validate links. */
export function cleanBuild(b: BuildSheet): BuildSheet {
  const strip = (o: Record<string, unknown> | undefined) => {
    if (!o) return undefined;
    const r: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
      r[k] = typeof v === "string" ? v.slice(0, 3000) : typeof v === "number" ? (Number.isFinite(v) ? v : undefined) : v;
    }
    return Object.keys(r).length ? r : undefined;
  };
  const out: BuildSheet = {};
  for (const k of ["profile", "specs", "engine", "driveline", "chassis", "exterior", "interior", "looks", "privacy"] as const) {
    const s = strip(b[k] as Record<string, unknown>); if (s) (out as Record<string, unknown>)[k] = s;
  }
  if (b.flair?.length) out.flair = [...new Set(b.flair.map((f) => f.trim().slice(0, 60)).filter(Boolean))].slice(0, 16);
  if (b.dyno?.length) out.dyno = b.dyno.filter((d) => Number.isFinite(+d.whp) && +d.whp > 0).map((d) => ({ ...d, whp: +d.whp })).slice(0, 50);
  if (b.crew?.length) out.crew = b.crew.filter((c) => c.name?.trim()).slice(0, 30);
  if (b.links?.length) out.links = b.links.map((l) => ({ ...l, url: safeUrl(l.url) ?? "" })).filter((l) => l.url && l.title?.trim()).slice(0, 30);
  if (b.price != null && b.privacy?.showPrice) out.price = b.price;
  return out;
}

/** Split an edited sheet into what's public and what the owner hid. */
export function splitPrivacy(b: BuildSheet): { publicSheet: BuildSheet; hidden: Record<string, unknown> } {
  const p = structuredClone(b), hidden: Record<string, unknown> = {};
  if (p.privacy?.hideLocation && p.profile?.location) { hidden.location = p.profile.location; delete p.profile.location; }
  if (!p.privacy?.showPrice) delete p.price;
  return { publicSheet: cleanBuild(p), hidden };
}

// Approximate factory colours by brand, signature colour first (used to suggest paint).
export const BRAND_COLORS: Record<string, [string, string][]> = {
  mclaren: [["Papaya Spark", "#ff7a1a"], ["Volcano Yellow", "#f2c200"], ["Silica White", "#ecebe6"], ["Onyx Black", "#0c0c0e"], ["Storm Grey", "#5c6166"]],
  ferrari: [["Rosso Corsa", "#d40000"], ["Giallo Modena", "#f7d117"], ["Nero Daytona", "#0b0b0d"], ["Bianco Avus", "#efefea"], ["Grigio Silverstone", "#7b8085"]],
  lamborghini: [["Verde Mantis", "#6ad100"], ["Arancio Borealis", "#ff6a00"], ["Giallo Orion", "#f5c400"], ["Grigio Telesto", "#6e7378"], ["Nero Noctis", "#0b0b0d"]],
  porsche: [["Guards Red", "#c8102e"], ["GT Silver", "#c6c8c9"], ["Python Green", "#3fae49"], ["Shark Blue", "#1f6fd1"], ["Chalk", "#d5d3cc"], ["Jet Black", "#0d0d0f"]],
  bmw: [["Portimao Blue", "#1c5bb8"], ["Sao Paulo Yellow", "#f2d20a"], ["Isle of Man Green", "#1f5b3a"], ["Alpine White", "#f2f2ef"], ["Brooklyn Grey", "#7b8086"], ["Black Sapphire", "#0e0f12"]],
  nissan: [["Bayside Blue", "#1f4fa8"], ["Midnight Purple", "#3a2155"], ["Solid Red", "#b0121b"], ["Pearl White", "#efefeb"], ["Gun Metallic", "#4d5257"]],
  toyota: [["Supersonic Red", "#c1121f"], ["Nitro Yellow", "#f2c700"], ["Super White", "#f1f1ee"], ["Midnight Black", "#0d0d0f"], ["Cement", "#8f948f"], ["Army Green", "#55613f"]],
  honda: [["Championship White", "#f2f2ee"], ["Rallye Red", "#c1121f"], ["Phoenix Yellow", "#f5c400"], ["Boost Blue", "#2b5fbf"], ["Sonic Grey", "#80868c"]],
  subaru: [["WR Blue", "#1d3e8a"], ["Ice Silver", "#b9bdc2"], ["Crystal White", "#efefeb"], ["Crystal Black", "#0d0d0f"], ["Solar Orange", "#ff6a13"]],
  mazda: [["Soul Red Crystal", "#9b0f1a"], ["Machine Grey", "#5e6266"], ["Snowflake White", "#efefeb"], ["Jet Black", "#0d0d0f"]],
  ford: [["Grabber Blue", "#1e78c8"], ["Race Red", "#c8102e"], ["Twister Orange", "#ff6a13"], ["Oxford White", "#f2f2ef"], ["Shadow Black", "#0d0d0f"]],
  chevrolet: [["Rapid Blue", "#1f6fd1"], ["Torch Red", "#c8102e"], ["Accelerate Yellow", "#f2c500"], ["Arctic White", "#f2f2ef"], ["Black", "#0d0d0f"]],
  dodge: [["Plum Crazy", "#5b2a86"], ["Go Mango", "#ff6a13"], ["Sublime", "#9bd21a"], ["TorRed", "#c8102e"], ["Pitch Black", "#0d0d0f"]],
  audi: [["Nardo Grey", "#8a8d8f"], ["Kemora Grey", "#6c7175"], ["Ascari Blue", "#1d4f9c"], ["Tango Red", "#b0121b"], ["Glacier White", "#efefeb"]],
  volkswagen: [["Kings Red", "#b3121f"], ["Lapiz Blue", "#1f4fa8"], ["Pure White", "#f2f2ef"], ["Deep Black Pearl", "#14161a"], ["Reflex Silver", "#a9adb2"]],
  "mercedes-benz": [["Green Hell Magno", "#2d3b2a"], ["Diamond White", "#efefeb"], ["Obsidian Black", "#0d0d0f"], ["Selenite Grey", "#6c7074"]],
  tesla: [["Pearl White", "#efefeb"], ["Ultra Red", "#b0121b"], ["Deep Blue", "#1c3f7a"], ["Solid Black", "#0d0d0f"], ["Quicksilver", "#a7abb0"]],
  jeep: [["Firecracker Red", "#c8102e"], ["Hydro Blue", "#1f6fd1"], ["Sarge Green", "#55613f"], ["Bright White", "#f2f2ef"]],
  lexus: [["Infrared", "#c1121f"], ["Ultra White", "#f1f1ee"], ["Caviar", "#0d0d0f"], ["Atomic Silver", "#b5b9be"]],
};
export const brandColors = (make: string) => {
  const k = make.trim().toLowerCase(), alias: Record<string, string> = { vw: "volkswagen", chevy: "chevrolet", mercedes: "mercedes-benz" };
  return (BRAND_COLORS[alias[k] ?? k] ?? []).map(([name, hex]) => ({ name, hex }));
};

export const HEADLIGHTS = [{ name: "Crisp white", hex: "#f4f8ff" }, { name: "Warm halogen", hex: "#ffe2a8" }, { name: "Selective yellow", hex: "#ffd23a" }, { name: "Ice blue", hex: "#cfe0ff" }, { name: "Smoked", hex: "#8d96a0" }];

/** Rough category for a mod typed in the owner's own words. */
export function guessModCategory(t: string): import("./types").ModCategory {
  t = t.toLowerCase();
  if (/turbo|supercharg|blower|intercooler|boost/.test(t)) return "forced_induction";
  if (/exhaust|muffler|downpipe|cat-?back|resonator|straight pipe/.test(t)) return "exhaust";
  if (/tune|tuned|ecu|flash|remap|stage ?\d|piggyback/.test(t)) return "tune";
  if (/intake|cai|air filter/.test(t)) return "intake";
  if (/header|manifold|cam|piston|rod|internals|catch can|engine|radiator|oil cooler|coolant|hose/.test(t)) return "engine";
  if (/coilover|spring|lower|lift|sway|suspension|strut|shock|air ride|bag/.test(t)) return "suspension";
  if (/brake|caliper|rotor|pad/.test(t)) return "brakes";
  if (/wheel|rim|tire|tyre|spacer/.test(t)) return "wheels";
  if (/wing|spoiler|ducktail/.test(t)) return "spoiler";
  if (/splitter|front lip|lip/.test(t)) return "splitter";
  if (/diffuser/.test(t)) return "diffuser";
  if (/kit|skirt|fender|canard|widebody|bumper|hood/.test(t)) return "body_kit";
  if (/tint/.test(t)) return "tint";
  if (/wrap|ppf|vinyl|decal|livery|paint/.test(t)) return "wrap";
  if (/light|led|hid|halo|fog/.test(t)) return "lighting";
  if (/seat|steering|harness|cage|shift|interior|gauge|knob|stereo|audio|speaker/.test(t)) return "interior";
  if (/clutch|flywheel|diff|lsd|axle|shifter|transmission|gearbox/.test(t)) return "drivetrain";
  return "other";
}
