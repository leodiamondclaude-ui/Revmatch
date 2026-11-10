"use client";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ModelConfig } from "@/lib/types";
import { DEFAULT_CONFIG, STUDIO_CAR_CREDIT, type PartId } from "./parts";
export { STUDIO_CAR_CREDIT };

export const STUDIO_CAR_URL = "/models/studio-car.glb";
/** Target length of the normalised model, matching the parametric coupe so anchors line up. */
export const STUDIO_LENGTH = 4.45;

/** Which clickable part a mesh belongs to, from its material or node name. */
function partOf(mesh: THREE.Mesh): PartId | null {
  const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material)?.name ?? "";
  const n = mesh.name + " " + (mesh.parent?.name ?? "");
  if (/^Paint/.test(mat)) return "wrap";
  if (/^Rim|^Tire/.test(mat)) return "wheels";
  if (/^Brake|^Disc/.test(mat)) return "brakes";
  if (/^Glass/.test(mat)) return "tint";
  if (/light/i.test(mat)) return "lighting";
  if (/Underside|Axles/.test(n)) return "suspension";
  return null;
}
const isWheel = (o: THREE.Object3D) => {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (/^Wheel/.test(p.name)) return true;
  const m = (o as THREE.Mesh).material as THREE.Material | undefined;
  return !!m && /^(Tire|Rim|Brake|Disc)/.test(m.name);
};

function applyFinish(m: THREE.MeshPhysicalMaterial, color: string, finish: ModelConfig["finish"]) {
  m.color.set(color);
  // The model's metallic-flake normal map is tuned for a different light rig; keep it subtle.
  if (m.normalMap) m.normalScale.set(finish === "metallic" ? 0.18 : 0.08, finish === "metallic" ? 0.18 : 0.08);
  if (m.clearcoatNormalMap) m.clearcoatNormalMap = null;
  m.clearcoat = finish === "matte" ? 0 : finish === "satin" ? 0.35 : 1;
  m.clearcoatRoughness = finish === "satin" ? 0.4 : 0.03;
  m.roughness = finish === "matte" ? 0.62 : finish === "satin" ? 0.42 : finish === "metallic" ? 0.28 : 0.18;
  m.metalness = finish === "metallic" ? 0.72 : finish === "matte" ? 0.05 : 0.15;
  m.needsUpdate = true;
}

interface Props {
  config: ModelConfig;
  accent: string;
  selected?: string | null;
  onSelect?: (part: PartId) => void;
}

