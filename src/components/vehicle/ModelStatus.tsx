"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Vehicle } from "@/lib/types";

/** Owner-only banner: AI generation progress, and the approval gate for imported/generated models. */
export function ModelStatus({ vehicle }: { vehicle: Vehicle }) {
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (vehicle.model_status !== "generating") return;
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/models/status?vehicleId=${vehicle.id}`).then((x) => x.json()).catch(() => null);
      if (stop || !r) return;
      if (r.progress != null) setProgress(r.progress);
      if (r.error) setErr(r.error);
      if (r.status !== "generating") { router.refresh(); return; }
      setTimeout(tick, 8000);
    };
    tick();
    return () => { stop = true; };
  }, [vehicle.model_status, vehicle.id, router]);

  async function decide(approve: boolean) {
    const supabase = createClient();
    await supabase.from("vehicles").update(approve ? { model_approved: true } : { model_url: null, model_source: "procedural", model_approved: true, model_status: "ready" }).eq("id", vehicle.id);
    router.refresh();
  }

  if (vehicle.model_status === "generating") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 p-3 text-sm">
        <Loader2 className="animate-spin text-accent" size={18} />
        <div className="flex-1">Generating AI 3D model from your photos{progress != null ? ` · ${progress}%` : "…"} <span className="text-muted">You can leave this page.</span>{err && <div className="text-xs text-warn">{err}</div>}</div>
      </div>
    );
  }
  if (vehicle.model_status === "failed") {
    return <div className="rounded-xl border border-bad/40 bg-bad/10 p-3 text-sm">3D model import or generation failed. The parametric model is shown instead. You can retry from Edit → 3D.</div>;
  }
  if (vehicle.model_url && !vehicle.model_approved) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm">
        <div className="flex-1">
          <b>Review your {vehicle.model_source === "ai" ? "AI-generated" : "imported"} model.</b> It&apos;s an approximation, not a scan of your car. Keep it, or switch back to the editable parametric model.
          <div className="text-xs text-muted">Visitors see a &ldquo;pending review&rdquo; label until you approve it.</div>
        </div>
        <button type="button" className="btn-quiet" onClick={() => decide(false)}>Use parametric</button>
        <button type="button" className="btn-primary" onClick={() => decide(true)}>Approve model</button>
      </div>
    );
  }
  return null;
}
