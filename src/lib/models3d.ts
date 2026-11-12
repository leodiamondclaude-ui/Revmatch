import "server-only";
import { createServiceClient } from "./supabase/server";

/** Sketchfab Data API v3 — https://docs.sketchfab.com/data-api/v3/ */
export async function sketchfabSearch(q: string) {
  const token = process.env.SKETCHFAB_API_TOKEN;
  if (!token) return { configured: false as const, results: [] };
  const url = new URL("https://api.sketchfab.com/v3/search");
  url.searchParams.set("type", "models");
  url.searchParams.set("q", q);
  url.searchParams.set("downloadable", "true");
  url.searchParams.set("categories", "cars-vehicles");
  url.searchParams.set("count", "12");
  const res = await fetch(url, { headers: { Authorization: `Token ${token}` }, next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Sketchfab search failed (${res.status})`);
  const json = (await res.json()) as { results: SketchfabModel[] };
  return {
    configured: true as const,
    results: json.results.map((m) => ({
      uid: m.uid,
      name: m.name,
      author: m.user?.displayName ?? m.user?.username ?? "unknown",
      license: m.license?.label ?? m.license?.slug ?? "see Sketchfab",
      faces: m.faceCount,
      thumbnail: m.thumbnails?.images?.sort((a, b) => Math.abs(a.width - 480) - Math.abs(b.width - 480))[0]?.url ?? null,
      url: m.viewerUrl,
    })),
  };
}

interface SketchfabModel {
  uid: string; name: string; viewerUrl: string; faceCount: number;
  user?: { username: string; displayName: string };
  license?: { label?: string; slug?: string };
  thumbnails?: { images: { url: string; width: number }[] };
}

export async function sketchfabDownloadGlb(uid: string) {
  const token = process.env.SKETCHFAB_API_TOKEN!;
  const [dl, meta] = await Promise.all([
    fetch(`https://api.sketchfab.com/v3/models/${uid}/download`, { headers: { Authorization: `Token ${token}` } }),
    fetch(`https://api.sketchfab.com/v3/models/${uid}`, { headers: { Authorization: `Token ${token}` } }),
  ]);
  if (!dl.ok) throw new Error(`Sketchfab download not available (${dl.status}). The model may not be downloadable with this token.`);
  const links = (await dl.json()) as { glb?: { url: string; size: number } };
  if (!links.glb) throw new Error("This model has no GLB download. Choose another model.");
  if (links.glb.size > 45_000_000) throw new Error("Model is too large (over 45 MB).");
  const m = meta.ok ? ((await meta.json()) as SketchfabModel) : null;
  const file = await fetch(links.glb.url);
  if (!file.ok) throw new Error("Failed to fetch model file.");
  const attribution = m ? `"${m.name}" by ${m.user?.displayName ?? m.user?.username} on Sketchfab (${m.license?.label ?? "license on Sketchfab"}) — ${m.viewerUrl}` : `Sketchfab model ${uid}`;
  return { bytes: new Uint8Array(await file.arrayBuffer()), attribution };
}

/** Meshy multi-image-to-3D — https://docs.meshy.ai/api/multi-image-to-3d */
const MESHY = "https://api.meshy.ai/openapi/v1/multi-image-to-3d";

export async function meshyCreate(imageUrls: string[]) {
  const res = await fetch(MESHY, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}`, "Content-Type": "application/json" },
    // Highest-quality settings per https://docs.meshy.ai/api/multi-image-to-3d (checked Nov 2026):
    // Meshy 7.1 with the 2K "Ultra" geometry pass, PBR textures, no remesh (remeshing lowers fidelity),
    // GLB only (shorter task). The first image is treated as the front view.
    body: JSON.stringify({
      image_urls: imageUrls.slice(0, 4),
      ai_model: "latest",
      geometry_resolution: "2k",
      should_texture: true,
      enable_pbr: true,
      should_remesh: false,
      target_formats: ["glb"],
    }),
  });
  if (!res.ok) throw new Error(`Meshy rejected the job (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { result: string };
  return json.result;
}

export async function meshyStatus(taskId: string) {
  const res = await fetch(`${MESHY}/${taskId}`, { headers: { Authorization: `Bearer ${process.env.MESHY_API_KEY}` }, cache: "no-store" });
  if (!res.ok) throw new Error(`Meshy status failed (${res.status})`);
  return (await res.json()) as { status: "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED"; progress: number; model_urls?: { glb?: string }; task_error?: { message?: string } };
}

/** Stores a GLB in the owner's folder of the `vehicle-models` bucket and returns its public URL. */
export async function storeModel(ownerId: string, vehicleId: string, bytes: Uint8Array) {
  const admin = createServiceClient();
  if (!admin) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to store imported models.");
  const path = `${ownerId}/${vehicleId}/${Date.now()}.glb`;
  const { error } = await admin.storage.from("vehicle-models").upload(path, bytes, { contentType: "model/gltf-binary", upsert: true });
  if (error) throw error;
  return admin.storage.from("vehicle-models").getPublicUrl(path).data.publicUrl;
}
