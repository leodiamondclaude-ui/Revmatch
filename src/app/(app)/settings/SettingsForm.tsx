"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareImage, uid } from "@/lib/image";
import { accentFromPaint, accentVars, PAINT_SWATCHES } from "@/lib/color";
import type { Profile, UserSettings, Vehicle } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";

const DEFAULTS = { units: "imperial", auto_detect: false, auto_action: "prompt", auto_min_speed_kph: 20, auto_min_duration_s: 20, auto_stop_idle_s: 180, min_sample_distance_m: 3, max_accuracy_m: 35, default_drive_visibility: "private", default_share_route: false, endpoint_privacy_m: 400 } as const;

export function SettingsForm({ profile, settings, vehicles, email }: { profile: Profile; settings: UserSettings | null; vehicles: Vehicle[]; email: string }) {
  const router = useRouter();
  const [p, setP] = useState(profile);
  const [s, setS] = useState({ ...DEFAULTS, ...(settings ?? {}) } as UserSettings);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const primary = vehicles.find((v) => v.id === p.primary_vehicle_id) ?? vehicles[0];
  const accent = p.accent_mode === "custom" ? p.accent_color : accentFromPaint(primary?.exterior_color_hex);

  async function save() {
    setBusy(true); setMsg(null);
    const supabase = createClient();
    const clean = p.username.toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(clean)) { setBusy(false); setMsg({ ok: false, t: "Username must be 3–24 letters, numbers or underscores." }); return; }
    const [a, b] = await Promise.all([
      supabase.from("profiles").update({ username: clean, display_name: p.display_name, bio: p.bio, location: p.location, is_private: p.is_private, accent_mode: p.accent_mode, accent_color: p.accent_color, primary_vehicle_id: p.primary_vehicle_id, avatar_url: p.avatar_url }).eq("id", p.id),
      supabase.from("user_settings").upsert({ ...s, user_id: p.id, updated_at: new Date().toISOString() }),
    ]);
    setBusy(false);
    const err = a.error ?? b.error;
    setMsg(err ? { ok: false, t: err.code === "23505" ? "That username is taken." : err.message } : { ok: true, t: "Settings saved." });
    router.refresh();
  }
  async function avatar(file: File | undefined) {
    if (!file) return;
    const supabase = createClient();
    const { blob } = await prepareImage(file, 512, 0.9);
    const path = `${p.id}/${uid()}.jpg`;
    const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/jpeg" });
    if (error) { setMsg({ ok: false, t: error.message }); return; }
    setP({ ...p, avatar_url: supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl });
  }
  const num = (k: keyof UserSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  const kphLabel = (k: number) => (s.units === "imperial" ? `${Math.round(k / 1.609)} mph` : `${k} km/h`);

  return (
    <div className="space-y-6" style={accentVars(accent) as React.CSSProperties}>
      <section className="panel p-5">
        <h2 className="h-display mb-4 text-xl">Profile</h2>
        <div className="flex flex-col gap-5 sm:flex-row">
          <label className="group relative h-24 w-24 shrink-0 cursor-pointer">
            <Avatar url={p.avatar_url} name={p.display_name ?? p.username} size={96} />
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/60 opacity-0 transition group-hover:opacity-100"><Camera size={20} /></span>
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => avatar(e.target.files?.[0])} />
          </label>
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1.5"><span className="label">Username</span><input className="input" value={p.username} onChange={(e) => setP({ ...p, username: e.target.value })} /></label>
            <label className="space-y-1.5"><span className="label">Display name</span><input className="input" value={p.display_name ?? ""} onChange={(e) => setP({ ...p, display_name: e.target.value || null })} /></label>
            <label className="space-y-1.5 sm:col-span-2"><span className="label">Bio</span><textarea className="input min-h-20" maxLength={500} value={p.bio ?? ""} onChange={(e) => setP({ ...p, bio: e.target.value || null })} /></label>
            <label className="space-y-1.5"><span className="label">Location (optional)</span><input className="input" placeholder="City or region, not your address" value={p.location ?? ""} onChange={(e) => setP({ ...p, location: e.target.value || null })} /></label>
            <label className="space-y-1.5"><span className="label">Email</span><input className="input opacity-60" value={email} disabled /></label>
          </div>
        </div>
        <label className="mt-5 flex items-start gap-3 rounded-xl border border-line p-4">
          <input type="checkbox" checked={p.is_private} onChange={(e) => setP({ ...p, is_private: e.target.checked })} className="mt-1 accent-[var(--accent)]" />
          <span><b>Private profile</b><span className="block text-sm text-muted">Only approved followers and friends see your garage list and activity. Vehicles you mark public stay reachable by their QR link.</span></span>
        </label>
      </section>

      <section className="panel p-5">
        <h2 className="h-display mb-1 text-xl">Interface</h2>
        <p className="mb-4 text-sm text-muted">The accent colour is used for gauges, highlights and charts.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setP({ ...p, accent_mode: "vehicle" })} className={`rounded-xl border p-4 text-left ${p.accent_mode === "vehicle" ? "border-accent" : "border-line"}`}>
            <div className="font-semibold">Match my car</div><div className="text-xs text-muted">Derived from your primary vehicle&apos;s paint and tuned for contrast on dark backgrounds.</div>
          </button>
          <button type="button" onClick={() => setP({ ...p, accent_mode: "custom" })} className={`rounded-xl border p-4 text-left ${p.accent_mode === "custom" ? "border-accent" : "border-line"}`}>
            <div className="font-semibold">Custom accent</div><div className="text-xs text-muted">Pick any colour.</div>
          </button>
        </div>
        {p.accent_mode === "vehicle" ? (
          <label className="mt-4 block space-y-1.5"><span className="label">Primary vehicle</span>
            <select className="input" value={p.primary_vehicle_id ?? ""} onChange={(e) => setP({ ...p, primary_vehicle_id: e.target.value || null })}>
              {vehicles.length === 0 && <option value="">Add a vehicle first</option>}
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nickname || `${v.year ?? ""} ${v.make} ${v.model}`}</option>)}
            </select>
          </label>
        ) : (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input type="color" value={p.accent_color} onChange={(e) => setP({ ...p, accent_color: e.target.value })} className="h-10 w-14 cursor-pointer rounded border border-line bg-transparent" />
            {PAINT_SWATCHES.map((c) => <button key={c.hex} type="button" title={c.name} onClick={() => setP({ ...p, accent_color: accentFromPaint(c.hex) })} className="h-7 w-7 rounded-full border border-white/20" style={{ background: accentFromPaint(c.hex) }} />)}
          </div>
        )}
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
          <div className="h-2 flex-1 rounded-full bg-accent shadow-[0_0_14px_var(--accent)]" />
          <span className="num text-xs text-accent">{accent}</span>
        </div>
      </section>

      <section id="tracking" className="panel p-5">
        <h2 className="h-display mb-4 text-xl">Drive tracking &amp; privacy</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5"><span className="label">Units</span>
            <select className="input" value={s.units} onChange={(e) => setS({ ...s, units: e.target.value as UserSettings["units"] })}><option value="imperial">Imperial (mi, mph)</option><option value="metric">Metric (km, km/h)</option></select>
          </label>
          <label className="space-y-1.5"><span className="label">Default drive visibility</span>
            <select className="input" value={s.default_drive_visibility} onChange={(e) => setS({ ...s, default_drive_visibility: e.target.value as UserSettings["default_drive_visibility"] })}><option value="private">Private</option><option value="friends">Friends</option><option value="public">Public</option></select>
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-line p-3 sm:col-span-2"><input type="checkbox" checked={s.auto_detect} onChange={(e) => setS({ ...s, auto_detect: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-sm"><b>Automatic trip detection</b> on the Drive screen</span></label>
          <label className="space-y-1.5"><span className="label">When a trip is detected</span>
            <select className="input" value={s.auto_action} onChange={(e) => setS({ ...s, auto_action: e.target.value as UserSettings["auto_action"] })}><option value="prompt">Ask me first</option><option value="auto">Start recording automatically</option></select>
          </label>
          <label className="space-y-1.5"><span className="label">Detection speed · {kphLabel(s.auto_min_speed_kph)}</span><input type="range" min={8} max={60} value={s.auto_min_speed_kph} onChange={num("auto_min_speed_kph")} className="w-full accent-[var(--accent)]" /></label>
          <label className="space-y-1.5"><span className="label">Sustained for · {s.auto_min_duration_s}s</span><input type="range" min={5} max={120} step={5} value={s.auto_min_duration_s} onChange={num("auto_min_duration_s")} className="w-full accent-[var(--accent)]" /></label>
          <label className="space-y-1.5"><span className="label">Auto-stop after idle · {Math.round(s.auto_stop_idle_s / 60)} min</span><input type="range" min={60} max={900} step={30} value={s.auto_stop_idle_s} onChange={num("auto_stop_idle_s")} className="w-full accent-[var(--accent)]" /></label>
          <label className="space-y-1.5"><span className="label">Minimum movement between points · {s.min_sample_distance_m} m</span><input type="range" min={1} max={25} value={s.min_sample_distance_m} onChange={num("min_sample_distance_m")} className="w-full accent-[var(--accent)]" /></label>
          <label className="space-y-1.5"><span className="label">Discard fixes worse than · ±{s.max_accuracy_m} m</span><input type="range" min={10} max={100} step={5} value={s.max_accuracy_m} onChange={num("max_accuracy_m")} className="w-full accent-[var(--accent)]" /></label>
          <label className="space-y-1.5"><span className="label">Hide route near start/finish · {s.endpoint_privacy_m} m</span><input type="range" min={100} max={2000} step={50} value={s.endpoint_privacy_m} onChange={num("endpoint_privacy_m")} className="w-full accent-[var(--accent)]" /></label>
          <label className="flex items-center gap-3 rounded-lg border border-line p-3"><input type="checkbox" checked={s.default_share_route} onChange={(e) => setS({ ...s, default_share_route: e.target.checked })} className="accent-[var(--accent)]" />
            <span className="text-sm">Share trimmed route maps by default</span></label>
        </div>
        <p className="mt-3 text-xs text-dim">Raw GPS samples are only readable by you. Changing the privacy radius applies to new drives; use “recompute” on older drives to apply it.</p>
      </section>

      <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 lg:bottom-4">
        {msg && <span className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.t}</span>}
        <button type="button" className="btn-primary" onClick={save} disabled={busy}>{busy && <Loader2 size={16} className="animate-spin" />} Save settings</button>
      </div>
    </div>
  );
}
