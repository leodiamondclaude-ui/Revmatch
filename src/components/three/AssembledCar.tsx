"use client";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { AssemblyPlan } from "@/lib/agent/plan";
import type { ModelConfig } from "@/lib/types";

/** GLTFLoader sanitises node names the same way (three/PropertyBinding.sanitizeNodeName). */
const sanitize = (n: string) => n.replace(/\s/g, "_").replace(/[\[\]\.:\/]/g, "");
const lastSeg = (path: string) => sanitize(path.split("/").pop() ?? path);
const LENGTH = 4.45;
const AXIS_YAW: Record<AssemblyPlan["base"]["frontAxis"], number> = { "+x": 0, "-x": Math.PI, "+z": Math.PI / 2, "-z": -Math.PI / 2 };

function findNodes(root: THREE.Object3D, paths: string[]) {
  const want = new Set(paths.map(lastSeg)), out: THREE.Object3D[] = [];
  root.traverse((o) => { if (want.has(o.name)) out.push(o); });
  return out;
}
function finish(m: THREE.MeshStandardMaterial, color: string, f: ModelConfig["finish"] | null) {
  m.color.set(color);
  if (!f) return;
  const p = m as THREE.MeshPhysicalMaterial;
  m.roughness = f === "matte" ? 0.62 : f === "satin" ? 0.42 : f === "metallic" ? 0.28 : 0.18;
  m.metalness = f === "metallic" ? 0.72 : f === "matte" ? 0.05 : 0.15;
  if ("clearcoat" in p) { p.clearcoat = f === "matte" ? 0 : f === "satin" ? 0.35 : 1; p.clearcoatRoughness = f === "satin" ? 0.4 : 0.03; }
  m.needsUpdate = true;
}

