"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Lightformer, MeshReflectorMaterial, OrbitControls, useGLTF, useProgress } from "@react-three/drei";
import { Bloom, EffectComposer, SMAA, Vignette } from "@react-three/postprocessing";
import studioHdr from "@pmndrs/assets/hdri/studio.exr";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { BodyStyle, ModCategory, ModelConfig } from "@/lib/types";
import { ProceduralCar } from "./ProceduralCar";
import { RealisticCar, STUDIO_CAR_CREDIT } from "./RealisticCar";
import { AssembledCar } from "./AssembledCar";
import type { AssemblyPlan } from "@/lib/agent/plan";
export { STUDIO_CAR_CREDIT };
import { dimsFor } from "./carGeometry";
import { CATEGORY_PART, PART_LABEL, VIEWS, type ViewId } from "./parts";
export { CATEGORY_PART, PART_LABEL, VIEWS, type ViewId };

/** Mods without dedicated geometry are shown as pins at these anchors. */
const PIN_ANCHOR: Partial<Record<ModCategory, "engine_bay" | "interior" | "drivetrain">> = {
  intake: "engine_bay", forced_induction: "engine_bay", engine: "engine_bay", tune: "engine_bay",
  interior: "interior", drivetrain: "drivetrain", other: "interior",
};

export interface ViewerMod { id: string; category: ModCategory; name: string }

interface Props {
  bodyStyle: BodyStyle;
  config: ModelConfig;
  accent: string;
  modelUrl?: string | null;
  /** Agent-built assembly (licensed base model + fitted parts). Takes precedence over modelUrl. */
  assembly?: AssemblyPlan | null;
  mods?: ViewerMod[];
  selected?: string | null;
  onSelect?: (part: string) => void;
  view?: ViewRequest;
  autoRotate?: boolean;
  className?: string;
  showPins?: boolean;
  /** "high" adds ambient occlusion and a reflective floor; "auto" picks by device. */
  quality?: "auto" | "high" | "low";
}

/** A black environment for the floor so studio lighting doesn't give it a grey specular sheen. */
const BLACK_ENV = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.needsUpdate = true;
  return t;
})();

/** The representation a viewer will show for this vehicle. */
export function representationOf(config: ModelConfig, modelUrl?: string | null, assembly?: AssemblyPlan | null) {
  if (assembly) return "assembled" as const;
  if (modelUrl) return "glb" as const;
  return config.representation === "parametric" ? ("parametric" as const) : ("studio" as const);
}

function LoadingOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="text-center">
        <div className="label">Loading model</div>
        <div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-surface-3"><div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} /></div>
      </div>
    </div>
  );
}

export type ViewRequest = { id: ViewId; n: number };

