/**
 * Reads a GLB's JSON chunk and summarises its structure (materials, mesh nodes and their
 * world-space bounds) so the agent can tell which parts are paint, glass, wheels or a wing.
 * Pure: no three.js, works on any GLB including meshopt/Draco-compressed ones, because it
 * only uses accessor min/max, which glTF requires for POSITION.
 */

type Vec3 = [number, number, number];
type Mat4 = number[]; // column-major, like glTF

interface GltfNode { name?: string; mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }
interface Gltf {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { name?: string; primitives: { attributes: Record<string, number>; material?: number }[] }[];
  accessors?: { min?: number[]; max?: number[] }[];
  materials?: { name?: string; alphaMode?: string; pbrMetallicRoughness?: { baseColorFactor?: number[]; metallicFactor?: number; roughnessFactor?: number; baseColorTexture?: unknown }; extensions?: Record<string, unknown> }[];
  asset?: { generator?: string };
}

export function readGlbJson(buf: Uint8Array): Gltf {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("Not a GLB file");
  const len = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error("GLB has no JSON chunk");
  return JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + len)));
}

const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a: Mat4, b: Mat4): Mat4 {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function compose(t: number[] = [0, 0, 0], q: number[] = [0, 0, 0, 1], s: number[] = [1, 1, 1]): Mat4 {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
    2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const apply = (m: Mat4, v: Vec3): Vec3 => [
  m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
  m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
  m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
];

export interface MeshNodeSummary { node: string; mesh: string; materials: string[]; min: Vec3; max: Vec3; center: Vec3; size: Vec3 }
export interface MaterialSummary { name: string; color: string | null; metallic: number; roughness: number; textured: boolean; transparent: boolean }
export interface GlbSummary { meshCount: number; nodes: MeshNodeSummary[]; materials: MaterialSummary[]; min: Vec3; max: Vec3; size: Vec3; generator: string | null }

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const hex = (c?: number[]) => (c ? "#" + c.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(1, v)) ** (1 / 2.2) * 255).toString(16).padStart(2, "0")).join("") : null);

export function summarizeGlb(json: Gltf): GlbSummary {
  const nodes = json.nodes ?? [], meshes = json.meshes ?? [], acc = json.accessors ?? [], mats = json.materials ?? [];
  const matName = (i?: number) => (i === undefined ? "(default)" : mats[i]?.name || `material_${i}`);
  const out: MeshNodeSummary[] = [];
  const gmin: Vec3 = [Infinity, Infinity, Infinity], gmax: Vec3 = [-Infinity, -Infinity, -Infinity];
  const seen = new Set<number>();
  const visit = (idx: number, parent: Mat4, path: string) => {
    if (seen.has(idx)) return; // guard against malformed cycles
    seen.add(idx);
    const n = nodes[idx]; if (!n) return;
    const local = n.matrix && n.matrix.length === 16 ? n.matrix : compose(n.translation, n.rotation, n.scale);
    const world = multiply(parent, local);
    const name = n.name || `node_${idx}`;
    if (n.mesh !== undefined && meshes[n.mesh]) {
      const mesh = meshes[n.mesh];
      const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
      for (const p of mesh.primitives) {
        const a = acc[p.attributes.POSITION];
        if (!a?.min || !a?.max) continue;
        for (let i = 0; i < 8; i++) {
          const c = apply(world, [i & 1 ? a.max[0] : a.min[0], i & 2 ? a.max[1] : a.min[1], i & 4 ? a.max[2] : a.min[2]]);
          for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], c[k]); max[k] = Math.max(max[k], c[k]); }
        }
      }
      if (min[0] !== Infinity) {
        for (let k = 0; k < 3; k++) { gmin[k] = Math.min(gmin[k], min[k]); gmax[k] = Math.max(gmax[k], max[k]); }
        out.push({
          node: path ? `${path}/${name}` : name, mesh: mesh.name || `mesh_${n.mesh}`,
          materials: [...new Set(mesh.primitives.map((p) => matName(p.material)))],
          min: min.map(r3) as Vec3, max: max.map(r3) as Vec3,
          center: min.map((v, k) => r3((v + max[k]) / 2)) as Vec3, size: min.map((v, k) => r3(max[k] - v)) as Vec3,
        });
      }
    }
    for (const c of n.children ?? []) visit(c, world, path ? `${path}/${name}` : name);
  };
  const roots = json.scenes?.[json.scene ?? 0]?.nodes ?? nodes.map((_, i) => i);
  for (const r of roots) visit(r, identity(), "");
  const materials: MaterialSummary[] = mats.map((m, i) => ({
    name: m.name || `material_${i}`,
    color: hex(m.pbrMetallicRoughness?.baseColorFactor),
    metallic: r3(m.pbrMetallicRoughness?.metallicFactor ?? 1),
    roughness: r3(m.pbrMetallicRoughness?.roughnessFactor ?? 1),
    textured: !!m.pbrMetallicRoughness?.baseColorTexture,
    transparent: m.alphaMode === "BLEND" || !!m.extensions?.KHR_materials_transmission,
  }));
  return {
    meshCount: out.length, nodes: out, materials,
    min: gmin.map(r3) as Vec3, max: gmax.map(r3) as Vec3, size: gmin.map((v, k) => r3(gmax[k] - v)) as Vec3,
    generator: json.asset?.generator ?? null,
  };
}

/** Compact text for the agent: biggest nodes first, capped so huge models stay readable. */
export function describeSummary(s: GlbSummary, maxNodes = 160) {
  const nodes = s.nodes.slice().sort((a, b) => b.size[0] * b.size[1] * b.size[2] - a.size[0] * a.size[1] * a.size[2]).slice(0, maxNodes);
  return [
    `Overall bounds min ${JSON.stringify(s.min)} max ${JSON.stringify(s.max)} size ${JSON.stringify(s.size)} (model units). ${s.meshCount} mesh nodes${s.nodes.length > maxNodes ? `, showing the ${maxNodes} largest` : ""}.`,
    `Materials (${s.materials.length}):`,
    ...s.materials.map((m) => `- "${m.name}" color ${m.color ?? "n/a"} metal ${m.metallic} rough ${m.roughness}${m.textured ? " textured" : ""}${m.transparent ? " transparent" : ""}`),
    `Mesh nodes (path | materials | center | size):`,
    ...nodes.map((n) => `- "${n.node}" | ${n.materials.join(", ")} | c ${JSON.stringify(n.center)} | s ${JSON.stringify(n.size)}`),
  ].join("\n");
}
