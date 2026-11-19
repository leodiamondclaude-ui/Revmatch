import Link from "next/link";
import { redirect } from "next/navigation";
import { Car, Gauge, QrCode, Users } from "lucide-react";
import { VehicleCard } from "@/components/garage/VehicleCard";
import type { Vehicle } from "@/lib/types";
import { Logo } from "@/components/ui/Logo";
import { HeroShowcase } from "@/components/landing/HeroShowcase";
import { getViewer } from "@/lib/viewer";

const STEPS = [
  { n: "01", title: "Snap four photos", body: "Front corner, rear corner, the cabin from the driver's seat, and under the hood. That's it." },
  { n: "02", title: "Check what we spotted", body: "Paint, wheels, calipers, headlights, lip, spoiler, stance, seats. Tick what's right, fix what isn't. Nothing goes public until you say so." },
  { n: "03", title: "Add your mods in plain words", body: "Type \u201cStage 2 tune\u201d or \u201ccoilovers\u201d, hit add, keep going. We sort them into the build sheet." },
];

const FEATURES = [
  { icon: Car, title: "A real build sheet", body: "Specs, mods, wishlist, dyno sheets, shop credits and the story behind the car, on one page that's actually worth sending people to." },
  { icon: Gauge, title: "Drives from your phone", body: "Record with GPS and get the route, speed trace and best runs. Routes are trimmed near home, and drives stay private until you share them." },
  { icon: QrCode, title: "QR codes for meets", body: "Stick your car's code on the dash so people can scan the build. Running a meet? Make a sign-up code for it." },
  { icon: Users, title: "Your people, not an algorithm", body: "Follow builds, add friends, and see likes and comments on your mod drops. Block and report work from day one." },
];

export default async function Landing() {
  const { supabase, user } = await getViewer();
  if (user) redirect("/dashboard");
  // Real member builds with their own photos. Only shown once there are enough to look like a scene.
  const { data: fresh } = supabase
    ? await supabase.from("vehicles").select("*, owner:profiles!vehicles_owner_id_fkey(username), modifications(count)").eq("visibility", "public").not("cover_photo_url", "is", null).order("updated_at", { ascending: false }).limit(6)
    : { data: null };
  const builds = (fresh ?? []) as (Vehicle & { owner: { username: string } | null; modifications: { count: number }[] })[];
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="absolute inset-x-0 top-0 z-30">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex items-center gap-2">
            <Link href="/login" className="btn-quiet whitespace-nowrap">Sign in</Link>
            <Link href="/signup" className="btn-primary whitespace-nowrap !px-3 !py-2 sm:!px-4"><span className="sm:hidden">Join</span><span className="hidden sm:inline">Open garage</span></Link>
          </div>
        </div>
      </header>

      <section className="relative pt-16 lg:grid lg:min-h-[100dvh] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-center lg:pt-0">
        <div className="speed-lines pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute right-0 top-1/3 hidden h-96 w-[50rem] rounded-full bg-accent/10 blur-3xl lg:block" />
        <div className="relative mx-auto max-w-6xl px-4 pt-8 sm:pt-14 lg:ml-[max(1rem,calc((100vw-72rem)/2))] lg:mr-0 lg:pt-0">
          <div className="rise chip-accent">For people who can&apos;t stop modding</div>
          <h1 className="rise rise-1 h-display mt-5 max-w-4xl text-5xl leading-[0.9] sm:text-7xl lg:text-6xl xl:text-7xl">
            Show off<br /><span className="text-accent glow-text">the whole build.</span>
          </h1>
          <p className="rise rise-2 mt-5 max-w-xl text-base text-muted sm:text-lg">
            Four photos and RevMatch drafts your spec sheet. Add your mods in plain words, log drives on your phone, and hand people a QR code at the next meet. The whole app picks up your paint colour.
          </p>
          <div className="rise rise-3 mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary">Start your garage</Link>
            <a href="#how" className="btn-ghost">How it works</a>
          </div>
          <p className="rise rise-3 mt-3 text-xs text-dim">Free. Takes about two minutes per car.</p>
        </div>
        <div className="rise rise-4 relative mt-4 lg:mt-0"><HeroShowcase /></div>
      </section>

      <section id="how" className="mx-auto max-w-6xl px-4 pt-20">
        <h2 className="h-display text-4xl sm:text-5xl">Two minutes from driveway to build page</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="border-t-2 border-accent pt-4">
              <div className="num text-sm text-accent">{s.n}</div>
              <h3 className="h-display mt-1 text-2xl">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {builds.length >= 3 && (
        <section className="mx-auto max-w-6xl px-4 pt-20">
          <h2 className="h-display text-4xl sm:text-5xl">Fresh from the garage</h2>
          <p className="mt-2 text-muted">Real cars from real members, photographed by their owners.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {builds.map((v) => <VehicleCard key={v.id} v={v} owner={v.owner?.username} modCount={v.modifications?.[0]?.count} />)}
          </div>
        </section>
      )}

      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="h-display text-4xl sm:text-5xl">What you get</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="panel panel-accent group p-6 transition duration-300 hover:-translate-y-1 hover:border-accent/40">
              <Icon className="text-accent" size={26} />
              <h3 className="h-display mt-4 text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="carbon border-y border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-3">
          {[
            ["No made-up numbers", "Every stat says where it came from: GPS, OBD-II or you. If a drive can't support a 0\u201360 time, we don't show one."],
            ["Private by default", "VIN, plate and what you paid are only ever visible to you. Drives stay private until you share them, with the ends of the route trimmed."],
            ["You have the final say", "Anything our AI guesses from your photos is marked until you confirm it. 3D models aren't public until you approve them."],
          ].map(([t, b]) => (
            <div key={t}>
              <div className="h-display text-2xl text-accent">{t}</div>
              <p className="mt-2 text-sm text-muted">{b}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-10 text-xs text-dim sm:flex-row">
        <Logo />
        <span className="flex gap-4 font-mono uppercase tracking-widest"><Link href="/privacy" className="hover:text-ink">Privacy</Link><Link href="/terms" className="hover:text-ink">Terms</Link></span>
      </footer>
    </div>
  );
}
