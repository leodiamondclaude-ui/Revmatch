import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { SketchfabClient } from "./sketchfab";
import { describeSummary } from "./glbInspect";
import { mapBaseTool, newToolState, registerModel, sketchfabTools, type Base } from "./baseTools";
import { waitForTask, type MeshyTextClient } from "./meshyText";
import { GENERATED_LICENSE } from "./plan";
import type { Body } from "./catalog";

/**
 * Library agent: prepares the stock 3D model for one car generation ahead of time, so it is on standby
 * when someone adds that car. It prefers a licensed, professionally made Sketchfab model; when none is
 * good enough it designs one with Meshy Text to 3D from its own description of the stock car, checks the
 * result, and maps paint, glass, calipers and wheels so the viewer can recolour it and fit mods.
 */

export interface LibraryTarget { make: string; model: string; generation: string | null; from: number; to: number; body: Body }
export interface LibraryLook {
  /** Factory colours, the signature one first. */
  colors: { name: string; hex: string }[];
  /** Short notes on what makes the stock car recognisable (grille, lights, wheels, wing). */
  signature: string[];
}
export interface LibraryResult {
  base: Base;
  /** Node/material listing of the base, kept so the per-car agent can fit parts onto it later. */
  structure: string;
  source: "sketchfab" | "generated";
  generation: string | null;
  from: number;
  to: number;
  look: LibraryLook;
  summary: string;
  warnings: string[];
  thumbnail: string | null;
}
export interface LibraryDeps {
  sketchfab: SketchfabClient;
  /** null when MESHY_API_KEY isn't set: the agent then only uses Sketchfab. */
  meshy: MeshyTextClient | null;
  store: (bytes: Uint8Array, name: string) => Promise<string>;
  log?: (line: string) => void | Promise<void>;
  client?: Anthropic;
  maxDownloadBytes?: number;
  maxIterations?: number;
  /** For tests: how Meshy polling waits. */
  sleep?: (ms: number) => Promise<void>;
}

const SYSTEM = `You are RevMatch's library agent. RevMatch shows every owner's car as a realistic, studio-lit 3D model. Your job is to prepare the STOCK model for one car generation ahead of time, so it's ready the moment someone adds that car. Owners recolour it and fit their own mods on top, so it must be the stock car, accurately shaped, with clean, separable paint, glass, caliper and wheel materials.

Work in this order:
1. Search Sketchfab for this exact generation (try the chassis code, the model name with and without the generation, and the years). Search only returns models whose licence allows commercial use and modification.
2. Look at the strongest candidates with view_candidate. Reject: the wrong generation or body style, toys, LEGO, low-poly or cartoon styles, race liveries, heavily modified cars, scenes with several cars, and anything ripped from a video game (names or descriptions mentioning Gran Turismo, Forza, Assetto Corsa, Need for Speed, "ripped", "extracted"). Prefer original creators, realistic PBR materials, 100k-1.5M faces and a modelled interior.
3. If a candidate is a good match, download it (role "base"). Otherwise, if generate_model is available, design the car yourself with it: describe the stock car in precise visual terms from what you know (proportions, roofline, front and rear design, lights, grille, wheels, mirrors, glass area), as a single car on a plain background, realistic, no people or text. Check the result's thumbnail; if the shape is clearly wrong, you may generate once more with a corrected description. Never accept a generated model that doesn't look like this car.
4. Call map_base_model on the chosen model: paint, glass and caliper materials, the four wheel nodes, nodes to hide (ground planes, backdrops, drivers), and which axis is the car's front. Wheels are four similar nodes near the bounding-box corners at ground level; the front axis points from the rear axle to the front axle. A generated model may have a single material; map it as paint and say so in notes.
5. Call finish with the generation and the exact year range it covers, the factory colours (signature colour first, with approximate hex), the signature visual details, an honest summary and warnings.

Rules: only use uids that search_sketchfab or generate_model returned. Inspect at most 10 Sketchfab candidates. If nothing suitable exists and generation isn't available or fails, call finish with found=false and explain why.`;

