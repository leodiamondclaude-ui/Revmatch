import Link from "next/link";
import { getViewer } from "@/lib/viewer";
import { AccentScope } from "@/components/ui/AccentScope";
import { Logo } from "@/components/ui/Logo";
import { Avatar } from "@/components/ui/Avatar";
import { NavLinks } from "./NavLinks";

/** App chrome. Signed-in: side rail (desktop) + bottom bar (mobile). Signed-out: slim top bar. */
export async function Shell({ children, accent: override }: { children: React.ReactNode; accent?: string }) {
  const { user, profile, accent } = await getViewer();
  const a = override ?? accent;
  if (!user || !profile) {
    return (
      <AccentScope accent={a} className="min-h-dvh">
        <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Logo />
            <div className="flex gap-2">
              <Link href="/login" className="btn-quiet">Sign in</Link>
              <Link href="/signup" className="btn-primary !py-2">Join</Link>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </AccentScope>
    );
  }
  return (
    <AccentScope accent={a} className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-surface/60 backdrop-blur lg:flex">
        <div className="flex h-16 items-center px-5"><Logo href="/dashboard" /></div>
        <NavLinks variant="rail" />
        <Link href={`/u/${profile.username}`} className="m-3 flex items-center gap-3 rounded-xl border border-line p-3 transition hover:border-accent/50">
          <Avatar url={profile.avatar_url} name={profile.display_name ?? profile.username} size={36} />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{profile.display_name ?? profile.username}</div>
            <div className="truncate font-mono text-[11px] text-muted">@{profile.username}</div>
          </div>
        </Link>
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur lg:hidden">
        <Logo href="/dashboard" />
        <Link href={`/u/${profile.username}`}><Avatar url={profile.avatar_url} name={profile.display_name ?? profile.username} size={32} /></Link>
      </header>
      <div className="lg:pl-60">
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>
      </div>
      <NavLinks variant="bar" />
    </AccentScope>
  );
}