function CameraRig({ view, controls }: { view?: ViewRequest; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { camera } = useThree();
  const target = useRef<THREE.Vector3 | null>(null);
  useEffect(() => {
    if (view) target.current = new THREE.Vector3(...VIEWS[view.id].pos);
  }, [view]);
  useFrame(() => {
    if (!target.current) return;
    camera.position.lerp(target.current, 0.08);
    controls.current?.target.lerp(new THREE.Vector3(0, 0.6, 0), 0.08);
    controls.current?.update();
    if (camera.position.distanceTo(target.current) < 0.02) target.current = null;
  });
  return null;
}

/** Widens the field of view on portrait screens so the whole car stays in frame. */
function ResponsiveFov() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    cam.fov = aspect >= 1.7 ? 35 : Math.min(68, 35 * (1.7 / aspect) ** 0.8);
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

/** Projects 3D anchor points to screen space each frame and moves the DOM hotspot buttons. */
function PinProjector({ anchors, els }: { anchors: [string, [number, number, number]][]; els: React.RefObject<Record<string, HTMLButtonElement | null>> }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const [part, pos] of anchors) {
      const el = els.current?.[part];
      if (!el) continue;
      v.set(...pos).project(camera);
      const visible = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      el.style.visibility = visible ? "visible" : "hidden";
      // Offset so the dot (not the label) sits on the anchor.
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width - 6}px, ${((1 - v.y) / 2) * size.height - 6}px)`;
    }
  });
  return null;
}

function GlbCar({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const root = scene.clone(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    // Orient the longest horizontal axis along X (our "front" axis).
    if (size.z > size.x) root.rotation.y = Math.PI / 2;
    const box2 = new THREE.Box3().setFromObject(root);
    const s2 = box2.getSize(new THREE.Vector3());
    const scale = 4.5 / Math.max(s2.x, s2.z);
    root.scale.multiplyScalar(scale);
    const box3 = new THREE.Box3().setFromObject(root);
    const center = box3.getCenter(new THREE.Vector3());
    root.position.sub(new THREE.Vector3(center.x, box3.min.y, center.z));
    root.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return root;
  }, [scene]);
  return <primitive object={obj} />;
}

function anchorFor(part: string, bodyStyle: BodyStyle, wheelSize?: number): [number, number, number] {
  const d = dimsFor(bodyStyle, wheelSize);
  switch (part) {
    case "wheels": return [d.WB / 2, d.r, d.W / 2 + 0.05];
    case "brakes": return [-d.WB / 2, d.r, d.W / 2 + 0.05];
    case "spoiler": return [-d.L / 2 + 0.2, (d.hatch || d.bed ? d.roof : d.tail) + 0.3, 0];
    case "splitter": return [d.L / 2 + 0.1, 0.2, 0];
    case "diffuser": return [-d.L / 2 - 0.05, 0.25, 0];
    case "body_kit": return [0, 0.25, d.W / 2 + 0.1];
    case "exhaust": return [-d.L / 2 - 0.1, 0.3, 0.5];
    case "tint": return [d.cabinRear / 2, (d.belt + d.roof) / 2, d.W * 0.4];
    case "wrap": return [d.L / 2 - 0.6, d.belt + 0.05, 0];
    case "suspension": return [d.WB / 2, d.r * 2 + 0.15, d.W / 2];
    case "lighting": return [d.L / 2, d.nose, d.W / 2 - 0.3];
    case "engine_bay": return [d.L / 2 - 0.7, d.belt + 0.1, 0];
    case "interior": return [(d.cabinFront + d.cabinRear) / 2, d.belt + 0.25, 0];
    case "drivetrain": return [-d.WB / 2 + 0.4, 0.2, 0];
    default: return [0, 1, 0];
  }
}

export function VehicleViewer({ bodyStyle, config, accent, modelUrl, assembly, mods = [], selected, onSelect, view, autoRotate, className, showPins = true, quality = "auto" }: Props) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const pinEls = useRef<Record<string, HTMLButtonElement | null>>({});
  const [interacted, setInteracted] = useState(false);
  const rep = representationOf(config, modelUrl, assembly);
  const [hq, setHq] = useState(quality === "high");
  useEffect(() => {
    if (quality !== "auto") { setHq(quality === "high"); return; }
    // Phones and low-core devices get the lighter pipeline (no AO, cheaper floor).
    const mobile = window.matchMedia("(pointer: coarse)").matches || (navigator.hardwareConcurrency ?? 8) < 6;
    setHq(!mobile);
  }, [quality]);

  // Which pins to show: every mod part in GLB mode (no part geometry to click),
  // otherwise only the non-geometric categories.
  const pins = useMemo(() => {
    const m = new Map<string, number>();
    for (const mod of mods) {
      const part = rep === "glb" || rep === "assembled" ? CATEGORY_PART[mod.category] ?? PIN_ANCHOR[mod.category] : PIN_ANCHOR[mod.category];
      if (part) m.set(part, (m.get(part) ?? 0) + 1);
    }
    return [...m.entries()];
  }, [mods, rep]);
  const anchorStyle: BodyStyle = rep === "parametric" ? bodyStyle : "coupe";

  return (
    <div className={className ?? "relative h-[420px] w-full"}>
      <Canvas shadows dpr={[1, hq ? 2 : 1.5]} camera={{ position: [4.7, 1.35, 3.8], fov: 35 }}
        gl={{ antialias: false, toneMapping: THREE.AgXToneMapping, toneMappingExposure: 0.95, powerPreference: "high-performance" }}
        onPointerMissed={() => onSelect?.("")} onPointerDown={() => setInteracted(true)}>
        <color attach="background" args={["#060709"]} />
        <fog attach="fog" args={["#060709", 11, 22]} />
        <ambientLight intensity={0.08} />
        {/* Key light for crisp contact shadows; reflections come from the studio environment. */}
        <spotLight position={[4, 9, 3]} angle={0.4} penumbra={1} intensity={28} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.0001} />
        <spotLight position={[-8, 1.2, -6]} angle={0.5} penumbra={1} intensity={14} color={accent} />
        <Suspense fallback={null}>
          {rep === "assembled" ? <AssembledCar plan={assembly!} config={config} />
            : rep === "glb" ? <GlbCar url={modelUrl!} />
            : rep === "studio" ? <RealisticCar config={config} accent={accent} selected={selected} onSelect={(p) => onSelect?.(p)} />
            : <ProceduralCar bodyStyle={bodyStyle} config={config} accent={accent} selected={selected} onSelect={(p) => onSelect?.(p)} />}
          {/* Photographic studio HDRI (CC0, Poly Haven via pmndrs/assets) plus softboxes for long body-line highlights. */}
          <Environment files={studioHdr} resolution={512} environmentIntensity={0.5}>
            <Lightformer form="rect" intensity={4} position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[8, 2.5, 1]} />
            <Lightformer form="rect" intensity={2.4} position={[-5, 1.6, 1]} rotation-y={Math.PI / 2} scale={[10, 0.6, 1]} />
            <Lightformer form="rect" intensity={2.4} position={[5, 1.6, -1]} rotation-y={-Math.PI / 2} scale={[10, 0.6, 1]} />
          </Environment>
        </Suspense>
        {showPins && <PinProjector anchors={pins.map(([part]) => [part, anchorFor(part, anchorStyle, config.wheelSize)])} els={pinEls} />}
        <ContactShadows position={[0, 0.002, 0]} opacity={0.85} scale={10} blur={2.2} far={2.5} resolution={hq ? 1024 : 512} color="#000000" />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <circleGeometry args={[10, 96]} />
          {hq ? (
            <MeshReflectorMaterial envMap={BLACK_ENV} envMapIntensity={0} resolution={1024} blur={[400, 120]} mixBlur={1} mixStrength={1.4} mirror={0.4}
              depthScale={0.9} minDepthThreshold={0.4} maxDepthThreshold={1.3} roughness={1} metalness={0} color="#050506" />
          ) : (
            <meshLambertMaterial color="#060607" />
          )}
        </mesh>
        <OrbitControls ref={controls} makeDefault enablePan enableDamping minDistance={3} maxDistance={14}
          maxPolarAngle={Math.PI / 2 - 0.03} target={[0, 0.55, 0]} autoRotate={autoRotate && !interacted} autoRotateSpeed={0.6} />
        <CameraRig view={view} controls={controls} />
        <ResponsiveFov />
        <EffectComposer multisampling={0} enableNormalPass={false}>
                    <Bloom luminanceThreshold={1.6} intensity={0.25} mipmapBlur />
          <Vignette offset={0.25} darkness={0.55} />
          <SMAA />
        </EffectComposer>
      </Canvas>
      <LoadingOverlay />
      {showPins && pins.map(([part, count]) => (
        <button key={part} type="button" ref={(el) => { pinEls.current[part] = el; }} onClick={() => onSelect?.(part)}
          style={{ position: "absolute", left: 0, top: 0, visibility: "hidden" }}
          className={`hotspot z-10 ${selected === part ? "hotspot-on" : ""}`} aria-label={PART_LABEL[part] ?? part}>
          <span className="hotspot-dot" />
          <span className="hotspot-label">{PART_LABEL[part] ?? part}{count > 1 ? ` ·${count}` : ""}</span>
        </button>
      ))}
    </div>
  );
}

export default VehicleViewer;
