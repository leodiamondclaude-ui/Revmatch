"use client";
import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareImage, uid } from "@/lib/image";
import { MOD_CATEGORIES, type BodyStyle, type ModCategory, type ModelConfig, type Modification, type Vehicle } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { ModelConfigurator } from "@/components/garage/ModelConfigurator";

export function ModEditor({ open, onClose, vehicle, mod, defaultCategory, onSaved }: {
  open: boolean; onClose: () => void; vehicle: Vehicle; mod?: Modification | null; defaultCategory?: ModCategory; onSaved: () => void;
}) {
  const [f, setF] = useState(() => ({
    category: (mod?.category ?? defaultCategory ?? "wheels") as ModCategory,
    name: mod?.name ?? "", brand: mod?.brand ?? "", product: mod?.product ?? "", installed_on: mod?.installed_on ?? "",
    cost: mod?.cost?.toString() ?? "", show_cost: mod?.show_cost ?? false, description: mod?.description ?? "",
    hp_gain: mod?.hp_gain?.toString() ?? "", torque_gain: mod?.torque_gain?.toString() ?? "", performance_notes: mod?.performance_notes ?? "",
  }));
  const [files, setFiles] = useState<File[]>([]);
  const [apply3d, setApply3d] = useState(false);
  const [config, setConfig] = useState<ModelConfig>(vehicle.model_config ?? {});
  const [bodyStyle, setBodyStyle] = useState<BodyStyle>(vehicle.body_style);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const visual = MOD_CATEGORIES.find((c) => c.id === f.category)?.visual;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const supabase = createClient();
    try {
      const row = {
        vehicle_id: vehicle.id, owner_id: vehicle.owner_id, category: f.category, name: f.name.trim(),
        brand: f.brand || null, product: f.product || null, installed_on: f.installed_on || null,
        cost: f.cost ? Number(f.cost) : null, show_cost: f.show_cost, description: f.description || null,
        hp_gain: f.hp_gain ? Number(f.hp_gain) : null, torque_gain: f.torque_gain ? Number(f.torque_gain) : null,
        performance_notes: f.performance_notes || null,
      };
      const { data: saved, error } = mod
        ? await supabase.from("modifications").update(row).eq("id", mod.id).select("id").single()
        : await supabase.from("modifications").insert(row).select("id").single();
      if (error) throw error;
      let firstPhoto: string | null = null;
      for (const file of files) {
        const { blob } = await prepareImage(file, 2000);
        const path = `${vehicle.owner_id}/${vehicle.id}/mods/${uid()}.jpg`;
        const up = await supabase.storage.from("vehicle-photos").upload(path, blob, { contentType: "image/jpeg" });
        if (up.error) throw up.error;
        const url = supabase.storage.from("vehicle-photos").getPublicUrl(path).data.publicUrl;
        firstPhoto ??= url;
        await supabase.from("vehicle_photos").insert({ vehicle_id: vehicle.id, owner_id: vehicle.owner_id, modification_id: saved.id, storage_path: path, url, angle: "detail" });
      }
      if (apply3d) {
        await supabase.from("vehicles").update({ model_config: config, body_style: bodyStyle, exterior_color_hex: config.paint ?? vehicle.exterior_color_hex }).eq("id", vehicle.id);
      }
      if (!mod && vehicle.visibility !== "private") {
        await supabase.from("posts").insert({
          author_id: vehicle.owner_id, vehicle_id: vehicle.id, kind: "new_mod", ref_id: saved.id, image_url: firstPhoto,
          visibility: vehicle.visibility === "friends" ? "friends" : "public",
          body: `New mod: ${[f.brand, f.name].filter(Boolean).join(" ")}`,
          meta: { category: f.category, hp_gain: row.hp_gain },
        });
      }
      onSaved();
      onClose();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!mod || !confirm(`Remove "${mod.name}"? Its photos stay in the gallery.`)) return;
    setBusy(true);
    const { error } = await createClient().from("modifications").delete().eq("id", mod.id);
    setBusy(false);
    if (error) setErr(error.message); else { onSaved(); onClose(); }
  }

  return (
    <Modal open={open} onClose={onClose} title={mod ? "Edit modification" : "Add modification"} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="label">Category</span>
            <select className="input" value={f.category} onChange={set("category")}>{MOD_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          </label>
          <label className="space-y-1.5"><span className="label">Name *</span><input className="input" required value={f.name} onChange={set("name")} placeholder="Cat-back exhaust" /></label>
          <label className="space-y-1.5"><span className="label">Brand</span><input className="input" value={f.brand} onChange={set("brand")} placeholder="Akrapovič" /></label>
          <label className="space-y-1.5"><span className="label">Product / model</span><input className="input" value={f.product} onChange={set("product")} placeholder="Slip-On Line (Titanium)" /></label>
          <label className="space-y-1.5"><span className="label">Installed</span><input type="date" className="input" value={f.installed_on} onChange={set("installed_on")} /></label>
          <label className="space-y-1.5"><span className="label">Cost (optional)</span>
            <div className="flex items-center gap-2"><input className="input" inputMode="decimal" value={f.cost} onChange={set("cost")} />
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={f.show_cost} onChange={set("show_cost")} className="accent-[var(--accent)]" />public</label></div>
          </label>
          <label className="space-y-1.5"><span className="label">Power gain (hp, if measured/known)</span><input className="input" inputMode="numeric" value={f.hp_gain} onChange={set("hp_gain")} /></label>
          <label className="space-y-1.5"><span className="label">Torque gain (lb-ft)</span><input className="input" inputMode="numeric" value={f.torque_gain} onChange={set("torque_gain")} /></label>
        </div>
        <label className="block space-y-1.5"><span className="label">Description</span><textarea className="input min-h-20" value={f.description} onChange={set("description")} /></label>
        <label className="block space-y-1.5"><span className="label">Performance impact notes</span><input className="input" value={f.performance_notes} onChange={set("performance_notes")} placeholder="Dyno-verified +18 whp at 6,800 rpm" /></label>
        <label className="block space-y-1.5"><span className="label">Photos</span>
          <input type="file" accept="image/*" multiple className="input" onChange={(e) => setFiles([...(e.target.files ?? [])])} />
        </label>
        {visual && (
          <div className="rounded-xl border border-line p-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={apply3d} onChange={(e) => setApply3d(e.target.checked)} className="accent-[var(--accent)]" /> Update the 3D model to show this part</label>
            {apply3d && <div className="mt-4"><ModelConfigurator bodyStyle={bodyStyle} config={config} onBodyStyle={setBodyStyle} onChange={setConfig} /></div>}
          </div>
        )}
        {err && <p className="text-sm text-bad">{err}</p>}
        <div className="flex justify-between gap-2">
          {mod ? <button type="button" className="btn-quiet !text-bad" onClick={remove} disabled={busy}><Trash2 size={16} /> Remove</button> : <span />}
          <button className="btn-primary" disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />} Save</button>
        </div>
      </form>
    </Modal>
  );
}
