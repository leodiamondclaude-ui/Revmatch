import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient, getSessionUser } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Every file under a folder, recursively (Storage lists one level at a time). */
async function listAll(db: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error || !data?.length) break;
    for (const f of data) {
      const path = `${prefix}/${f.name}`;
      if (f.id) out.push(path); else out.push(...(await listAll(db, bucket, path))); // folders have no id
    }
    if (data.length < 1000) break;
  }
  return out;
}

/** Permanently delete the signed-in account: files first, then the user (which cascades to every row they own). */
export async function POST(req: Request) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  const body = z.object({ confirm: z.literal("DELETE") }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 });
  const admin = createServiceClient();
  const files = admin ?? supabase; // the owner can delete their own files too, if the service role isn't set
  for (const bucket of ["vehicle-photos", "vehicle-models", "avatars"]) {
    const paths = await listAll(files, bucket, user.id);
    for (let i = 0; i < paths.length; i += 100) await files.storage.from(bucket).remove(paths.slice(i, i + 100));
  }
  const { error } = admin ? await admin.auth.admin.deleteUser(user.id) : await supabase.rpc("delete_my_account");
  if (error) return NextResponse.json({ error: `Couldn't delete the account: ${error.message}` }, { status: 500 });
  await supabase.auth.signOut();
  return NextResponse.json({ deleted: true });
}