/** Renders an AssemblyPlan: licensed base model + fitted parts + material overrides. */
export function AssembledCar({ plan, config }: { plan: AssemblyPlan; config: ModelConfig }) {
  const base = useGLTF(plan.base.glbUrl);
  const partGltfs = useGLTF(plan.parts.map((p) => p.glbUrl)) as unknown as { scene: THREE.Group }[];

  const built = useMemo(() => {
    const root = base.scene.clone(true);
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : (m.material as THREE.Material).clone();
    });
    // Face +X, scale to a standard length, sit on the ground, centre on the origin.
    const wrapper = new THREE.Group(); wrapper.add(root);
    root.rotation.y = -AXIS_YAW[plan.base.frontAxis];
    wrapper.updateMatrixWorld(true);
    let box = new THREE.Box3().setFromObject(wrapper);
    root.scale.multiplyScalar(LENGTH / Math.max(1e-6, box.max.x - box.min.x));
    wrapper.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(wrapper);
    const ctr = box.getCenter(new THREE.Vector3());
    root.position.sub(new THREE.Vector3(ctr.x, box.min.y, ctr.z));
    wrapper.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(wrapper);
    const size = box.getSize(new THREE.Vector3());

    const mats = (pred: (name: string, mesh: THREE.Mesh) => boolean) => {
      const out: THREE.MeshStandardMaterial[] = [];
      root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; for (const mt of ([] as THREE.Material[]).concat(m.material)) if (pred(mt.name, m)) out.push(mt as THREE.MeshStandardMaterial); });
      return out;
    };
    const set = (names: string[]) => new Set(names);
    const paintSet = set(plan.base.mapping.paint), glassSet = set(plan.base.mapping.glass), calSet = set(plan.base.mapping.calipers);
    const wheelNodes = findNodes(root, plan.base.mapping.wheelNodes);
    const underWheel = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p; p = p.parent) if (wheelNodes.includes(p)) return true; return false; };
    const groups = {
      paint: mats((n) => paintSet.has(n)), glass: mats((n) => glassSet.has(n)), calipers: mats((n) => calSet.has(n)),
      wheels: mats((n, m) => underWheel(m) && !/tire|tyre|rubber|tread/i.test(n) && !calSet.has(n)),
    };
    for (const n of findNodes(root, plan.base.mapping.hide)) n.visible = false;

    // Anchor points on the real bodywork (raycast against visible body meshes).
    const body: THREE.Object3D[] = []; root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible && !underWheel(o)) body.push(o); });
    const ray = new THREE.Raycaster();
    const topAt = (x: number) => { ray.set(new THREE.Vector3(x, size.y * 3, 0), new THREE.Vector3(0, -1, 0)); return ray.intersectObjects(body, true)[0]?.point.y ?? size.y * 0.7; };
    const anchorPoint = (a: AssemblyPlan["parts"][number]["anchor"]) => {
      switch (a) {
        case "rear_deck": return new THREE.Vector3(box.min.x + 0.12 * size.x, topAt(box.min.x + 0.12 * size.x), 0);
        case "front_lip": return new THREE.Vector3(box.max.x - 0.04, size.y * 0.1, 0);
        case "rear_lower": return new THREE.Vector3(box.min.x + 0.05, size.y * 0.16, 0);
        case "roof": return new THREE.Vector3(box.min.x + 0.45 * size.x, topAt(box.min.x + 0.45 * size.x), 0);
        default: return new THREE.Vector3(0, size.y * 0.08, 0);
      }
    };
    const wheelInfo = wheelNodes.map((n) => { const b = new THREE.Box3().setFromObject(n); return { center: b.getCenter(new THREE.Vector3()), dia: Math.max(b.max.y - b.min.y, b.max.x - b.min.x) }; });

    const fitted: THREE.Object3D[] = [];
    plan.parts.forEach((part, i) => {
      const src = partGltfs[i]?.scene; if (!src) return;
      for (const n of findNodes(root, part.replacesNodes)) n.visible = false;
      const prep = () => {
        const inner = src.clone(true);
        inner.rotation.set(...(part.rotationDeg.map((d) => THREE.MathUtils.degToRad(d)) as [number, number, number]));
        inner.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
        const g = new THREE.Group(); g.add(inner); g.updateMatrixWorld(true);
        const pb = new THREE.Box3().setFromObject(g), pc = pb.getCenter(new THREE.Vector3());
        inner.position.sub(pc); // centre on the group origin
        return { g, psize: pb.getSize(new THREE.Vector3()) };
      };
      const place = (g: THREE.Group, p: THREE.Vector3, scale: number, psize: THREE.Vector3, bottom: boolean) => {
        g.scale.setScalar(scale);
        g.position.copy(p).add(new THREE.Vector3(...part.offset));
        if (bottom) g.position.y += (psize.y * scale) / 2;
        wrapper.add(g); fitted.push(g);
      };
      if (part.anchor === "wheels") {
        for (const w of wheelInfo) {
          const { g, psize } = prep();
          if (w.center.z < 0) g.rotation.y = Math.PI; // mirror for the far side
          place(g, w.center, (w.dia * part.sizeFraction) / Math.max(psize.x, psize.y), psize, false);
        }
        for (const n of wheelNodes) n.visible = false;
      } else if (part.anchor === "side_skirts") {
        for (const s of [1, -1]) {
          const { g, psize } = prep(); if (s < 0) g.rotation.y = Math.PI;
          place(g, new THREE.Vector3(0, size.y * 0.08, s * (size.z / 2 - 0.02)), (size.x * 0.45 * part.sizeFraction) / Math.max(psize.x, 1e-6), psize, false);
        }
      } else {
        const { g, psize } = prep();
        place(g, anchorPoint(part.anchor), (size.z * part.sizeFraction) / Math.max(psize.z, 1e-6), psize, part.anchor === "rear_deck" || part.anchor === "roof");
      }
    });
    return { wrapper, groups };
  }, [base, partGltfs, plan]);

  // Agent's colour choices first; the owner's configurator paint/finish and tint win.
  useEffect(() => {
    for (const m of plan.materials) for (const mt of built.groups[m.target]) finish(mt, m.color, m.finish);
    if (config.paint) for (const mt of built.groups.paint) finish(mt, config.paint, config.finish ?? null);
    if (config.tint != null) for (const mt of built.groups.glass) {
      mt.color.set(new THREE.Color("#a9b6c0").lerp(new THREE.Color("#030405"), 0.45 + config.tint * 0.5));
      const p = mt as THREE.MeshPhysicalMaterial; if ("transmission" in p && p.transmission > 0) p.transmission = Math.max(0.15, 0.95 - config.tint * 0.75);
    }
  }, [built, plan, config.paint, config.finish, config.tint]);

  return <primitive object={built.wrapper} />;
}
