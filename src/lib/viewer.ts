import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { accentFromPaint } from "./color";
import type { Profile, UserSettings, Vehicle } from "./types";

export const supabaseConfigured = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/** Current user + profile + derived accent color. Cached per request. */
export const getViewer = cache(async () => {
  if (!supabaseConfigured()) return { supabase: null, user: null, profile: null, settings: null, accent: "#e10600" } as const;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, settings: null, accent: "#e10600" } as const;
  const [{ data: profile }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<Profile>(),
    supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle<UserSettings>(),
  ]);
  let accent = profile?.accent_color ?? "#e10600";
  if (profile?.accent_mode === "vehicle") {
    let q = supabase.from("vehicles").select("exterior_color_hex").eq("owner_id", user.id);
    q = profile.primary_vehicle_id ? q.eq("id", profile.primary_vehicle_id) : q.order("created_at").limit(1);
    const { data: v } = await q.maybeSingle<Pick<Vehicle, "exterior_color_hex">>();
    if (v?.exterior_color_hex) accent = accentFromPaint(v.exterior_color_hex);
  }
  return { supabase, user, profile, settings, accent } as const;
});

export async function requireViewer() {
  const v = await getViewer();
  if (!v.supabase) redirect("/setup");
  if (!v.user || !v.profile) redirect("/login");
  return { ...v, supabase: v.supabase!, user: v.user!, profile: v.profile!, settings: v.settings };
}

export const integrations = () => ({
  supabase: supabaseConfigured(),
  serviceRole: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  anthropic: !!process.env.ANTHROPIC_API_KEY,
  sketchfab: !!process.env.SKETCHFAB_API_TOKEN,
  meshy: !!process.env.MESHY_API_KEY,
});