export function RealisticCar({ config, accent, selected, onSelect }: Props) {
  const c = { ...DEFAULT_CONFIG, ...config };
  const { scene } = useGLTF(STUDIO_CAR_URL);
  const [hover, setHover] = useState<PartId | null>(null);

  // Clone the scene and its materials once per viewer, orient it front → +X, scale and ground it.
  const model = useMemo(() => {
    const root = scene.clone(true);
    const parts = new Map<PartId, THREE.MeshPhysicalMaterial[]>();
    const body: THREE.Object3D[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const src = mesh.material as THREE.MeshStandardMaterial;
      const mat = src.clone() as THREE.MeshPhysicalMaterial;
      mesh.material = mat;
      const p = partOf(mesh);
      mesh.userData.part = p;
      if (p) parts.set(p, [...(parts.get(p) ?? []), mat]);
      if (!isWheel(mesh)) body.push(mesh);
    });
    // Orientation: headlights define the front.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const head = root.getObjectByName("BodyHeadlights");
    const tail = root.getObjectByName("BodyTaillights");
    const wrapper = new THREE.Group();
    wrapper.add(root);
    if (head && tail) {
      const h = new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3());
      const t = new THREE.Box3().setFromObject(tail).getCenter(new THREE.Vector3());
      const dir = h.sub(t).setY(0).normalize();
      root.rotation.y = Math.atan2(dir.z, dir.x); // rotate so front points to +X
    } else if (size.z > size.x) root.rotation.y = Math.PI / 2;
    wrapper.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(wrapper);
    const s2 = b2.getSize(new THREE.Vector3());
    const scale = STUDIO_LENGTH / Math.max(s2.x, s2.z);
    root.scale.multiplyScalar(scale);
    wrapper.updateMatrixWorld(true);
    const b3 = new THREE.Box3().setFromObject(wrapper);
    const ctr = b3.getCenter(new THREE.Vector3());
    root.position.sub(new THREE.Vector3(ctr.x, b3.min.y, ctr.z));
    wrapper.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(wrapper);
    // Gather the body (everything except wheels/brakes) into one group so ride height is a single
    // world-space Y offset. attach() keeps each mesh's world transform.
    const bodyGroup = new THREE.Group();
    wrapper.add(bodyGroup);
    for (const m of body) bodyGroup.attach(m);
    return { wrapper, parts, bodyGroup, bounds };
  }, [scene]);

  // Paint, wheels, calipers, glass.
  useEffect(() => {
    const { parts } = model;
    for (const m of parts.get("wrap") ?? []) {
      const secondary = /Paint 2/.test(m.name);
      applyFinish(m, secondary ? c.roofColor ?? c.paint : c.paint, c.finish);
    }
    for (const m of parts.get("wheels") ?? []) {
      if (/^Rim1/.test(m.name)) { m.color.set(c.wheelColor); m.metalness = 0.9; m.roughness = 0.25; }
      if (/^Rim2/.test(m.name)) { m.color.set(c.wheelColor).multiplyScalar(0.55); m.metalness = 0.85; m.roughness = 0.35; }
    }
    for (const m of parts.get("brakes") ?? []) if (/^Brake/.test(m.name)) m.color.set(c.caliperColor);
    // Keep lamps bright but below the bloom blow-out point.
    for (const m of parts.get("lighting") ?? []) m.emissiveIntensity = Math.min(m.emissiveIntensity, /Head/.test(m.name) ? 3 : 2);
    for (const m of parts.get("tint") ?? []) {
      // Darker, less transmissive glass as tint increases.
      // Real auto glass: dark, glossy, reflective; tint reduces how much of the cabin shows through.
      m.color.set(new THREE.Color("#a9b6c0").lerp(new THREE.Color("#030405"), 0.45 + c.tint * 0.5));
      if ("transmission" in m) m.transmission = Math.max(0.15, 0.95 - c.tint * 0.75);
      m.roughness = 0;
      m.metalness = 0;
      m.envMapIntensity = 1.4;
      if ("ior" in m) m.ior = 1.52;
    }
  }, [model, c.paint, c.roofColor, c.finish, c.wheelColor, c.caliperColor, c.tint]);

  // Hover / selection glow.
  useEffect(() => {
    const on = hover ?? selected;
    for (const [part, mats] of model.parts) {
      for (const m of mats) {
        if (m.userData.baseEmissive === undefined) {
          m.userData.baseEmissive = m.emissive.getHex();
          m.userData.baseIntensity = m.emissiveIntensity;
        }
        if (part === on && part !== "lighting") { m.emissive.set(accent); m.emissiveIntensity = 0.35; }
        else { m.emissive.setHex(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseIntensity; }
      }
    }
  }, [hover, selected, model, accent]);

  // Ride height: move the body, leave wheels on the ground.
  useEffect(() => {
    model.bodyGroup.position.y = (c.rideHeight ?? 0) * 0.045;
  }, [c.rideHeight, model]);

  // Aero add-ons are placed on the real bodywork by raycasting against the body meshes.
  const surf = useMemo(() => {
    const ray = new THREE.Raycaster();
    const meshes: THREE.Object3D[] = [];
    model.wrapper.updateMatrixWorld(true);
    model.bodyGroup.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
    const hit = (o: [number, number, number], d: [number, number, number]) => {
      ray.set(new THREE.Vector3(...o), new THREE.Vector3(...d).normalize());
      return ray.intersectObjects(meshes, false)[0]?.point ?? null;
    };
    const b = model.bounds;
    const lowY = 0.32;
    const frontX = hit([6, lowY, 0], [-1, 0, 0])?.x ?? b.max.x;
    const rearX = hit([-6, lowY + 0.1, 0], [1, 0, 0])?.x ?? b.min.x;
    const sideZ = hit([0, 0.3, 6], [0, 0, -1])?.z ?? b.max.z;
    const deckX = rearX + 0.5;
    const deckY = hit([deckX, 6, 0], [0, -1, 0])?.y ?? b.max.y * 0.7;
    // Ground clearance: lowest bodywork just behind the front bumper.
    const bottomY = Math.min(0.3, Math.max(0.06, hit([frontX - 0.25, -1, 0], [0, 1, 0])?.y ?? 0.15));
    return { frontX, rearX, sideZ, deckX, deckY, bottomY, width: sideZ * 2 };
  }, [model]);

  const handlers = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      const p = e.object.userData.part as PartId | null;
      if (!p) return;
      e.stopPropagation();
      onSelect?.(p);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      const p = e.object.userData.part as PartId | null;
      if (!p) return;
      e.stopPropagation();
      setHover(p);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => { setHover(null); document.body.style.cursor = ""; },
  };

  const glow = (p: PartId) => (hover === p || selected === p ? accent : "#000000");
  const { frontX, rearX, sideZ, deckX, deckY, bottomY, width } = surf;
  const lift = (c.rideHeight ?? 0) * 0.045;
  const tipColor = c.exhaustFinish === "black" ? "#161616" : c.exhaustFinish === "titanium" ? "#7a6aa8" : "#d8dce0";
  const tipZ = c.exhaust === "single" ? [width * 0.28] : c.exhaust === "quad" ? [-0.38, -0.27, 0.27, 0.38] : c.exhaust === "center" ? [-0.06, 0.06] : [-0.34, 0.34];
  const Carbon = ({ part }: { part: PartId }) => (
    <meshPhysicalMaterial color="#050506" roughness={0.3} metalness={0.2} clearcoat={1} clearcoatRoughness={0.04} envMapIntensity={0.3} emissive={glow(part)} emissiveIntensity={0.4} />
  );
  const pick = (p: PartId) => ({
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect?.(p); },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(p); document.body.style.cursor = "pointer"; },
    onPointerOut: () => { setHover(null); document.body.style.cursor = ""; },
  });
  const wingH = c.spoiler === "gt_wing" ? 0.3 : 0.16;

  return (
    <group>
      <group {...handlers}><primitive object={model.wrapper} /></group>

      {c.spoiler && c.spoiler !== "none" && (
        <group position={[deckX, deckY + lift, 0]} {...pick("spoiler")}>
          {c.spoiler === "lip" || c.spoiler === "ducktail" ? (
            <mesh position={[-0.05, c.spoiler === "lip" ? 0.012 : 0.03, 0]} rotation={[0, 0, c.spoiler === "lip" ? -0.12 : -0.35]} castShadow>
              <boxGeometry args={[0.16, c.spoiler === "lip" ? 0.02 : 0.05, width * 0.72]} />
              <Carbon part="spoiler" />
            </mesh>
          ) : (
            <>
              {[0.32, -0.32].map((z) => (
                <mesh key={z} position={[0, wingH / 2, z]} castShadow>
                  <boxGeometry args={[0.07, wingH, 0.018]} />
                  <Carbon part="spoiler" />
                </mesh>
              ))}
              <mesh position={[-0.04, wingH + 0.01, 0]} rotation={[0, 0, 0.09]} castShadow>
                <boxGeometry args={[c.spoiler === "gt_wing" ? 0.3 : 0.2, 0.022, width * (c.spoiler === "gt_wing" ? 0.96 : 0.78)]} />
                <Carbon part="spoiler" />
              </mesh>
              {c.spoiler === "gt_wing" && [1, -1].map((s2) => (
                <mesh key={s2} position={[-0.04, wingH + 0.01, s2 * width * 0.48]}>
                  <boxGeometry args={[0.36, 0.12, 0.012]} />
                  <meshPhysicalMaterial color="#050506" roughness={0.6} metalness={0.1} clearcoat={0.3} clearcoatRoughness={0.3} envMapIntensity={0.15} emissive={glow("spoiler")} emissiveIntensity={0.4} />
                </mesh>
              ))}
            </>
          )}
        </group>
      )}
      {c.splitter && (
        <mesh position={[frontX - 0.09, bottomY + 0.01 + lift, 0]} castShadow {...pick("splitter")}>
          <boxGeometry args={[0.1, 0.012, width * 0.8]} />
          <Carbon part="splitter" />
        </mesh>
      )}
      {c.diffuser && (
        <group position={[rearX + 0.1, bottomY + lift, 0]} {...pick("diffuser")}>
          {[-0.34, -0.12, 0.12, 0.34].map((z) => (
            <mesh key={z} position={[0, 0.045, z]} rotation={[0, 0, 0.22]}>
              <boxGeometry args={[0.28, 0.08, 0.01]} />
              <Carbon part="diffuser" />
            </mesh>
          ))}
        </group>
      )}
      {c.sideSkirts && [1, -1].map((s2) => (
        <mesh key={s2} position={[0, bottomY + 0.03 + lift, s2 * (sideZ - 0.03)]} {...pick("body_kit")}>
          <boxGeometry args={[(frontX - rearX) * 0.38, 0.035, 0.05]} />
          <Carbon part="body_kit" />
        </mesh>
      ))}
      <group {...pick("exhaust")}>
        {tipZ.map((z) => (
          <mesh key={z} position={[rearX + 0.04, bottomY + 0.1 + lift, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.04, 0.036, 0.1, 28, 1, true]} />
            <meshStandardMaterial color={tipColor} metalness={0.95} roughness={c.exhaustFinish === "black" ? 0.5 : 0.15} side={THREE.DoubleSide} emissive={glow("exhaust")} emissiveIntensity={0.4} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

useGLTF.preload(STUDIO_CAR_URL);
