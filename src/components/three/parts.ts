import type { ModCategory, ModelConfig } from "@/lib/types";

export type PartId =
  | "wrap" | "wheels" | "brakes" | "spoiler" | "splitter" | "diffuser" | "body_kit" | "exhaust" | "tint" | "suspension" | "lighting";

export const VIEWS = {
  front3q: { label: "Front ¾", pos: [5.2, 1.7, 4.2] },
  rear3q: { label: "Rear ¾", pos: [-5.2, 1.7, 4.2] },
  side: { label: "Profile", pos: [0, 1.1, 7.2] },
  front: { label: "Front", pos: [7, 1.2, 0] },
  rear: { label: "Rear", pos: [-7, 1.2, 0] },
  top: { label: "Top", pos: [0.01, 8.5, 0.01] },
} as const;
export type ViewId = keyof typeof VIEWS;

/** Maps a modification category to the clickable part that represents it. */
export const CATEGORY_PART: Partial<Record<ModCategory, PartId>> = {
  wheels: "wheels", brakes: "brakes", spoiler: "spoiler", splitter: "splitter", diffuser: "diffuser",
  body_kit: "body_kit", exhaust: "exhaust", tint: "tint", wrap: "wrap", suspension: "suspension", lighting: "lighting",
};
export const PART_LABEL: Record<string, string> = {
  wrap: "Paint & Wrap", wheels: "Wheels", brakes: "Brakes", spoiler: "Spoiler", splitter: "Splitter", diffuser: "Diffuser",
  body_kit: "Body Kit", exhaust: "Exhaust", tint: "Window Tint", suspension: "Suspension", lighting: "Lighting",
  engine_bay: "Engine Bay", interior: "Interior", drivetrain: "Drivetrain",
};


export const DEFAULT_CONFIG: Required<Omit<ModelConfig, "stripeColor" | "roofColor">> & Pick<ModelConfig, "stripeColor" | "roofColor"> = {
  paint: "#b8bcc0", finish: "metallic", wheelColor: "#2a2c30", wheelStyle: "five_spoke", wheelSize: 18,
  caliperColor: "#c8102e", rideHeight: 0, spoiler: "none", splitter: false, diffuser: false, sideSkirts: false,
  exhaust: "dual", exhaustFinish: "chrome", tint: 0.35, stripeColor: null, stripe: "none", roofColor: null,
};
