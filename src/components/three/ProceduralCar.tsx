"use client";
import { useMemo, useState } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { BodyStyle, ModelConfig } from "@/lib/types";
import { bodyShape, cabinShape, dimsFor, extrude, type Dims } from "./carGeometry";

import { DEFAULT_CONFIG, type PartId } from "./parts";
export { DEFAULT_CONFIG };
export type { PartId };

interface Props {
  bodyStyle: BodyStyle;
  config: ModelConfig;
  accent: string;
  selected?: string | null;
  onSelect?: (part: PartId) => void;
}


function usePaint(color: string, finish: ModelConfig["finish"]) {
  return useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({ color });
    if (finish === "matte") { m.roughness = 0.75; m.metalness = 0.1; m.clearcoat = 0; }
    else if (finish === "satin") { m.roughness = 0.45; m.metalness = 0.3; m.clearcoat = 0.3; m.clearcoatRoughness = 0.5; }
    else if (finish === "gloss") { m.roughness = 0.25; m.metalness = 0.05; m.clearcoat = 1; m.clearcoatRoughness = 0.05; }
    else { m.roughness = 0.32; m.metalness = 0.65; m.clearcoat = 1; m.clearcoatRoughness = 0.06; }
    return m;
  }, [color, finish]);
}

export function ProceduralCar({ bodyStyle, config, accent, selected, onSelect }: Props) {
  const c = { ...DEFAULT_CONFIG, ...config };
  const [hover, setHover] = useState<PartId | null>(null);
  const d = useMemo(() => dimsFor(bodyStyle, c.wheelSize), [bodyStyle, c.wheelSize]);
  const lift = (c.rideHeight ?? 0) * 0.07;
  const bottom = 0.2 + lift;
  const bodyGeo = useMemo(() => extrude(bodyShape(d, bottom), d.W - 0.12, 0.06), [d, bottom]);
  const cabinGeo = useMemo(() => extrude(cabinShape(d), d.W * 0.78, 0.05), [d]);
  const paint = usePaint(c.paint, c.finish);

  const isOn = (p: PartId) => hover === p || selected === p;
  const glow = (p: PartId) => (isOn(p) ? { emissive: new THREE.Color(accent), emissiveIntensity: 0.55 } : { emissive: new THREE.Color("#000"), emissiveIntensity: 0 });

  const handlers = (p: PartId) => ({
    onClick: (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onSelect?.(p); },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(p); document.body.style.cursor = "pointer"; },
    onPointerOut: () => { setHover(null); document.body.style.cursor = ""; },
  });

  const paintHighlighted = useMemo(() => {
    const m = paint.clone();
    m.emissive = new THREE.Color(accent);
    m.emissiveIntensity = 0.25;
    return m;
  }, [paint, accent]);

  const tintOpacity = 0.35 + c.tint * 0.6;
  const glassColor = new THREE.Color("#0a0d12").lerp(new THREE.Color("#5f7a8c"), 1 - c.tint);
  const trim = "#0d0e10";

  return (
    <group>
      {/* Body */}
      <mesh geometry={bodyGeo} material={isOn("wrap") ? paintHighlighted : paint} castShadow receiveShadow {...handlers("wrap")} />
      {/* Greenhouse */}
      <mesh geometry={cabinGeo} castShadow {...handlers("tint")}>
        <meshPhysicalMaterial color={glassColor} roughness={0.05} metalness={0.2} transparent opacity={tintOpacity} clearcoat={1} {...glow("tint")} />
      </mesh>
      {/* Roof skin */}
      <mesh position={[(d.cabinFront - d.wsRake + d.cabinRear + d.rearRake) / 2, d.roof + 0.045, 0]} castShadow>
        <boxGeometry args={[Math.max(0.3, d.cabinFront - d.wsRake - (d.cabinRear + d.rearRake)) + 0.1, 0.035, d.W * 0.78]} />
        <primitive object={c.roofColor ? new THREE.MeshPhysicalMaterial({ color: c.roofColor, roughness: 0.3, clearcoat: 1 }) : paint} attach="material" />
      </mesh>

      {d.bed && (
        <mesh position={[(d.cabinRear - d.L / 2) / 2, d.belt + 0.02, 0]}>
          <boxGeometry args={[Math.abs(d.cabinRear + d.L / 2) - 0.2, 0.03, d.W - 0.3]} />
          <meshStandardMaterial color="#111" roughness={0.9} />
        </mesh>
      )}

      {/* Stripes / decals */}
      {c.stripe === "racing" && c.stripeColor && (
        <group {...handlers("wrap")}>
          {[-0.18, 0.18].map((z) => (
            <mesh key={z} position={[0, d.roof + 0.065, z]}>
              <boxGeometry args={[Math.max(0.3, d.cabinFront - d.wsRake - (d.cabinRear + d.rearRake)) + 0.08, 0.005, 0.18]} />
              <meshStandardMaterial color={c.stripeColor ?? undefined} roughness={0.4} />
            </mesh>
          ))}
          {[-0.18, 0.18].map((z) => (
            <mesh key={"h" + z} position={[(d.L / 2 + d.cabinFront) / 2 - 0.05, d.belt - 0.06 + (d.nose - d.belt) * 0.4, z]} rotation={[0, 0, -Math.atan2(d.belt - d.nose, d.L / 2 - d.cabinFront)]}>
              <boxGeometry args={[d.L / 2 - d.cabinFront, 0.005, 0.18]} />
              <meshStandardMaterial color={c.stripeColor ?? undefined} roughness={0.4} />
            </mesh>
          ))}
        </group>
      )}
      {c.stripe === "side" && c.stripeColor && (
        <group {...handlers("wrap")}>
          {[1, -1].map((s) => (
            <mesh key={s} position={[0, bottom + 0.22, s * ((d.W - 0.12) / 2 + 0.065)]}>
              <boxGeometry args={[d.L * 0.62, 0.07, 0.004]} />
              <meshStandardMaterial color={c.stripeColor ?? undefined} roughness={0.4} />
            </mesh>
          ))}
        </group>
      )}

      {/* Lights */}
      <group {...handlers("lighting")}>
        {[1, -1].map((s) => (
          <mesh key={"hl" + s} position={[d.L / 2 - 0.08, d.nose - 0.08, s * (d.W / 2 - 0.3)]} rotation={[0, 0, -0.35]}>
            <boxGeometry args={[0.2, 0.06, 0.38]} />
            <meshStandardMaterial color="#e8f4ff" emissive="#dff1ff" emissiveIntensity={isOn("lighting") ? 3 : 1.6} />
          </mesh>
        ))}
        <mesh position={[-d.L / 2 - 0.035, (d.bed ? d.belt - 0.15 : d.tail) - 0.12, 0]}>
          <boxGeometry args={[0.03, 0.06, d.W - 0.35]} />
          <meshStandardMaterial color="#ff1a1a" emissive="#ff0a0a" emissiveIntensity={isOn("lighting") ? 3 : 1.8} />
        </mesh>
      </group>

      {/* Front splitter */}
      {c.splitter && (
        <mesh position={[d.L / 2 + 0.02, bottom + 0.01, 0]} castShadow {...handlers("splitter")}>
          <boxGeometry args={[0.22, 0.025, d.W - 0.1]} />
          <meshStandardMaterial color={trim} roughness={0.35} metalness={0.4} {...glow("splitter")} />
        </mesh>
      )}
      {/* Rear diffuser */}
      {c.diffuser && (
        <group position={[-d.L / 2 + 0.05, bottom + 0.02, 0]} {...handlers("diffuser")}>
          <mesh rotation={[0, 0, 0.18]}>
            <boxGeometry args={[0.35, 0.02, d.W - 0.5]} />
            <meshStandardMaterial color={trim} roughness={0.4} {...glow("diffuser")} />
          </mesh>
          {[-0.45, -0.15, 0.15, 0.45].map((z) => (
            <mesh key={z} position={[-0.05, 0.05, z]}>
              <boxGeometry args={[0.3, 0.1, 0.015]} />
              <meshStandardMaterial color={trim} {...glow("diffuser")} />
            </mesh>
          ))}
        </group>
      )}
      {/* Side skirts */}
      {c.sideSkirts && (
        <group {...handlers("body_kit")}>
          {[1, -1].map((s) => (
            <mesh key={s} position={[0, bottom + 0.02, s * ((d.W - 0.12) / 2 + 0.05)]}>
              <boxGeometry args={[d.WB - 2 * (d.r + 0.08), 0.06, 0.06]} />
              <meshStandardMaterial color={trim} roughness={0.35} metalness={0.3} {...glow("body_kit")} />
            </mesh>
          ))}
        </group>
      )}

      {/* Spoilers */}
      <Spoiler kind={c.spoiler} d={d} paint={paint} glowProps={glow("spoiler")} handlers={handlers("spoiler")} />

      {/* Exhaust */}
      <Exhaust kind={c.exhaust} finish={c.exhaustFinish} d={d} bottom={bottom} glowProps={glow("exhaust")} handlers={handlers("exhaust")} />

      {/* Wheels */}
      {[d.WB / 2, -d.WB / 2].flatMap((x) =>
        [1, -1].map((side) => (
          <Wheel key={`${x}${side}`} x={x} side={side} d={d} c={c} highlight={isOn("wheels")} brakeHi={isOn("brakes")} accent={accent}
            wheelHandlers={handlers("wheels")} brakeHandlers={handlers("brakes")} />
        )),
      )}

      {/* Underbody / suspension click target */}
      <mesh position={[0, bottom - 0.02, 0]} {...handlers("suspension")}>
        <boxGeometry args={[d.WB - 0.5, 0.04, d.W - 0.4]} />
        <meshStandardMaterial color={isOn("suspension") ? accent : "#08090a"} roughness={1} />
      </mesh>
    </group>
  );
}

