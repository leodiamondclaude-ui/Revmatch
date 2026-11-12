import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { licenseAllowed, type Candidate, type SketchfabClient } from "./sketchfab";
import { describeSummary, readGlbJson, summarizeGlb, type GlbSummary } from "./glbInspect";
import { ANCHORS, AssemblyPlanSchema, credit, Finish, MaterialTarget, type AssemblyPlan } from "./plan";

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

  const seen = new Map<string, Candidate>();     // uids the agent may reference
  const downloaded = new Map<string, { url: string; summary: GlbSummary; candidate: Candidate }>();
  let base: AssemblyPlan["base"] | null = null;
  const parts: AssemblyPlan["parts"] = [];
  const materials: AssemblyPlan["materials"] = [];
  let finished: { summary: string; warnings: string[]; confidence: "low" | "medium" | "high" } | null = null;

  const search_sketchfab = betaZodTool({
    name: "search_sketchfab",
    description: "Search Sketchfab for downloadable models whose licence allows commercial use and modification. Returns uid, name, author, licence and face count.",
    inputSchema: z.object({
      query: z.string().min(2).max(120),
      kind: z.enum(["car", "part"]).describe("car: whole vehicles (vehicle category only); part: standalone parts like wings or wheels"),
      max_faces: z.number().int().min(1000).max(3_000_000).optional(),
    }),
    run: async ({ query, kind, max_faces }) => {
      await log(`Searching Sketchfab: "${query}"`);
      const results = await deps.sketchfab.search(query, { vehiclesOnly: kind === "car", maxFaces: max_faces });
      results.forEach((r) => seen.set(r.uid, r));
      if (!results.length) return "No downloadable, commercially licensed results. Try a broader or different query.";
      return results.map((r) => `${r.uid} | ${r.name} | by ${r.author} | ${r.licenseLabel} | ${r.faces.toLocaleString()} faces${r.animated ? " | animated" : ""}`).join("\n");
    },
  });

  const view_candidate = betaZodTool({
    name: "view_candidate",
    description: "Show a candidate's thumbnail image, description, tags and face count so you can judge whether it matches.",
    inputSchema: z.object({ uid: z.string() }),
    run: async ({ uid }) => {
      if (!seen.has(uid)) return "Unknown uid: only use uids returned by search_sketchfab.";
      const c = await deps.sketchfab.info(uid).catch(() => seen.get(uid)!);
      if (!licenseAllowed(c.license)) return `Rejected: licence "${c.licenseLabel}" does not allow commercial use and modification.`;
      seen.set(uid, c);
      const text = { type: "text" as const, text: `${c.name} by ${c.author} (${c.licenseLabel}), ${c.faces.toLocaleString()} faces.\nTags: ${c.tags.join(", ") || "none"}\nDescription: ${c.description || "none"}` };
      return c.thumbnail ? [text, { type: "image" as const, source: { type: "url" as const, url: c.thumbnail } }] : [text];
    },
  });

  const download_model = betaZodTool({
    name: "download_model",
    description: "Download a chosen model (GLB) into RevMatch storage and return its structure: materials and mesh nodes with world-space centers and sizes.",
    inputSchema: z.object({ uid: z.string(), role: z.enum(["base", "part"]) }),
    run: async ({ uid, role }) => {
      const c = seen.get(uid);
      if (!c) return "Unknown uid: only use uids returned by search_sketchfab.";
      if (!licenseAllowed(c.license)) return "Rejected: licence does not allow commercial use and modification.";
      await log(`Downloading ${role}: ${c.name} by ${c.author}`);
      try {
        const bytes = await deps.sketchfab.download(uid, maxBytes);
        const summary = summarizeGlb(readGlbJson(bytes));
        const url = await deps.store(bytes, `${role}-${uid}.glb`);
        downloaded.set(uid, { url, summary, candidate: c });
        return `Downloaded (${(bytes.length / 1e6).toFixed(1)} MB).\n${describeSummary(summary, role === "base" ? 160 : 40)}`;
      } catch (e) {
        return `Download failed: ${(e as Error).message}`;
      }
    },
  });

  const map_base_model = betaZodTool({
    name: "map_base_model",
    description: "Record the downloaded base model and which of its materials/nodes are paint, glass, calipers and wheels, plus its front axis.",
    inputSchema: z.object({
      uid: z.string(),
      front_axis: z.enum(["+x", "-x", "+z", "-z"]),
      paint_materials: z.array(z.string()), glass_materials: z.array(z.string()), caliper_materials: z.array(z.string()),
      wheel_nodes: z.array(z.string()).describe("Node paths of the four wheels (rim + tyre groups)"),
      hide_nodes: z.array(z.string()).describe("Nodes to hide, e.g. a factory wing that a mod replaces, or ground planes/backdrops"),
      has_interior: z.boolean(),
      match_confidence: z.enum(["low", "medium", "high"]),
      notes: z.string(),
    }),
    run: async (i) => {
      const d = downloaded.get(i.uid);
      if (!d) return "Download this uid with role \"base\" first.";
      const matNames = new Set(d.summary.materials.map((m) => m.name)), nodeNames = new Set(d.summary.nodes.map((n) => n.node));
      const bad = [...i.paint_materials, ...i.glass_materials, ...i.caliper_materials].filter((m) => !matNames.has(m))
        .concat([...i.wheel_nodes, ...i.hide_nodes].filter((n) => !nodeNames.has(n) && ![...nodeNames].some((x) => x.startsWith(n + "/"))));
      if (bad.length) return `These names are not in the model: ${bad.join(", ")}. Use names exactly as listed.`;
      if (!i.paint_materials.length) return "At least one paint material is required.";
      const c = d.candidate;
      base = {
        uid: c.uid, name: c.name, author: c.author, license: c.licenseLabel, viewerUrl: c.viewerUrl, glbUrl: d.url, frontAxis: i.front_axis,
        mapping: { paint: i.paint_materials, glass: i.glass_materials, calipers: i.caliper_materials, wheelNodes: i.wheel_nodes, hide: i.hide_nodes },
        matchConfidence: i.match_confidence, hasInterior: i.has_interior, notes: i.notes,
      };
      await log(`Base model mapped: ${c.name}`);
      return "Base model recorded.";
    },
  });

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
      if (!base) return "Map the base model first.";
      const d = downloaded.get(i.uid);
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
      if (!base) return "No base model has been mapped yet. Map one, or finish only if nothing suitable exists.";
      finished = { summary: i.summary, warnings: i.warnings, confidence: i.match_confidence };
      return "Done. Stop now.";
    },
  });

  const carLine = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ");
  const modLines = mods.length
    ? mods.map((m) => `- id ${m.id}: ${m.category} · ${[m.brand, m.name, m.product].filter(Boolean).join(" ")}${m.description ? ` (${m.description.slice(0, 160)})` : ""}`).join("\n")
    : "- none";
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: "text", text: `Owner's car: ${carLine}${vehicle.generation ? ` (generation ${vehicle.generation})` : ""}. Body style: ${vehicle.bodyStyle}. Paint: ${vehicle.paintHex ?? "unknown"} ${vehicle.finish ?? ""}.\nModifications:\n${modLines}\n\nOwner's photos follow.` },
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

  if (!base) throw new Error("No suitable licensed base model was found for this car.");
  const b = base as AssemblyPlan["base"];
  const f = finished as { summary: string; warnings: string[]; confidence: "low" | "medium" | "high" } | null;
  const plan: AssemblyPlan = {
    version: 1,
    base: { ...b, matchConfidence: f?.confidence ?? b.matchConfidence },
    parts, materials,
    summary: f?.summary ?? "Assembled from licensed Sketchfab models.",
    warnings: f?.warnings ?? ["The agent stopped before writing a summary."],
    attribution: [credit(b.name, b.author, b.license, b.viewerUrl), ...parts.map((p) => credit(p.name, p.author, p.license, p.viewerUrl))],
    createdAt: new Date().toISOString(),
  };
  return AssemblyPlanSchema.parse(plan);
}
