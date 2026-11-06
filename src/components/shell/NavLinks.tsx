"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Car, Gauge, LayoutDashboard, Route, Settings, Users } from "lucide-react";

const ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, bar: true },
  { href: "/garage", label: "Garage", icon: Car, bar: true },
  { href: "/drive", label: "Drive", icon: Gauge, bar: true, hero: true },
  { href: "/drives", label: "Drives", icon: Route, bar: false },
  { href: "/feed", label: "Feed", icon: Activity, bar: true },
  { href: "/friends", label: "Friends", icon: Users, bar: true },
  { href: "/settings", label: "Settings", icon: Settings, bar: false },
];

export function NavLinks({ variant }: { variant: "rail" | "bar" }) {
  const path = usePathname();
  const active = (h: string) => path === h || path.startsWith(h + "/");
  if (variant === "rail") {
    return (
      <nav className="flex-1 space-y-1 px-3 py-2">
        {ITEMS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} data-on={active(href)}
            className="group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-muted transition hover:bg-surface-2 hover:text-ink data-[on=true]:bg-surface-2 data-[on=true]:text-ink">
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-accent opacity-0 shadow-[0_0_12px_var(--accent)] transition group-data-[on=true]:opacity-100" />
            <Icon size={18} className="group-data-[on=true]:text-accent" />
            <span className="font-medium tracking-wide">{label}</span>
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="mx-auto grid max-w-md grid-cols-5">
        {ITEMS.filter((i) => i.bar).map(({ href, label, icon: Icon, hero }) => (
          <Link key={href} href={href} data-on={active(href)} className="group flex flex-col items-center gap-1 py-2.5 text-[10px] uppercase tracking-widest text-muted data-[on=true]:text-ink">
            {hero ? (
              <span className="-mt-6 grid h-12 w-12 place-items-center rounded-full bg-accent text-black shadow-[0_8px_24px_-6px_var(--accent)]"><Icon size={22} /></span>
            ) : (
              <Icon size={20} className="group-data-[on=true]:text-accent" />
            )}
            <span className="font-mono">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
