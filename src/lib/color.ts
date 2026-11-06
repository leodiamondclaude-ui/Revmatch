/** Color helpers used to derive a UI accent from a vehicle's paint. */

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [154, 160, 166];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number) {
  return "#" + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * Turn a paint color into an accent that reads on a near-black UI.
 * Saturated paints keep their hue and get lifted into a legible lightness band.
 * Achromatic paints (black, white, silver, grey) get a cool "titanium" accent
 * instead of an invisible grey.
 */
export function accentFromPaint(hex: string | null | undefined): string {
  if (!hex) return "#e10600";
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  if (s < 0.14 || l < 0.06 || l > 0.96) {
    // achromatic paint
    return l > 0.55 ? "#c9d6e3" : "#8fb3d9";
  }
  const sat = Math.max(0.62, Math.min(0.95, s * 1.1));
  const light = Math.max(0.5, Math.min(0.64, l < 0.5 ? l + 0.2 : l));
  return rgbToHex(...hslToRgb(h, sat, light));
}

export function accentVars(accent: string): Record<string, string> {
  const [r, g, b] = hexToRgb(accent);
  const [h, s] = rgbToHsl(r, g, b);
  const soft = rgbToHex(...hslToRgb(h, Math.min(s, 0.6), 0.18));
  const strong = rgbToHex(...hslToRgb(h, Math.min(1, s + 0.05), 0.7));
  // Tailwind's --color-* tokens resolve at :root, so set them here too for nested scopes.
  return {
    "--accent": accent,
    "--accent-rgb": `${r} ${g} ${b}`,
    "--accent-soft": soft,
    "--accent-strong": strong,
    "--color-accent": accent,
    "--color-accent-soft": soft,
    "--color-accent-strong": strong,
  };
}

export const PAINT_SWATCHES: { name: string; hex: string }[] = [
  { name: "Guards Red", hex: "#c8102e" },
  { name: "Rosso Corsa", hex: "#d40000" },
  { name: "Papaya", hex: "#ff7a00" },
  { name: "Racing Yellow", hex: "#f2c500" },
  { name: "Acid Green", hex: "#9be000" },
  { name: "British Racing Green", hex: "#0b3d2c" },
  { name: "Miami Blue", hex: "#00a3c7" },
  { name: "Estoril Blue", hex: "#1f4fa3" },
  { name: "Nardo Grey", hex: "#6f7378" },
  { name: "GT Silver", hex: "#b8bcc0" },
  { name: "Alpine White", hex: "#f2f2f0" },
  { name: "Jet Black", hex: "#0c0c0e" },
  { name: "Ultraviolet", hex: "#5b2a86" },
  { name: "Champagne", hex: "#c9b28a" },
];
