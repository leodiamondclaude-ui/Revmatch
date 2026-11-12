import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { describeSummary, readGlbJson, summarizeGlb } from "../src/lib/agent/glbInspect";
import { createSketchfabClient, licenseAllowed } from "../src/lib/agent/sketchfab";
import { AssemblyPlanSchema, credit } from "../src/lib/agent/plan";

test("GLB inspector finds materials, wheels and sane bounds", () => {
  const s = summarizeGlb(readGlbJson(new Uint8Array(readFileSync("public/models/studio-car.glb"))));
  assert.ok(s.meshCount > 50);
  assert.ok(s.materials.some((m) => /^Paint/.test(m.name)));
  assert.ok(s.materials.some((m) => m.name === "Glass" && m.transparent));
  const rims = s.nodes.filter((n) => /Rim$/.test(n.node));
  assert.equal(rims.length, 4, "four rim nodes");
  // a car is longer than it is tall
  assert.ok(Math.max(s.size[0], s.size[2]) > s.size[1] * 2);
  const text = describeSummary(s, 30);
  assert.match(text, /Materials \(/);
  assert.ok(text.split("\n").length < 30 + s.materials.length + 5);
});

test("rejects non-GLB input", () => {
  assert.throws(() => readGlbJson(new TextEncoder().encode("not a glb file at all...")));
});

test("only commercial + modifiable licences pass", () => {
  assert.ok(licenseAllowed("by"));
  assert.ok(licenseAllowed("cc0"));
  for (const l of ["by-nc", "by-nc-sa", "by-nd", "by-nc-nd", "st", "ed", ""]) assert.ok(!licenseAllowed(l), l);
});

test("search filters licences and download needs a token", async () => {
  const fake = (async (url: string | URL) => {
    assert.match(String(url), /downloadable=true/);
    return new Response(JSON.stringify({ results: [
      { uid: "a", name: "Car A", viewerUrl: "v", faceCount: 1000, license: { slug: "by", label: "CC Attribution" }, user: { username: "x", displayName: "X" } },
      { uid: "b", name: "Car B", viewerUrl: "v", faceCount: 1000, license: { slug: "by-nc", label: "CC Attribution-NonCommercial" }, user: { username: "y", displayName: "Y" } },
    ] }));
  }) as typeof fetch;
  const sf = createSketchfabClient(undefined, fake);
  const r = await sf.search("porsche", { vehiclesOnly: true });
  assert.deepEqual(r.map((c) => c.uid), ["a"]);
  await assert.rejects(sf.download("a", 1e6), /SKETCHFAB_API_TOKEN/);
});

test("assembly plan schema and attribution", () => {
  const plan = {
    version: 1,
    base: { uid: "u", name: "2023 911", author: "Nazh", license: "CC Attribution", viewerUrl: "https://sketchfab.com/3d-models/u", glbUrl: "https://x/base.glb", frontAxis: "+z",
      mapping: { paint: ["Body"], glass: ["Glass"], calipers: [], wheelNodes: ["FL", "FR", "RL", "RR"], hide: [] }, matchConfidence: "high", hasInterior: true, notes: "" },
    parts: [{ modId: null, kind: "spoiler", uid: "w", name: "GT wing", author: "A", license: "CC0 Public Domain", viewerUrl: "v", glbUrl: "g", anchor: "rear_deck", rotationDeg: [0, 90, 0], sizeFraction: 0.9, offset: [0, 0, 0], replacesNodes: [] }],
    materials: [{ target: "paint", color: "#c8102e", finish: "gloss" }],
    summary: "s", warnings: [], attribution: [credit("2023 911", "Nazh", "CC Attribution", "https://sketchfab.com/3d-models/u")], createdAt: new Date().toISOString(),
  };
  assert.ok(AssemblyPlanSchema.safeParse(plan).success);
  assert.ok(!AssemblyPlanSchema.safeParse({ ...plan, parts: [{ ...plan.parts[0], anchor: "trunk" }] }).success);
  assert.match(plan.attribution[0], /by Nazh, CC Attribution, via Sketchfab/);
});