export async function runLibraryAgent(target: LibraryTarget, deps: LibraryDeps): Promise<LibraryResult | { found: false; reason: string }> {
  const client = deps.client ?? new Anthropic();
  const log = async (l: string) => { await deps.log?.(l); };
  const maxBytes = deps.maxDownloadBytes ?? 80_000_000;
  const state = newToolState();
  const toolDeps = { sketchfab: deps.sketchfab, store: deps.store, log, maxDownloadBytes: maxBytes };
  const { search_sketchfab, view_candidate, download_model } = sketchfabTools(state, toolDeps);
  const map_base_model = mapBaseTool(state, toolDeps);
  let generations = 0;
  const thumbs = new Map<string, string | null>();
  let finished: (Omit<LibraryResult, "base" | "structure" | "source" | "thumbnail"> & { found: boolean; reason: string }) | null = null;

  const generate_model = betaZodTool({
    name: "generate_model",
    description: "Design the stock car as a new 3D model with Meshy Text to 3D (takes several minutes). Returns its structure and a thumbnail so you can check it. At most 2 per run.",
    inputSchema: z.object({
      prompt: z.string().min(40).max(800).describe("Precise visual description of the stock car's shape: proportions, roofline, front and rear design, lights, wheels. Single car, plain background, realistic."),
      texture_prompt: z.string().min(20).max(800).describe("Surface description: a neutral factory paint, real glass, black trim, tyres, rims and lights as on the stock car."),
    }),
    run: async ({ prompt, texture_prompt }) => {
      if (!deps.meshy) return "Generation isn't available (no Meshy key).";
      if (generations >= 2) return "Generation limit reached for this run.";
      generations++;
      try {
        await log("Designing the car with Meshy (shape pass)…");
        const pre = await waitForTask(deps.meshy, await deps.meshy.preview(prompt), { sleep: deps.sleep });
        await log("Texturing the generated car…");
        const fin = await waitForTask(deps.meshy, await deps.meshy.refine(pre.id, texture_prompt), { sleep: deps.sleep });
        if (!fin.model_urls?.glb) return "Generation finished without a GLB file.";
        const bytes = await deps.meshy.fetchFile(fin.model_urls.glb, maxBytes);
        const uid = `meshy-${fin.id}`, name = `${target.make} ${target.model}${target.generation ? ` (${target.generation})` : ""}, generated`;
        const summary = await registerModel(state, toolDeps, {
          uid, name, author: "Meshy Text to 3D", license: "generated", licenseLabel: GENERATED_LICENSE, faces: 0,
          thumbnail: fin.thumbnail_url ?? null, viewerUrl: "", tags: [], description: prompt, animated: false,
        }, bytes, `generated-${fin.id}.glb`);
        thumbs.set(uid, fin.thumbnail_url ?? null);
        await log("Generated model ready to check.");
        const text = { type: "text" as const, text: `Generated as uid ${uid} (${(bytes.length / 1e6).toFixed(1)} MB).\n${describeSummary(summary, 120)}` };
        return fin.thumbnail_url ? [text, { type: "image" as const, source: { type: "url" as const, url: fin.thumbnail_url } }] : [text];
      } catch (e) {
        return `Generation failed: ${(e as Error).message}`;
      }
    },
  });

  const finish = betaZodTool({
    name: "finish",
    description: "End the run. With found=true a base model must already be mapped.",
    inputSchema: z.object({
      found: z.boolean(),
      reason: z.string().describe("Why nothing suitable exists (found=false), else empty"),
      generation: z.string().nullable(), from: z.number().int().min(1900).max(2100), to: z.number().int().min(1900).max(2100),
      colors: z.array(z.object({ name: z.string().max(40), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/) })).max(10),
      signature: z.array(z.string().max(120)).max(8),
      summary: z.string(), warnings: z.array(z.string()),
    }),
    run: async (i) => {
      if (i.found && !state.base) return "Map a base model first, or finish with found=false.";
      if (i.from > i.to) return "from must not be after to.";
      finished = { found: i.found, reason: i.reason, generation: i.generation, from: i.from, to: i.to, look: { colors: i.colors, signature: i.signature }, summary: i.summary, warnings: i.warnings };
      return "Done. Stop now.";
    },
  });

  const tools = [search_sketchfab, view_candidate, download_model, ...(deps.meshy ? [generate_model] : []), map_base_model, finish];
  const line = `${target.make} ${target.model}${target.generation ? ` (${target.generation})` : ""}, ${target.from}–${target.to}, body style: ${target.body}`;
  await log(`Library agent started for ${line}`);
  const final = await client.beta.messages.toolRunner({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    tools,
    messages: [{ role: "user", content: `Prepare the stock model for: ${line}.${deps.meshy ? "" : " (generate_model is not available in this run.)"}` }],
    max_iterations: deps.maxIterations ?? 50,
  });
  if (final.stop_reason === "refusal") throw new Error("The model declined this request.");

  const f = finished as (Omit<LibraryResult, "base" | "structure" | "source" | "thumbnail"> & { found: boolean; reason: string }) | null;
  if (!f) throw new Error("The agent stopped before finishing.");
  if (!f.found || !state.base) return { found: false, reason: f.reason || "No suitable model." };
  const b = state.base;
  const d = state.downloaded.get(b.uid)!;
  return {
    base: b, structure: describeSummary(d.summary, 160), source: b.license === GENERATED_LICENSE ? "generated" : "sketchfab",
    generation: f.generation, from: f.from, to: f.to, look: f.look, summary: f.summary, warnings: f.warnings,
    thumbnail: thumbs.get(b.uid) ?? d.candidate.thumbnail ?? null,
  };
}
