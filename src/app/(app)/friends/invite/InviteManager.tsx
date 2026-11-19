"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download, Link2, Loader2, QrCode, Share2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Invite } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"; // no 0/O/1/l/I
function newCode(n = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
const live = (i: Invite) => !i.revoked_at && (!i.expires_at || new Date(i.expires_at) > new Date()) && (i.max_uses == null || i.uses < i.max_uses);

export function InviteManager({ userId, username, siteUrl, invites, joined }: { userId: string; username: string; siteUrl: string; invites: Invite[]; joined: string[] }) {
  const router = useRouter();
  const [origin, setOrigin] = useState(siteUrl.replace(/\/$/, ""));
  useEffect(() => { if (!origin) setOrigin(window.location.origin); }, [origin]);
  const url = (code: string) => `${origin}/invite/${code}`;
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [qr, setQr] = useState<Invite | null>(null);
  const [meet, setMeet] = useState({ label: "", max: "", days: "1" });

  async function create(kind: "personal" | "meet") {
    setBusy(kind); setErr(null);
    const row: Partial<Invite> = kind === "personal"
      ? { code: newCode(), owner_id: userId, kind }
      : { code: newCode(), owner_id: userId, kind, label: meet.label.trim() || "Car meet", max_uses: meet.max ? Math.min(5000, Math.max(1, Number(meet.max))) : null, expires_at: meet.days ? new Date(Date.now() + Number(meet.days) * 86400e3).toISOString() : null };
    const { data, error } = await createClient().from("invites").insert(row).select().single();
    setBusy(null);
    if (error) { setErr(error.message.includes("row-level") ? "You've made a lot of invites today. Try again tomorrow." : error.message); return; }
    if (kind === "meet") { setQr(data as Invite); setMeet({ label: "", max: "", days: "1" }); } else await copy(data.code);
    router.refresh();
  }
  async function revoke(code: string) {
    if (!confirm("Turn this invite off? The link and QR code stop working.")) return;
    await createClient().from("invites").update({ revoked_at: new Date().toISOString() }).eq("code", code);
    router.refresh();
  }
  async function copy(code: string) {
    await navigator.clipboard.writeText(url(code)).catch(() => {});
    setCopied(code); setTimeout(() => setCopied(null), 1800);
  }
  async function share(code: string) {
    if (navigator.share) await navigator.share({ title: "Join me on RevMatch", text: `Add your car and follow my build. I'm @${username}.`, url: url(code) }).catch(() => {});
    else await copy(code);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="panel panel-accent space-y-3 p-5">
        <div className="flex items-center gap-2"><Link2 size={18} className="text-accent" /><h2 className="h-display text-xl">Invite a friend</h2></div>
        <p className="text-sm text-muted">A personal link. When they sign up with it, you&apos;re friends straight away, so you can see each other&apos;s friends-only cars and drives.</p>
        <button type="button" className="btn-primary" disabled={!!busy} onClick={() => create("personal")}>{busy === "personal" ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />} Make a link and copy it</button>
      </section>

      <section className="panel space-y-3 p-5">
        <div className="flex items-center gap-2"><QrCode size={18} className="text-accent" /><h2 className="h-display text-xl">Car meet QR code</h2></div>
        <p className="text-sm text-muted">Print it or put it on your phone. People who scan it sign up (or sign in) and follow you.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1.5 sm:col-span-3"><span className="label">Meet name</span><input className="input" maxLength={80} placeholder="Sunday Cars & Coffee" value={meet.label} onChange={(e) => setMeet({ ...meet, label: e.target.value })} /></label>
          <label className="space-y-1.5"><span className="label">Max sign-ups</span><input className="input" type="number" min={1} max={5000} placeholder="No limit" value={meet.max} onChange={(e) => setMeet({ ...meet, max: e.target.value })} /></label>
          <label className="space-y-1.5 sm:col-span-2"><span className="label">Works for</span>
            <select className="input" value={meet.days} onChange={(e) => setMeet({ ...meet, days: e.target.value })}><option value="1">1 day</option><option value="3">3 days</option><option value="7">1 week</option><option value="30">30 days</option><option value="">Until I turn it off</option></select>
          </label>
        </div>
        <button type="button" className="btn-primary" disabled={!!busy} onClick={() => create("meet")}>{busy === "meet" ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />} Make QR code</button>
      </section>

      {err && <p className="text-sm text-bad lg:col-span-2" role="alert">{err}</p>}

      <section className="panel lg:col-span-2">
        <div className="label px-5 py-3">Your invites</div>
        {invites.length === 0 ? <p className="px-5 pb-5 text-sm text-muted">None yet.</p> : (
          <ul className="divide-y divide-line">
            {invites.map((i) => (
              <li key={i.code} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{i.kind === "meet" ? i.label ?? "Car meet" : "Friend link"} {!live(i) && <span className="chip ml-1">{i.revoked_at ? "off" : "used up or expired"}</span>}</div>
                  <div className="truncate font-mono text-xs text-muted">{url(i.code)}</div>
                  <div className="text-xs text-dim">{i.uses} joined{i.max_uses ? ` of ${i.max_uses}` : ""}{i.expires_at ? ` · ${new Date(i.expires_at) > new Date() ? "until" : "ended"} ${new Date(i.expires_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : ""}</div>
                </div>
                {live(i) && <>
                  <button type="button" className="btn-quiet !py-2" onClick={() => copy(i.code)}><Copy size={14} /> {copied === i.code ? "Copied" : "Copy"}</button>
                  <button type="button" className="btn-quiet !py-2" onClick={() => share(i.code)}><Share2 size={14} /> Share</button>
                  <button type="button" className="btn-quiet !py-2" onClick={() => setQr(i)}><QrCode size={14} /> QR</button>
                  <button type="button" className="btn-quiet !py-2 hover:text-bad" onClick={() => revoke(i.code)} aria-label="Turn off"><X size={14} /></button>
                </>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {joined.length > 0 && (
        <section className="panel p-5 lg:col-span-2">
          <div className="label mb-3">Joined through you · {joined.length}</div>
          <div className="flex flex-wrap gap-2">{joined.map((u) => <Link key={u} href={`/u/${u}`} className="chip hover:border-accent">@{u}</Link>)}</div>
        </section>
      )}

      <Modal open={!!qr} onClose={() => setQr(null)} title={qr?.kind === "meet" ? qr.label ?? "Car meet" : "Invite QR"}>
        {qr && <InviteQr url={url(qr.code)} title={qr.kind === "meet" ? qr.label ?? "Car meet" : `@${username}`} />}
      </Modal>
    </div>
  );
}

function InviteQr({ url, title }: { url: string; title: string }) {
  const [png, setPng] = useState<string | null>(null);
  useEffect(() => { QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 1024, color: { dark: "#0a0b0d", light: "#ffffff" } }).then(setPng); }, [url]);
  return (
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-[300px] rounded-2xl bg-white p-4 text-center text-black">
        {png ? <img src={png} alt={`QR code to join RevMatch: ${title}`} className="w-full" /> : <div className="aspect-square" />}
        <div className="mt-2 text-lg font-bold">{title}</div>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.25em]">Scan to join · RevMatch</div>
      </div>
      <p className="break-all text-center font-mono text-xs text-muted">{url}</p>
      {png && <div className="flex justify-center"><a className="btn-primary" href={png} download="revmatch-invite-qr.png"><Download size={16} /> Download PNG</a></div>}
    </div>
  );
}
