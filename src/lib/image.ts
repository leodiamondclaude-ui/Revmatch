"use client";

/** Downscale an image file in the browser. Returns a JPEG blob plus base64 (no data: prefix). */
export async function prepareImage(file: File, maxEdge = 1568, quality = 0.86) {
  const bmp = await createImageBitmap(file).catch(async () => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    return img;
  });
  const w = "width" in bmp ? bmp.width : 0, h = "height" in bmp ? bmp.height : 0;
  const scale = Math.min(1, maxEdge / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")!.drawImage(bmp as CanvasImageSource, 0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", quality));
  const base64 = await new Promise<string>((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.readAsDataURL(blob);
  });
  return { blob, base64, width: canvas.width, height: canvas.height };
}

export function uid() {
  return crypto.randomUUID();
}
