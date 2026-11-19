import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { Avatar } from "@/components/ui/Avatar";
import { AcceptInvite } from "./AcceptInvite";

export const metadata = { title: "You're invited", robots: { index: false } };

type Info = { kind: "personal" | "meet"; label: string | null; host_username: string; host_display_name: string | null; host_avatar_url: string | null; valid: boolean };

export default async function InviteLanding({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { supabase, user } = await getViewer();
  const clean = /^[A-Za-z0-9]{6,16}$/.test(code) ? code : "";
  const { data } = supabase && clean ? await supabase.rpc("invite_info", { c: clean }) : { data: null };
  const info = (data as Info[] | null)?.[0];
  const host = info ? info.host_display_name ?? info.host_username : "";

  if (!info || !info.valid) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-10 text-center">
        <h1 className="h-display text-3xl">This invite doesn&apos;t work any more</h1>
        <p className="text-muted">It may have expired, hit its sign-up limit, or been turned off. Ask whoever sent it for a new one.</p>
        <Link href={user ? "/dashboard" : "/signup"} className="btn-primary">{user ? "Back to your garage" : "Sign up anyway"}</Link>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md py-8">
      <div className="panel panel-accent space-y-5 p-6 text-center">
        <div className="flex justify-center"><Avatar url={info.host_avatar_url} name={host} size={72} /></div>
        {info.kind === "meet" ? (
          <div><div className="label text-accent">{info.label ?? "Car meet"}</div><h1 className="h-display mt-1 text-3xl">Join {host} on RevMatch</h1></div>
        ) : (
          <h1 className="h-display text-3xl">{host} invited you to RevMatch</h1>
        )}
        <p className="text-muted">Add your car, show off the build, and log drives. {info.kind === "meet" ? `You'll follow @${info.host_username} when you join.` : `You and @${info.host_username} will be friends as soon as you join.`}</p>
        {user ? <AcceptInvite code={clean} kind={info.kind} host={info.host_username} /> : (
          <div className="space-y-2">
            <Link href={`/signup?invite=${clean}`} className="btn-primary w-full">Create my account</Link>
            <Link href={`/login?next=${encodeURIComponent(`/invite/${clean}`)}`} className="btn-quiet w-full">I already have an account</Link>
          </div>
        )}
      </div>
    </div>
  );
}
