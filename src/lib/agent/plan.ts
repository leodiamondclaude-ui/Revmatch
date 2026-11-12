import { z } from "zod";

/** Where a part attaches on the base car (resolved in the viewer against the car's real bodywork). */
export const ANCHORS = ["rear_deck", "front_lip", "rear_lower", "side_skirts", "wheels", "roof"] as const;
export type Anchor = (typeof ANCHORS)[number];

export const MaterialTarget = z.enum(["paint", "wheels", "calipers", "glass"]);
export const Finish = z.enum(["gloss", "metallic", "satin", "matte"]);
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const AssemblyPlanSchema = z.object({
  version: z.literal(1),
  base: z.object({
    uid: z.string(), name: z.string(), author: z.string(), license: z.string(), viewerUrl: z.string(), glbUrl: z.string(),
    /** Axis in the model's own coordinates that points out of the car's nose. */
    frontAxis: z.enum(["+x", "-x", "+z", "-z"]),
    mapping: z.object({
      paint: z.array(z.string()), glass: z.array(z.string()), calipers: z.array(z.string()),
      wheelNodes: z.array(z.string()), hide: z.array(z.string()),
    }),
    matchConfidence: z.enum(["low", "medium", "high"]),
    hasInterior: z.boolean(),
    notes: z.string(),
  }),
  parts: z.array(z.object({
    modId: z.string().nullable(), kind: z.string(), uid: z.string(), name: z.string(), author: z.string(), license: z.string(),
    viewerUrl: z.string(), glbUrl: z.string(), anchor: z.enum(ANCHORS),
    /** Rotation (degrees, XYZ) that turns the part so its width runs along Z, height along Y, front along +X. */
    rotationDeg: z.tuple([z.number(), z.number(), z.number()]),
    /** Part width as a fraction of the car's width (wheels: fraction of the original wheel's diameter). */
    sizeFraction: z.number().min(0.05).max(1.5),
    offset: z.tuple([z.number(), z.number(), z.number()]),
    replacesNodes: z.array(z.string()),
  })),
  materials: z.array(z.object({ target: MaterialTarget, color: hex, finish: Finish.nullable() })),
  summary: z.string(),
  warnings: z.array(z.string()),
  attribution: z.array(z.string()),
  createdAt: z.string(),
});
export type AssemblyPlan = z.infer<typeof AssemblyPlanSchema>;

/** Attribution line required by CC BY. */
export const credit = (name: string, author: string, license: string, url: string) => `"${name}" by ${author}, ${license}, via Sketchfab: ${url}`;
