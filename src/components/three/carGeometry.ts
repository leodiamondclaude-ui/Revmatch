import * as THREE from "three";
import type { BodyStyle } from "@/lib/types";

export interface Dims {
  L: number; W: number; WB: number; r: number; // length, width, wheelbase, wheel radius
  belt: number; nose: number; tail: number; roof: number;
  cabinFront: number; cabinRear: number; wsRake: number; rearRake: number;
  bed?: boolean; hatch?: boolean;
}

export function dimsFor(style: BodyStyle, wheelSizeIn = 18): Dims {
  const r = 0.3 + (wheelSizeIn - 15) * 0.012;
  const base: Record<BodyStyle, Omit<Dims, "r">> = {
    coupe: { L: 4.45, W: 1.86, WB: 2.48, belt: 0.86, nose: 0.6, tail: 0.88, roof: 1.27, cabinFront: 0.55, cabinRear: -0.95, wsRake: 0.75, rearRake: 0.85 },
    sedan: { L: 4.8, W: 1.85, WB: 2.85, belt: 0.92, nose: 0.66, tail: 0.95, roof: 1.43, cabinFront: 0.75, cabinRear: -1.25, wsRake: 0.65, rearRake: 0.6 },
    hatch: { L: 4.2, W: 1.8, WB: 2.62, belt: 0.92, nose: 0.66, tail: 0.95, roof: 1.45, cabinFront: 0.85, cabinRear: -1.95, wsRake: 0.62, rearRake: 0.15, hatch: true },
    wagon: { L: 4.85, W: 1.85, WB: 2.85, belt: 0.92, nose: 0.66, tail: 0.95, roof: 1.45, cabinFront: 0.8, cabinRear: -2.3, wsRake: 0.65, rearRake: 0.12, hatch: true },
    suv: { L: 4.75, W: 1.95, WB: 2.9, belt: 1.12, nose: 0.88, tail: 1.12, roof: 1.75, cabinFront: 0.95, cabinRear: -2.2, wsRake: 0.55, rearRake: 0.12, hatch: true },
    truck: { L: 5.6, W: 2.0, WB: 3.5, belt: 1.18, nose: 0.98, tail: 1.15, roof: 1.9, cabinFront: 1.05, cabinRear: -0.6, wsRake: 0.5, rearRake: 0.05, bed: true },
  };
  const extra = style === "suv" || style === "truck" ? 0.06 : 0;
  return { ...base[style], r: r + extra };
}

/** Side profile of the lower body with wheel-arch cut-outs. Front of the car is +X. */
export function bodyShape(d: Dims, bottom: number) {
  const { L, WB, r } = d;
  const xf = WB / 2, xr = -WB / 2;
  const A = r + 0.06; // arch radius
  const s = new THREE.Shape();
  s.moveTo(-L / 2 + 0.12, bottom);
  s.lineTo(xr - A, bottom); s.lineTo(xr - A, r); s.absarc(xr, r, A, Math.PI, 0, true); s.lineTo(xr + A, bottom);
  s.lineTo(xf - A, bottom); s.lineTo(xf - A, r); s.absarc(xf, r, A, Math.PI, 0, true); s.lineTo(xf + A, bottom);
  s.lineTo(L / 2 - 0.12, bottom);
  s.quadraticCurveTo(L / 2, bottom, L / 2, bottom + 0.16);
  s.lineTo(L / 2, d.nose - 0.05);
  s.quadraticCurveTo(L / 2 - 0.02, d.nose + 0.04, L / 2 - 0.35, d.nose + 0.08);
  s.quadraticCurveTo((L / 2 + d.cabinFront) / 2, d.belt - 0.02, d.cabinFront, d.belt);
  s.lineTo(d.cabinRear, d.belt);
  if (d.bed) {
    s.lineTo(-L / 2 + 0.05, d.belt - 0.02);
    s.lineTo(-L / 2, d.belt - 0.08);
  } else if (d.hatch) {
    s.lineTo(-L / 2 + 0.08, d.tail);
    s.quadraticCurveTo(-L / 2, d.tail, -L / 2, d.tail - 0.12);
  } else {
    s.quadraticCurveTo((d.cabinRear - L / 2) / 2, d.belt + 0.01, -L / 2 + 0.22, d.tail);
    s.quadraticCurveTo(-L / 2, d.tail, -L / 2, d.tail - 0.14);
  }
  s.lineTo(-L / 2, bottom + 0.16);
  s.quadraticCurveTo(-L / 2, bottom, -L / 2 + 0.12, bottom);
  return s;
}

export function cabinShape(d: Dims) {
  const s = new THREE.Shape();
  const top = d.roof;
  const fTop = d.cabinFront - d.wsRake;
  const rTop = d.cabinRear + d.rearRake;
  s.moveTo(d.cabinFront, d.belt - 0.02);
  s.quadraticCurveTo(d.cabinFront - d.wsRake * 0.55, top - 0.02, fTop, top);
  s.lineTo(rTop, top);
  s.quadraticCurveTo(d.cabinRear + d.rearRake * 0.2, top - 0.03, d.cabinRear, d.belt - 0.02);
  s.lineTo(d.cabinFront, d.belt - 0.02);
  return s;
}

export function extrude(shape: THREE.Shape, depth: number, bevel = 0.06) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 28,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}
