"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useMemo } from "react";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

type Client = ReturnType<typeof createClient>;

/**
 * Client handle that is only constructed on first use (inside event handlers/effects),
 * so components can hold it at render time without touching Supabase during SSR.
 */
export function useSupabase(): Client {
  return useMemo(() => {
    let real: Client | null = null;
    return new Proxy({} as Client, {
      get(_t, prop) {
        real ??= createClient();
        const v = (real as unknown as Record<PropertyKey, unknown>)[prop];
        return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
      },
    });
  }, []);
}
