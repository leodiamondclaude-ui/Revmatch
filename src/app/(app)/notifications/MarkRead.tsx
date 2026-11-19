"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/** Marks everything read once the page has been seen. The page keeps showing which ones were new. */
export function MarkRead({ userId }: { userId: string }) {
  useEffect(() => {
    createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).is("read_at", null).then(() => {});
  }, [userId]);
  return null;
}
