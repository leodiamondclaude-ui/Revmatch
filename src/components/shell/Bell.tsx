"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell as BellIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/** Bell with an unread count. Starts from the server count and goes up live as new notifications arrive. */
export function Bell({ userId, initial }: { userId: string; initial: number }) {
  const [count, setCount] = useState(initial);
  const path = usePathname();
  useEffect(() => setCount(initial), [initial]);
  useEffect(() => { if (path === "/notifications") setCount(0); }, [path]);
  useEffect(() => {
    const sb = createClient();
    const ch = sb.channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => setCount((c) => c + 1))
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [userId]);
  return (
    <Link href="/notifications" className="relative grid h-9 w-9 place-items-center rounded-lg text-muted transition hover:bg-surface-2 hover:text-ink" aria-label={count ? `Notifications, ${count} unread` : "Notifications"}>
      <BellIcon size={19} />
      {count > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 font-mono text-[10px] font-bold text-black">{count > 99 ? "99+" : count}</span>}
    </Link>
  );
}
