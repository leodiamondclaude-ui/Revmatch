"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareImage, uid } from "@/lib/image";
import type { Vehicle } from "@/lib/types";

export function Composer({ userId, vehicles }: { userId: string; vehicles: Vehicle[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vis, setVis] = useState<"public" | "followers" | "friends" | "private">("public");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !file) return;
    setBusy(true); setErr(null);
    const supabase = createClient();
    try {
      let image_url: string | null = null;
      if (file) {
        const { blob } = await prepareImage(file, 2000);
        const path = `${userId}/posts/${uid()}.jpg`;
        const up = await supabase.storage.from("vehicle-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
        image_url = supabase.storage.from("vehicle-photos").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("posts").insert({ author_id: userId, vehicle_id: vehicleId || null, body: body.trim() || null, image_url, kind: file ? "photo" : "update", visibility: vis });
      if (error) throw error;
      setBody(""); setFile(null);
      router.refresh();
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="panel p-4">
      <textarea className="input min-h-20 resize-none !border-transparent !bg-transparent !px-1 text-base" placeholder="What's new with the build?" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
      {file && <div className="mb-2 flex items-center gap-2 text-xs text-muted"><span className="truncate">{file.name}</span><button type="button" onClick={() => setFile(null)} aria-label="Remove image"><X size={14} /></button></div>}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <label className="btn-quiet cursor-pointer !px-2" aria-label="Add photo"><ImagePlus size={18} /><input type="file" accept="image/*" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label>
        <select className="input !w-auto !py-1.5 text-xs" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
          <option value="">No vehicle tag</option>
          {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nickname || `${v.make} ${v.model}`}</option>)}
        </select>
        <select className="input !w-auto !py-1.5 text-xs" value={vis} onChange={(e) => setVis(e.target.value as typeof vis)}>
          <option value="public">Public</option><option value="followers">Followers &amp; friends</option><option value="friends">Friends</option><option value="private">Only me</option>
        </select>
        {err && <span className="text-xs text-bad">{err}</span>}
        <button className="btn-primary ml-auto !py-2" disabled={busy || (!body.trim() && !file)}>{busy && <Loader2 size={14} className="animate-spin" />} Post</button>
      </div>
    </form>
  );
}
