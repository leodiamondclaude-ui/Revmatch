import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { bestMatch, CATALOG, entryKey } from "../src/lib/agent/catalog";
import { createMeshyTextClient, waitForTask, type MeshyTask, type MeshyTextClient } from "../src/lib/agent/meshyText";
import { runLibraryAgent } from "../src/lib/agent/libraryAgent";
import { planFromLibrary } from "../src/lib/agent/libraryPlan";
import { GENERATED_LICENSE } from "../src/lib/agent/plan";
import { readGlbJson, summarizeGlb } from "../src/lib/agent/glbInspect";
import type { SketchfabClient } from "../src/lib/agent/sketchfab";

const entries = CATALOG.map((e) => ({ ...e }));
const find = (year: number | null, make: string, model: string) => {
  const e = bestMatch(entries, { year, make, model });
  return e ? `${e.model} ${e.generation}` : null;
};

test("catalogue keys are unique", () => {
  const keys = CATALOG.map(entryKey);
  assert.equal(new Set(keys).size, keys.length);
  for (const e of CATALOG) assert.ok(e.from <= e.to, entryKey(e));
});

test("cars match the right generation", () => {
  assert.equal(find(2012, "Volkswagen", "Eos"), "Eos 1F");
  assert.equal(find(2012, "VW", "EOS"), "Eos 1F", "make alias and case");
  assert.equal(find(2005, "Volkswagen", "Eos"), null, "year outside every generation");
  assert.equal(find(2024, "Porsche", "911 GT3 RS"), "911 GT3 RS 992", "closest model name wins");
  assert.equal(find(2021, "Porsche", "911 Carrera S"), "911 992", "owner wrote more than the entry");
  assert.equal(find(2015, "Porsche", "911 Carrera"), "911 991");
  assert.equal(find(2018, "Honda", "Civic Type R"), "Civic Type R FK8");
  assert.equal(find(2023, "Honda", "Civic Type R"), "Civic Type R FL5");
  assert.equal(find(2022, "Ford", "F150"), "F-150 14th gen", "punctuation ignored");
  assert.equal(find(2019, "Ford", "Mustang GT"), "Mustang S550");
  assert.equal(find(2021, "BMW", "M340i"), null, "an M340i is not an M3");
  assert.equal(find(2017, "Lamborghini", "Huracan"), "Huracán LB724", "accents ignored");
  assert.equal(find(2020, "Chevy", "Corvette Stingray"), "Corvette C8");
  assert.equal(find(2020, "Toyota", "Prius"), null, "not in the catalogue");
});

test("Meshy text-to-3D requests use the highest-quality settings", async () => {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const fake = (async (url: string | URL, init?: RequestInit) => {
    sent.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(JSON.stringify({ result: "task-1" }));
  }) as typeof fetch;
  const m = createMeshyTextClient("k", fake);
  assert.equal(await m.preview("x".repeat(900)), "task-1");
  await m.refine("task-1", "factory silver paint");
  assert.match(sent[0].url, /\/openapi\/v2\/text-to-3d$/);
  assert.deepEqual({ ...sent[0].body, prompt: (sent[0].body.prompt as string).length }, { mode: "preview", prompt: 800, ai_model: "latest", geometry_resolution: "2k", should_remesh: false, target_formats: ["glb"] });
  assert.deepEqual(sent[1].body, { mode: "refine", preview_task_id: "task-1", enable_pbr: true, texture_resolution: "4k", texture_prompt: "factory silver paint", target_formats: ["glb"] });
  await assert.rejects(createMeshyTextClient(undefined, fake).preview("a car"), /MESHY_API_KEY/);
});

test("waiting on a Meshy task", async () => {
  const seq: MeshyTask[] = [{ id: "t", status: "PENDING", progress: 0 }, { id: "t", status: "IN_PROGRESS", progress: 50 }, { id: "t", status: "SUCCEEDED", progress: 100, model_urls: { glb: "g" } }];
  const client = { get: async () => seq.shift()! } as unknown as MeshyTextClient;
  const progress: number[] = [];
  const t = await waitForTask(client, "t", { sleep: async () => {}, onProgress: (p) => progress.push(p) });
  assert.equal(t.model_urls?.glb, "g");
  assert.deepEqual(progress, [0, 50]);
  const failing = { get: async () => ({ id: "t", status: "FAILED", progress: 0, task_error: { message: "bad prompt" } }) } as unknown as MeshyTextClient;
  await assert.rejects(waitForTask(failing, "t", { sleep: async () => {} }), /failed: bad prompt/);
});

const glb = new Uint8Array(readFileSync("public/models/studio-car.glb"));
const summary = summarizeGlb(readGlbJson(glb));
const paintMat = summary.materials.find((m) => /^Paint/.test(m.name))!.name;
const wheelNodes = summary.nodes.filter((n) => /Rim$/.test(n.node)).map((n) => n.node);

