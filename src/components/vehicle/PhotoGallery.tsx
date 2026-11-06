"use client";
/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Star, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareImage, uid } from "@/lib/image";
import type { Modification, Vehicle, VehiclePhoto } from "@/lib/types";

const ANGLE: Record<string, string> = { front_3q: "Front ¾", rear_3q: "Rear ¾", side: "Profile", front: "Front", rear: "Rear", interior: "Interior", engine: "Engine bay", detail: "Detail", other: "" };

export function PhotoGallery({ photos, vehicle, mods, isOwner }: { photos: VehiclePhoto[]; vehicle: Vehicle; mods: Modification[]; isOwner: boolean }) {
  const router = useRouter();
  const [idx, setIdx] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const modName = (id: string | null) => mods.find((m) => m.id === id)?.name;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const supabase = createClient();
    for (const file of [...files]) {
      const { blob } = await prepareImage(file, 2400);
      const path = `${vehicle.owner_id}/${vehicle.id}/${uid()}.jpg`;
      const up = await supabase.storage.from("vehicle-photos").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) continue;
      const url = supabase.storage.from("vehicle-photos").getPublicUrl(path).data.publicUrl;
      await supabase.from("vehicle_photos").insert({ vehicle_id: vehicle.id, owner_id: vehicle.owner_id, storage_path: path, url, angle: "other" });
    }
    setBusy(false);
    router.refresh();
  }
  async function remove(p: VehiclePhoto) {
    if (!confirm("Delete this photo?")) return;
    const supabase = createClient();
    await supabase.storage.from("vehicle-photos").remove([p.storage_path]);
    await supabase.from("vehicle_photos").delete().eq("id", p.id);
    if (vehicle.cover_photo_url === p.url) await supabase.from("vehicles").update({ cover_photo_url: null }).eq("id", vehicle.id);
    setIdx(null);
    router.refresh();
  }
  async function makeCover(p: VehiclePhoto) {
    await createClient().from("vehicles").update({ cover_photo_url: p.url }).eq("id", vehicle.id);
    router.refresh();
  }

  const cur = idx != null ? photos[idx] : null;
  return (
    <div>
      <div className="columns-2 gap-3 sm:columns-3 [&>*]:mb-3">
        {isOwner && (
          <label className="panel flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 border-dashed text-sm text-muted hover:border-accent hover:text-ink">
            {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />} Add photos
            <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => upload(e.target.files)} />
          </label>
        )}
        {photos.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setIdx(i)} className="group relative block w-full overflow-hidden rounded-xl border border-line">
            <img src={p.url} alt={p.caption ?? ANGLE[p.angle] ?? ""} loading="lazy" className="w-full transition duration-500 group-hover:scale-105" />
            {(ANGLE[p.angle] || p.modification_id) && <span className="chip absolute bottom-2 left-2 bg-black/70">{modName(p.modification_id) ?? ANGLE[p.angle]}</span>}
          </button>
        ))}
      </div>
      {photos.length === 0 && !isOwner && <p className="text-sm text-muted">No photos yet.</p>}
      {cur && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95" onClick={() => setIdx(null)}>
          <img src={cur.url} alt="" className="max-h-[85dvh] max-w-[95vw] object-contain" onClick={(e) => e.stopPropagation()} />
          <button type="button" aria-label="Close" className="absolute right-4 top-4 btn-quiet" onClick={() => setIdx(null)}><X /></button>
          {photos.length > 1 && <>
            <button type="button" aria-label="Previous" className="absolute left-2 btn-quiet" onClick={(e) => { e.stopPropagation(); setIdx((idx! - 1 + photos.length) % photos.length); }}><ChevronLeft /></button>
            <button type="button" aria-label="Next" className="absolute right-2 btn-quiet" onClick={(e) => { e.stopPropagation(); setIdx((idx! + 1) % photos.length); }}><ChevronRight /></button>
          </>}
          {isOwner && (
            <div className="absolute bottom-6 flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="btn-ghost" onClick={() => makeCover(cur)}><Star size={16} /> Cover</button>
              <button type="button" className="btn-ghost !text-bad" onClick={() => remove(cur)}><Trash2 size={16} /> Delete</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
