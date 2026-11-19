/** Public build-time config (Expo inlines EXPO_PUBLIC_* variables). */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
export const configured = !!(SUPABASE_URL && SUPABASE_ANON_KEY && SITE_URL);
