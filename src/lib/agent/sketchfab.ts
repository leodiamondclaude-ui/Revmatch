/**
 * Sketchfab Data API v3 client used by the model agent.
 * Search works anonymously; model downloads need SKETCHFAB_API_TOKEN.
 */

/** Licences that allow commercial use AND modification (recolouring, adding parts). */
export const ALLOWED_LICENSES = new Set(["by", "cc0"]);
export const LICENSE_LABEL: Record<string, string> = { by: "CC Attribution", cc0: "CC0 Public Domain" };

export interface Candidate {
  uid: string;
  name: string;
  author: string;
  license: string; // slug
  licenseLabel: string;
  faces: number;
  thumbnail: string | null;
  viewerUrl: string;
  tags: string[];
  description: string;
  animated: boolean;
}

interface RawModel {
  uid: string; name: string; viewerUrl: string; faceCount: number; description?: string; animationCount?: number;
  user?: { username: string; displayName: string };
  license?: { slug?: string; label?: string } | null;
  tags?: { name: string }[];
  thumbnails?: { images: { url: string; width: number }[] };
}

const API = "https://api.sketchfab.com/v3";

function toCandidate(m: RawModel): Candidate {
  const slug = m.license?.slug ?? "";
  const thumbs = (m.thumbnails?.images ?? []).slice().sort((a, b) => Math.abs(a.width - 720) - Math.abs(b.width - 720));
  return {
    uid: m.uid,
    name: m.name,
    author: m.user?.displayName || m.user?.username || "unknown",
    license: slug,
    licenseLabel: m.license?.label ?? LICENSE_LABEL[slug] ?? slug,
    faces: m.faceCount ?? 0,
    thumbnail: thumbs[0]?.url ?? null,
    viewerUrl: m.viewerUrl ?? `https://sketchfab.com/3d-models/${m.uid}`,
    tags: (m.tags ?? []).map((t) => t.name),
    description: (m.description ?? "").slice(0, 1200),
    animated: (m.animationCount ?? 0) > 0,
  };
}

export function licenseAllowed(slug: string) {
  return ALLOWED_LICENSES.has(slug);
}

export interface SketchfabClient {
  search(query: string, opts?: { maxFaces?: number; count?: number; vehiclesOnly?: boolean }): Promise<Candidate[]>;
  info(uid: string): Promise<Candidate>;
  download(uid: string, maxBytes: number): Promise<Uint8Array>;
}

export function createSketchfabClient(token = process.env.SKETCHFAB_API_TOKEN, fetchImpl: typeof fetch = fetch): SketchfabClient {
  const headers: Record<string, string> = token ? { Authorization: `Token ${token}` } : {};
  return {
    async search(query, opts = {}) {
      const url = new URL(`${API}/search`);
      url.searchParams.set("type", "models");
      url.searchParams.set("q", query);
      url.searchParams.set("downloadable", "true");
      url.searchParams.set("count", String(Math.min(24, opts.count ?? 24)));
      if (opts.vehiclesOnly) url.searchParams.set("categories", "cars-vehicles");
      if (opts.maxFaces) url.searchParams.set("max_face_count", String(opts.maxFaces));
      const res = await fetchImpl(url, { headers });
      if (!res.ok) throw new Error(`Sketchfab search failed (${res.status})`);
      const json = (await res.json()) as { results: RawModel[] };
      // Licence filter is enforced here, not left to the model.
      return json.results.map(toCandidate).filter((c) => licenseAllowed(c.license));
    },
    async info(uid) {
      const res = await fetchImpl(`${API}/models/${encodeURIComponent(uid)}`, { headers });
      if (!res.ok) throw new Error(`Sketchfab model lookup failed (${res.status})`);
      return toCandidate((await res.json()) as RawModel);
    },
    async download(uid, maxBytes) {
      if (!token) throw new Error("SKETCHFAB_API_TOKEN is not set; model downloads need a Sketchfab API token.");
      const res = await fetchImpl(`${API}/models/${encodeURIComponent(uid)}/download`, { headers });
      if (res.status === 401) throw new Error("Sketchfab rejected the API token.");
      if (!res.ok) throw new Error(`Sketchfab download unavailable (${res.status}).`);
      const links = (await res.json()) as { glb?: { url: string; size: number } };
      if (!links.glb) throw new Error("This model has no GLB download.");
      if (links.glb.size > maxBytes) throw new Error(`Model is ${(links.glb.size / 1e6).toFixed(0)} MB, over the ${(maxBytes / 1e6).toFixed(0)} MB limit.`);
      const file = await fetchImpl(links.glb.url);
      if (!file.ok) throw new Error(`Model file download failed (${file.status}).`);
      return new Uint8Array(await file.arrayBuffer());
    },
  };
}
