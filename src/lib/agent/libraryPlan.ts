import { AssemblyPlanSchema, baseCredit, type AssemblyPlan } from "./plan";
import type { Base } from "./baseTools";

/** An assembly plan for a vehicle that uses a library base as-is (the owner's paint and wheel colours applied). */
export function planFromLibrary(row: { make: string; model: string; generation: string | null; source: "sketchfab" | "generated" | null; base: Base | null; warnings: string[] | null }, paintHex: string | null, finish: string | null): AssemblyPlan {
  const base = { ...row.base!, matchConfidence: row.base!.matchConfidence };
  const fin = finish && ["gloss", "metallic", "satin", "matte"].includes(finish) ? (finish as "gloss" | "metallic" | "satin" | "matte") : null;
  return AssemblyPlanSchema.parse({
    version: 1, base, parts: [],
    materials: paintHex && /^#[0-9a-fA-F]{6}$/.test(paintHex) ? [{ target: "paint", color: paintHex, finish: fin }] : [],
    summary: `Stock ${row.make} ${row.model}${row.generation ? ` (${row.generation})` : ""} from the RevMatch library${row.source === "generated" ? ", AI-designed" : ""}.`,
    warnings: row.warnings ?? [], attribution: [baseCredit(base)], createdAt: new Date().toISOString(),
  });
}
