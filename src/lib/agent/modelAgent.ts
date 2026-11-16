import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { SketchfabClient } from "./sketchfab";
import { ANCHORS, AssemblyPlanSchema, credit, Finish, MaterialTarget, type AssemblyPlan } from "./plan";
import { mapBaseTool, newToolState, sketchfabTools, type Base } from "./baseTools";
import { baseCredit } from "./plan";

/**
 * Model agent: for a car with no library model, find a licensed 3D base model of that exact car on
 * Sketchfab, map its materials and parts, then find and fit Sketchfab parts for each visible mod.
 * Output is an AssemblyPlan the viewer renders. Sketchfab and storage are injected so this is testable.
 */

export interface AgentVehicle {
  year: number | null; make: string; model: string; trim: string | null; bodyStyle: string;
  paintHex: string | null; finish: string | null; generation?: string | null;
}
export interface AgentMod { id: string; category: string; name: string; brand: string | null; product: string | null; description: string | null }
export interface AgentDeps {
  sketchfab: SketchfabClient;
  /** Persist a downloaded GLB and return a public URL. */
  store: (bytes: Uint8Array, name: string) => Promise<string>;
  log?: (line: string) => void | Promise<void>;
  client?: Anthropic;
  maxDownloadBytes?: number;
  maxIterations?: number;
  /** A base model already chosen from the RevMatch library: the agent skips the base search and only fits mods. */
  presetBase?: { base: Base; structure: string } | null;
}

const VISUAL_KINDS = ["spoiler", "wheels", "splitter", "diffuser", "body_kit", "exhaust"];

const SYSTEM = `You are RevMatch's 3D model agent. A car owner uploaded photos of their car, but RevMatch has no library model for it. Your job is to assemble the most realistic 3D representation possible from licensed Sketchfab models.

Work in this order:
1. Search Sketchfab for the exact car (year, generation, trim). Try several queries (e.g. with and without trim, chassis code). Search only returns models whose licence allows commercial use and modification.
2. Inspect the strongest candidates with view_candidate and compare the thumbnail with the owner's photos. Reject: the wrong generation or body, toys, LEGO, low-poly or cartoon styles, race-livery-only versions when the owner's car is a road car, scenes with multiple cars, and anything that looks ripped from a video game (names or descriptions mentioning Gran Turismo, Forza, Assetto Corsa, Need for Speed, "ripped", "extracted"). Prefer original creators, realistic PBR materials, 100k–1.5M faces, and models with a modelled interior.
3. Download the best one with download_model (role "base"), then call map_base_model: identify the body-paint materials, glass materials, brake caliper materials, the four wheel nodes, any factory wing/spoiler nodes, and which axis is the car's front. Use the node centers and sizes: wheels are four similar nodes near the bounding-box corners at ground level; the front axis points from the rear axle to the front axle.
4. For each visible modification the owner listed (wing/spoiler, wheels, splitter, diffuser, side skirts, exhaust), search for a matching standalone part ("carbon GT wing", "forged 5 spoke wheel", ...), check it with view_candidate, download it (role "part"), and call add_part with the anchor, the rotation that orients it (width along Z, height along Y, front toward +X) based on its bounds, its size, and which base nodes it replaces (e.g. the factory wing or the original wheels). Skip a mod if no good part exists; never force a bad match.
5. Call set_material for paint colour and finish, wheel colour and caliper colour when the owner's photos or data show them.
6. Call finish with an honest summary, your confidence that the base matches the owner's car, and warnings (e.g. "base model is a 2019 car, owner's is 2023", "no matching wing found").

Rules: never invent model uids; only use uids that search returned. Be economical: inspect at most 8 candidates for the base and 4 per part. The owner will review the result, and it is labelled as an assembled approximation.`;