/** A stand-in for the Claude tool runner that calls the agent's tools in a fixed order. */
function scriptedClient(script: (tools: Map<string, { run: (i: unknown) => unknown }>) => Promise<void>) {
  return { beta: { messages: { toolRunner: async (params: { tools: { name: string; run: (i: unknown) => unknown }[] }) => {
    await script(new Map(params.tools.map((t) => [t.name, t])));
    return { stop_reason: "end_turn", content: [] };
  } } } } as never;
}
const noSketchfab: SketchfabClient = { search: async () => [], info: async () => { throw new Error("none"); }, download: async () => { throw new Error("none"); } };
const stored: string[] = [];
const store = async (_b: Uint8Array, name: string) => { stored.push(name); return `https://storage/${name}`; };

test("library agent designs a car with Meshy when Sketchfab has nothing", async () => {
  const calls: string[] = [];
  const meshy: MeshyTextClient = {
    preview: async (p) => { calls.push(`preview:${p.slice(0, 20)}`); return "pre"; },
    refine: async (id, tp) => { calls.push(`refine:${id}:${tp.slice(0, 10)}`); return "fin"; },
    get: async (id) => ({ id, status: "SUCCEEDED", progress: 100, model_urls: { glb: "https://meshy/model.glb" }, thumbnail_url: "https://meshy/thumb.png" }),
    fetchFile: async () => glb,
  };
  const client = scriptedClient(async (t) => {
    assert.match(String(await t.get("search_sketchfab")!.run({ query: "volkswagen eos 1F", kind: "car" })), /No downloadable/);
    assert.match(String(await t.get("finish")!.run({ found: true, reason: "", generation: "1F", from: 2007, to: 2016, colors: [], signature: [], summary: "s", warnings: [] })), /Map a base model first/);
    const out = await t.get("generate_model")!.run({ prompt: "A 2012 Volkswagen Eos two-door retractable hardtop convertible, roof up, realistic", texture_prompt: "Neutral silver factory paint, black trim" });
    assert.ok(Array.isArray(out) && JSON.stringify(out).includes("meshy-fin"), "returns the generated uid and a thumbnail");
    assert.match(String(await t.get("map_base_model")!.run({ uid: "meshy-fin", front_axis: "+x", paint_materials: ["Nope"], glass_materials: [], caliper_materials: [], wheel_nodes: [], hide_nodes: [], has_interior: false, match_confidence: "medium", notes: "" })), /not in the model/);
    await t.get("map_base_model")!.run({ uid: "meshy-fin", front_axis: "+x", paint_materials: [paintMat], glass_materials: [], caliper_materials: [], wheel_nodes: wheelNodes, hide_nodes: [], has_interior: false, match_confidence: "medium", notes: "generated" });
    await t.get("finish")!.run({ found: true, reason: "", generation: "1F", from: 2007, to: 2016, colors: [{ name: "Candy White", hex: "#f2f2ee" }], signature: ["Retractable hardtop"], summary: "Generated stock Eos", warnings: ["AI-designed"] });
  });
  const r = await runLibraryAgent({ make: "Volkswagen", model: "Eos", generation: "1F", from: 2007, to: 2016, body: "roadster" }, { sketchfab: noSketchfab, meshy, store, client, sleep: async () => {} });
  assert.ok(!("found" in r));
  assert.equal(r.source, "generated");
  assert.equal(r.base.license, GENERATED_LICENSE);
  assert.equal(r.base.glbUrl, "https://storage/generated-fin.glb");
  assert.deepEqual([r.from, r.to, r.generation], [2007, 2016, "1F"]);
  assert.equal(r.thumbnail, "https://meshy/thumb.png");
  assert.ok(r.structure.includes(paintMat));
  assert.deepEqual(calls, ["preview:A 2012 Volkswagen Eo", "refine:pre:Neutral si"]);

  const plan = planFromLibrary({ make: "Volkswagen", model: "Eos", generation: "1F", source: r.source, base: r.base, warnings: r.warnings }, "#123456", "metallic");
  assert.deepEqual(plan.materials, [{ target: "paint", color: "#123456", finish: "metallic" }]);
  assert.match(plan.attribution[0], /AI-generated .*Not a scan/);
});

test("without a Meshy key the agent can't generate, and can report nothing found", async () => {
  let names: string[] = [];
  const client = scriptedClient(async (t) => {
    names = [...t.keys()];
    await t.get("finish")!.run({ found: false, reason: "No licensed model of this generation", generation: null, from: 2007, to: 2016, colors: [], signature: [], summary: "", warnings: [] });
  });
  const r = await runLibraryAgent({ make: "Volkswagen", model: "Eos", generation: "1F", from: 2007, to: 2016, body: "roadster" }, { sketchfab: noSketchfab, meshy: null, store, client });
  assert.ok(!names.includes("generate_model"));
  assert.deepEqual(r, { found: false, reason: "No licensed model of this generation" });
});