type GlowProps = { emissive: THREE.Color; emissiveIntensity: number };
type Handlers = {
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
};

function Spoiler({ kind, d, paint, glowProps, handlers }: { kind: ModelConfig["spoiler"]; d: Dims; paint: THREE.Material; glowProps: GlowProps; handlers: Handlers }) {
  if (!kind || kind === "none") return null;
  const rearX = -d.L / 2 + 0.2;
  const deckY = d.bed ? d.roof : d.hatch ? d.roof : d.tail;
  const xPos = d.hatch || d.bed ? d.cabinRear + d.rearRake - 0.05 : rearX;
  const mat = <meshStandardMaterial color="#0e0f11" roughness={0.3} metalness={0.5} {...glowProps} />;
  if (kind === "lip" || kind === "ducktail") {
    const h = kind === "lip" ? 0.035 : 0.08;
    return (
      <mesh position={[xPos - 0.02, deckY + h / 2 + 0.03, 0]} rotation={[0, 0, kind === "ducktail" ? -0.35 : -0.1]} castShadow {...handlers}>
        <boxGeometry args={[0.22, h, d.W - 0.35]} />
        {kind === "ducktail" ? <primitive object={paint} attach="material" /> : mat}
      </mesh>
    );
  }
  const height = kind === "gt_wing" ? 0.32 : 0.18;
  const chord = kind === "gt_wing" ? 0.34 : 0.24;
  return (
    <group position={[xPos, deckY + 0.03, 0]} {...handlers}>
      {[0.42, -0.42].map((z) => (
        <mesh key={z} position={[0, height / 2, z]} castShadow>
          <boxGeometry args={[0.07, height, 0.025]} />
          {mat}
        </mesh>
      ))}
      <mesh position={[-0.03, height + 0.02, 0]} rotation={[0, 0, 0.12]} castShadow>
        <boxGeometry args={[chord, 0.03, d.W - (kind === "gt_wing" ? 0.05 : 0.3)]} />
        {mat}
      </mesh>
      {kind === "gt_wing" &&
        [1, -1].map((s) => (
          <mesh key={s} position={[-0.03, height + 0.02, s * (d.W / 2 - 0.02)]}>
            <boxGeometry args={[chord + 0.06, 0.14, 0.012]} />
            {mat}
          </mesh>
        ))}
    </group>
  );
}

