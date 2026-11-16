import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { licenseAllowed, type Candidate, type SketchfabClient } from "./sketchfab";
import { describeSummary, readGlbJson, summarizeGlb, type GlbSummary } from "./glbInspect";
import type { AssemblyPlan } from "./plan";

/**
 * Tools shared by the per-car model agent and the library agent: search Sketchfab, look at a candidate,
 * download it into storage, and map the downloaded base model (paint, glass, calipers, wheels, front axis).
 */

export type Base = AssemblyPlan["base"];
export interface Downloaded { url: string; summary: GlbSummary; candidate: Candidate }
export interface ToolState {
  /** uids the agent may reference (only ones a search or generation returned). */
  seen: Map<string, Candidate>;
  downloaded: Map<string, Downloaded>;
  base: Base | null;
}
export interface BaseToolDeps {
  sketchfab: SketchfabClient;
  /** Persist a GLB and return a public URL. */
  store: (bytes: Uint8Array, name: string) => Promise<string>;
  log: (line: string) => Promise<void>;
  maxDownloadBytes: number;
}

export function newToolState(): ToolState {
  return { seen: new Map(), downloaded: new Map(), base: null };
}

/** Record a downloaded or generated model so map_base_model / add_part can use it. */
export async function registerModel(state: ToolState, deps: BaseToolDeps, c: Candidate, bytes: Uint8Array, name: string) {
  const summary = summarizeGlb(readGlbJson(bytes));
  const url = await deps.store(bytes, name);
  state.seen.set(c.uid, c);
  state.downloaded.set(c.uid, { url, summary, candidate: c });
  return summary;
}

export function sketchfabTools(state: ToolState, deps: BaseToolDeps) {
  const { log } = deps;
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
      results.forEach((r) => state.seen.set(r.uid, r));
      if (!results.length) return "No downloadable, commercially licensed results. Try a broader or different query.";
      return results.map((r) => `${r.uid} | ${r.name} | by ${r.author} | ${r.licenseLabel} | ${r.faces.toLocaleString()} faces${r.animated ? " | animated" : ""}`).join("\n");
    },
  });

  const view_candidate = betaZodTool({
    name: "view_candidate",
    description: "Show a candidate's thumbnail image, description, tags and face count so you can judge whether it matches.",
    inputSchema: z.object({ uid: z.string() }),
    run: async ({ uid }) => {
      if (!state.seen.has(uid)) return "Unknown uid: only use uids returned by search_sketchfab.";
      const c = await deps.sketchfab.info(uid).catch(() => state.seen.get(uid)!);
      if (!licenseAllowed(c.license)) return `Rejected: licence "${c.licenseLabel}" does not allow commercial use and modification.`;
      state.seen.set(uid, c);
      const text = { type: "text" as const, text: `${c.name} by ${c.author} (${c.licenseLabel}), ${c.faces.toLocaleString()} faces.\nTags: ${c.tags.join(", ") || "none"}\nDescription: ${c.description || "none"}` };
      return c.thumbnail ? [text, { type: "image" as const, source: { type: "url" as const, url: c.thumbnail } }] : [text];
    },
  });

  const download_model = betaZodTool({
    name: "download_model",
    description: "Download a chosen Sketchfab model (GLB) into RevMatch storage and return its structure: materials and mesh nodes with world-space centers and sizes.",
    inputSchema: z.object({ uid: z.string(), role: z.enum(["base", "part"]) }),
    run: async ({ uid, role }) => {
      const c = state.seen.get(uid);
      if (!c) return "Unknown uid: only use uids returned by search_sketchfab.";
      if (!licenseAllowed(c.license)) return "Rejected: licence does not allow commercial use and modification.";
      await log(`Downloading ${role}: ${c.name} by ${c.author}`);
      try {
        const bytes = await deps.sketchfab.download(uid, deps.maxDownloadBytes);
        const summary = await registerModel(state, deps, c, bytes, `${role}-${uid}.glb`);
        return `Downloaded (${(bytes.length / 1e6).toFixed(1)} MB).\n${describeSummary(summary, role === "base" ? 160 : 40)}`;
      } catch (e) {
        return `Download failed: ${(e as Error).message}`;
      }
    },
  });

  return { search_sketchfab, view_candidate, download_model };
}

export function mapBaseTool(state: ToolState, deps: BaseToolDeps) {
  return betaZodTool({
    name: "map_base_model",
    description: "Record the downloaded or generated base model and which of its materials/nodes are paint, glass, calipers and wheels, plus its front axis.",
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
      const d = state.downloaded.get(i.uid);
      if (!d) return "Download (or generate) this uid as the base first.";
      const matNames = new Set(d.summary.materials.map((m) => m.name)), nodeNames = new Set(d.summary.nodes.map((n) => n.node));
      const bad = [...i.paint_materials, ...i.glass_materials, ...i.caliper_materials].filter((m) => !matNames.has(m))
        .concat([...i.wheel_nodes, ...i.hide_nodes].filter((n) => !nodeNames.has(n) && ![...nodeNames].some((x) => x.startsWith(n + "/"))));
      if (bad.length) return `These names are not in the model: ${bad.join(", ")}. Use names exactly as listed.`;
      if (!i.paint_materials.length) return "At least one paint material is required.";
      const c = d.candidate;
      state.base = {
        uid: c.uid, name: c.name, author: c.author, license: c.licenseLabel, viewerUrl: c.viewerUrl, glbUrl: d.url, frontAxis: i.front_axis,
        mapping: { paint: i.paint_materials, glass: i.glass_materials, calipers: i.caliper_materials, wheelNodes: i.wheel_nodes, hide: i.hide_nodes },
        matchConfidence: i.match_confidence, hasInterior: i.has_interior, notes: i.notes,
      };
      await deps.log(`Base model mapped: ${c.name}`);
      return "Base model recorded.";
    },
  });
}
