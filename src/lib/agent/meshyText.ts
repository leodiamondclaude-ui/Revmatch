/**
 * Meshy Text to 3D (two steps: an untextured "preview" mesh, then a "refine" that textures it).
 * Request fields checked against https://docs.meshy.ai/en/api/text-to-3d in November 2026:
 * POST /openapi/v2/text-to-3d with mode "preview" | "refine"; prompt and texture_prompt up to 800 characters;
 * geometry_resolution "2k" needs meshy-7.1 / latest; texture_resolution "4k" on refine; GET /openapi/v2/text-to-3d/:id.
 */

const API = "https://api.meshy.ai/openapi/v2/text-to-3d";

export type MeshyStatus = "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "CANCELED";
export interface MeshyTask {
  id: string;
  status: MeshyStatus;
  progress: number;
  model_urls?: { glb?: string };
  thumbnail_url?: string;
  task_error?: { message?: string } | null;
}

export interface MeshyTextClient {
  preview(prompt: string): Promise<string>;
  refine(previewTaskId: string, texturePrompt: string): Promise<string>;
  get(taskId: string): Promise<MeshyTask>;
  fetchFile(url: string, maxBytes: number): Promise<Uint8Array>;
}

export function createMeshyTextClient(apiKey = process.env.MESHY_API_KEY, fetchImpl: typeof fetch = fetch): MeshyTextClient {
  const auth = () => {
    if (!apiKey) throw new Error("MESHY_API_KEY is not set; AI generation is unavailable.");
    return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
  };
  const create = async (body: object) => {
    const res = await fetchImpl(API, { method: "POST", headers: auth(), body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Meshy rejected the task (${res.status}): ${(await res.text()).slice(0, 200)}`);
    return ((await res.json()) as { result: string }).result;
  };
  return {
    // Highest-fidelity geometry: Meshy 7.1 Ultra 2K pass, no remesh, GLB only.
    preview: (prompt) => create({ mode: "preview", prompt: prompt.slice(0, 800), ai_model: "latest", geometry_resolution: "2k", should_remesh: false, target_formats: ["glb"] }),
    refine: (previewTaskId, texturePrompt) => create({ mode: "refine", preview_task_id: previewTaskId, enable_pbr: true, texture_resolution: "4k", texture_prompt: texturePrompt.slice(0, 800), target_formats: ["glb"] }),
    async get(taskId) {
      const res = await fetchImpl(`${API}/${encodeURIComponent(taskId)}`, { headers: auth() });
      if (!res.ok) throw new Error(`Meshy status failed (${res.status})`);
      return (await res.json()) as MeshyTask;
    },
    async fetchFile(url, maxBytes) {
      const res = await fetchImpl(url);
      if (!res.ok) throw new Error(`Generated model download failed (${res.status})`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > maxBytes) throw new Error(`Generated model is over ${(maxBytes / 1e6).toFixed(0)} MB.`);
      return bytes;
    },
  };
}

/** Poll a task until it finishes. Throws on failure or timeout. */
export async function waitForTask(client: MeshyTextClient, taskId: string, opts: { timeoutMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void>; onProgress?: (p: number) => void } = {}) {
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const deadline = Date.now() + (opts.timeoutMs ?? 15 * 60_000);
  for (;;) {
    const t = await client.get(taskId);
    if (t.status === "SUCCEEDED") return t;
    if (t.status === "FAILED" || t.status === "CANCELED") throw new Error(`Meshy task ${t.status.toLowerCase()}: ${t.task_error?.message ?? "no reason given"}`);
    opts.onProgress?.(t.progress ?? 0);
    if (Date.now() > deadline) throw new Error("Meshy task timed out.");
    await sleep(opts.pollMs ?? 10_000);
  }
}