export async function runModelAgent(vehicle: AgentVehicle, mods: AgentMod[], photoUrls: string[], deps: AgentDeps): Promise<AssemblyPlan> {
  const client = deps.client ?? new Anthropic();
  const log = async (l: string) => { await deps.log?.(l); };
  const maxBytes = deps.maxDownloadBytes ?? 80_000_000;

  const state = newToolState();
  const toolDeps = { sketchfab: deps.sketchfab, store: deps.store, log, maxDownloadBytes: maxBytes };
  const { search_sketchfab, view_candidate, download_model } = sketchfabTools(state, toolDeps);
  const map_base_model = mapBaseTool(state, toolDeps);
  if (deps.presetBase) state.base = deps.presetBase.base;
  const parts: AssemblyPlan["parts"] = [];
  const materials: AssemblyPlan["materials"] = [];
  let finished: { summary: string; warnings: string[]; confidence: "low" | "medium" | "high" } | null = null;

  const add_part = betaZodTool({
    name: "add_part",
    description: "Fit a downloaded part for one of the owner's mods onto the base car.",
    inputSchema: z.object({
      uid: z.string(), mod_id: z.string().nullable(), kind: z.enum(VISUAL_KINDS as [string, ...string[]]),
      anchor: z.enum(ANCHORS),
      rotation_deg: z.tuple([z.number(), z.number(), z.number()]).describe("XYZ degrees turning the part so width is along Z, height along Y, front toward +X"),
      size_fraction: z.number().min(0.05).max(1.5).describe("Part width as a fraction of car width; for wheels, fraction of the original wheel diameter (usually 1.0)"),
      offset: z.tuple([z.number(), z.number(), z.number()]).describe("Fine offset in metres after placement, usually [0,0,0]"),
      replaces_nodes: z.array(z.string()),
    }),
    run: async (i) => {
      if (!state.base) return "Map the base model first.";
      const d = state.downloaded.get(i.uid);
      if (!d) return "Download this uid with role \"part\" first.";
      if (i.mod_id && !mods.some((m) => m.id === i.mod_id)) return "Unknown mod_id.";
      const c = d.candidate;
      parts.push({
        modId: i.mod_id, kind: i.kind, uid: c.uid, name: c.name, author: c.author, license: c.licenseLabel, viewerUrl: c.viewerUrl, glbUrl: d.url,
        anchor: i.anchor, rotationDeg: i.rotation_deg, sizeFraction: i.size_fraction, offset: i.offset, replacesNodes: i.replaces_nodes,
      });
      await log(`Fitted ${i.kind}: ${c.name}`);
      return `Part added (${parts.length} so far).`;
    },
  });

  const set_material = betaZodTool({
    name: "set_material",
    description: "Set the colour (and for paint, the finish) of a mapped material group to match the owner's car.",
    inputSchema: z.object({ target: MaterialTarget, color: z.string().regex(/^#[0-9a-fA-F]{6}$/), finish: Finish.nullable() }),
    run: async (i) => {
      const k = materials.findIndex((m) => m.target === i.target);
      if (k >= 0) materials.splice(k, 1);
      materials.push(i);
      return "Material set.";
    },
  });

  const finish = betaZodTool({
    name: "finish",
    description: "End the run with a summary for the owner.",
    inputSchema: z.object({ summary: z.string(), match_confidence: z.enum(["low", "medium", "high"]), warnings: z.array(z.string()) }),
    run: async (i) => {
      if (!state.base) return "No base model has been mapped yet. Map one, or finish only if nothing suitable exists.";
      finished = { summary: i.summary, warnings: i.warnings, confidence: i.match_confidence };
      return "Done. Stop now.";
    },
  });

  const carLine = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  const modLines = mods.length
    ? mods.map((m) => `- id ${m.id}: ${m.category} · ${[m.brand, m.name, m.product].filter(Boolean).join(" ")}${m.description ? ` (${m.description.slice(0, 160)})` : ""}`).join("\n")
    : "- none";
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: "text", text: `Owner's car: ${carLine}${vehicle.generation ? ` (generation ${vehicle.generation})` : ""}. Body style: ${vehicle.bodyStyle}. Paint: ${vehicle.paintHex ?? "unknown"} ${vehicle.finish ?? ""}.\nModifications:\n${modLines}\n\n${deps.presetBase ? `The base model is already chosen and mapped from the RevMatch library: "${deps.presetBase.base.name}" (front axis ${deps.presetBase.base.frontAxis}). Skip steps 1-3: do not search for or map a base. Fit the owner's visible mods (step 4), set materials (step 5) and finish. Base structure for replaces_nodes:\n${deps.presetBase.structure}\n\n` : ""}Owner's photos follow.` },
    ...photoUrls.slice(0, 4).map((url) => ({ type: "image" as const, source: { type: "url" as const, url } })),
  ];

  await log(`Agent started for ${carLine}`);
  const final = await client.beta.messages.toolRunner({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    tools: [search_sketchfab, view_candidate, download_model, map_base_model, add_part, set_material, finish],
    messages: [{ role: "user", content }],
    max_iterations: deps.maxIterations ?? 60,
  });
  if (final.stop_reason === "refusal") throw new Error("The model declined this request.");

  if (!state.base) throw new Error("No suitable licensed base model was found for this car.");
  const b = state.base as AssemblyPlan["base"];
  const f = finished as { summary: string; warnings: string[]; confidence: "low" | "medium" | "high" } | null;
  const plan: AssemblyPlan = {
    version: 1,
    base: { ...b, matchConfidence: f?.confidence ?? b.matchConfidence },
    parts, materials,
    summary: f?.summary ?? (deps.presetBase ? "Library base model with the owner's mods fitted." : "Assembled from licensed Sketchfab models."),
    warnings: f?.warnings ?? ["The agent stopped before writing a summary."],
    attribution: [baseCredit(b), ...parts.map((p) => credit(p.name, p.author, p.license, p.viewerUrl))],
    createdAt: new Date().toISOString(),
  };
  return AssemblyPlanSchema.parse(plan);
}
