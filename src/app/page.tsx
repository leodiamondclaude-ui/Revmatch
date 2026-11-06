import Link from "next/link";
import { redirect } from "next/navigation";
import { Box, Cpu, Gauge, QrCode, Sparkles, Users } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { HeroShowcase } from "@/components/landing/HeroShowcase";
import { getViewer } from "@/lib/viewer";

const FEATURES = [
  { icon: Box, title: "Interactive 3D garage", body: "Every car gets a rotatable, zoomable 3D model. Tap the wheels, wing or exhaust and that part's spec sheet opens." },
  { icon: Sparkles, title: "Photo-based identification", body: "Upload front ¾, rear ¾ and side photos. The AI suggests year, make, model, trim and visible mods, and you approve or correct every field." },
  { icon: Gauge, title: "Phone GPS telemetry", body: "Start a drive manually or let auto-detect pick it up. You get speed traces, route maps, elevation and records with a confidence label on each." },
  { icon: Cpu, title: "OBD-II supplement", body: "Pair a BLE ELM327 adapter for RPM, coolant, throttle and load. Only the PIDs your car actually reports are shown." },
  { icon: Users, title: "Built for the scene", body: "Follow builds, add friends, and like or comment on mod drops. Privacy controls are set per car and per drive." },
  { icon: QrCode, title: "QR for car meets", body: "Each car gets a unique QR code that opens its public build sheet. Private data never leaves your account." },
];

export default async function Landing() {
  const { user } = await getViewer();
  if (user) redirect("/dashboard");
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
          <div className="rise chip-accent">Digital garage · Drive telemetry · Car scene</div>
          <h1 className="rise rise-1 h-display mt-5 max-w-4xl text-5xl leading-[0.9] sm:text-7xl lg:text-6xl xl:text-7xl">
            Your build.<br /><span className="text-accent glow-text">In full telemetry.</span>
          </h1>
          <p className="rise rise-2 mt-5 max-w-xl text-base text-muted sm:text-lg">
            RevMatch is a digital garage for enthusiasts: 3D builds, a timeline of every mod, and real drive data recorded on your phone. The interface takes its accent colour from your car&apos;s paint.
          </p>
          <div className="rise rise-3 mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-primary">Start your garage</Link>
            <a href="#features" className="btn-ghost">See the platform</a>
          </div>
        </div>
        <div className="rise rise-4 relative mt-4 lg:mt-0"><HeroShowcase /></div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-20">
        <div className="label text-accent">Platform</div>
        <h2 className="h-display mt-1 text-4xl sm:text-5xl">Configurator × Telemetry × Community</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
            ["Honest data", "Every number shows where it came from (GPS Doppler, position-derived, OBD-II or accelerometer) and how reliable it is. If the samples can't support a 0–60 time, we don't show one."],
            ["Private by default", "Drives are private until you share them. Shared routes have their first and last stretches trimmed so they don't reveal your home or workplace."],
            ["Yours to correct", "AI-generated models and identifications are labelled as approximations. Nothing goes on your profile until you approve it."],
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
        <span className="font-mono uppercase tracking-widest">Built for drivers · Data stays yours</span>
      </footer>
    </div>
  );
}