function Exhaust({ kind, finish, d, bottom, glowProps, handlers }: { kind: ModelConfig["exhaust"]; finish: ModelConfig["exhaustFinish"]; d: Dims; bottom: number; glowProps: GlowProps; handlers: Handlers }) {
  const zs = kind === "single" ? [0.45] : kind === "quad" ? [-0.6, -0.42, 0.42, 0.6] : kind === "center" ? [-0.07, 0.07] : [-0.5, 0.5];
  const color = finish === "black" ? "#151515" : finish === "titanium" ? "#6a5ea8" : "#d9dde2";
  return (
    <group {...handlers}>
      {zs.map((z) => (
        <mesh key={z} position={[-d.L / 2 - 0.02, bottom + 0.1, z]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.048, 0.044, 0.14, 24, 1, true]} />
          <meshStandardMaterial color={color} metalness={0.95} roughness={finish === "black" ? 0.5 : 0.18} side={THREE.DoubleSide} {...glowProps} />
        </mesh>
      ))}
    </group>
  );
}

function Wheel({ x, side, d, c, highlight, brakeHi, accent, wheelHandlers, brakeHandlers }: {
  x: number; side: number; d: Dims; c: typeof DEFAULT_CONFIG; highlight: boolean; brakeHi: boolean; accent: string; wheelHandlers: Handlers; brakeHandlers: Handlers;
}) {
  const z = side * (d.W / 2 - 0.1);
  const tireW = 0.24;
  const rimR = d.r * (0.55 + (c.wheelSize - 15) * 0.02);
  const spokes = c.wheelStyle === "five_spoke" ? 5 : c.wheelStyle === "multi_spoke" ? 10 : c.wheelStyle === "mesh" ? 16 : c.wheelStyle === "turbofan" ? 18 : 0;
  const spokeW = c.wheelStyle === "five_spoke" ? 0.07 : c.wheelStyle === "turbofan" ? 0.05 : 0.025;
  const rimMat = <meshStandardMaterial color={highlight ? accent : c.wheelColor} metalness={0.85} roughness={0.28} />;
  return (
    <group position={[x, d.r, z]}>
      <group {...wheelHandlers}>
        {/* tire */}
        {/* tread (open so the rim face is visible) + both sidewalls */}
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[d.r, d.r, tireW, 48, 1, true]} />
          <meshStandardMaterial color="#111214" roughness={0.92} side={THREE.DoubleSide} />
        </mesh>
        {[1, -1].map((f) => (
          <mesh key={f} position={[0, 0, f * side * (tireW / 2)]} rotation={[0, f * side > 0 ? 0 : Math.PI, 0]}>
            <ringGeometry args={[rimR + 0.01, d.r, 48]} />
            <meshStandardMaterial color="#151618" roughness={0.88} side={THREE.DoubleSide} />
          </mesh>
        ))}
        <mesh position={[0, 0, side * (tireW / 2 + 0.002)]}>
          <torusGeometry args={[d.r - 0.03, 0.028, 12, 48]} />
          <meshStandardMaterial color="#17181a" roughness={0.9} />
        </mesh>
        {/* dark backplate so you can't see through the wheel */}
        <mesh position={[0, 0, -side * (tireW / 2 - 0.01)]}>
          <circleGeometry args={[rimR + 0.01, 40]} />
          <meshStandardMaterial color="#060607" roughness={1} side={THREE.DoubleSide} />
        </mesh>
        {/* rim barrel + face */}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, side * 0.04]}>
          <cylinderGeometry args={[rimR, rimR, tireW * 0.8, 40, 1, true]} />
          {rimMat}
        </mesh>
        <mesh position={[0, 0, side * (tireW / 2 - 0.005)]}>
          <torusGeometry args={[rimR, 0.018, 8, 48]} />
          {rimMat}
        </mesh>
        {c.wheelStyle === "dish" ? (
          <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, side * (tireW / 2 - 0.03)]}>
            <cylinderGeometry args={[rimR * 0.96, rimR * 0.96, 0.02, 40]} />
            {rimMat}
          </mesh>
        ) : (
          Array.from({ length: spokes }).map((_, i) => {
            const a = (i / spokes) * Math.PI * 2;
            const cross = c.wheelStyle === "mesh" ? (i % 2 ? 0.35 : -0.35) : c.wheelStyle === "turbofan" ? 0.6 : 0;
            return (
              <mesh key={i} position={[Math.cos(a) * rimR * 0.5, Math.sin(a) * rimR * 0.5, side * (tireW / 2 - 0.025)]} rotation={[0, 0, a + cross]}>
                <boxGeometry args={[rimR * 0.95, spokeW, 0.025]} />
                {rimMat}
              </mesh>
            );
          })
        )}
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, side * (tireW / 2 - 0.02)]}>
          <cylinderGeometry args={[rimR * 0.16, rimR * 0.16, 0.04, 20]} />
          {rimMat}
        </mesh>
      </group>
      {/* brake disc + caliper */}
      <group {...brakeHandlers}>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, side * 0.0]}>
          <cylinderGeometry args={[rimR * 0.82, rimR * 0.82, 0.03, 32]} />
          <meshStandardMaterial color="#5b5e63" metalness={0.9} roughness={0.4} />
        </mesh>
        <mesh position={[x > 0 ? -rimR * 0.62 : rimR * 0.62, rimR * 0.35, side * 0.03]} rotation={[0, 0, x > 0 ? -0.5 : 0.5]}>
          <boxGeometry args={[0.07, rimR * 0.7, 0.07]} />
          <meshStandardMaterial color={brakeHi ? accent : c.caliperColor} roughness={0.35} emissive={brakeHi ? accent : "#000"} emissiveIntensity={brakeHi ? 0.5 : 0} />
        </mesh>
      </group>
    </group>
  );
}
