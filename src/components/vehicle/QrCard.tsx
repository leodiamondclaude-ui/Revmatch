"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, Share2 } from "lucide-react";

/** QR that encodes only the public, unguessable vehicle URL — no IDs or owner data. */
export function QrCard({ slug, siteUrl, name, accent }: { slug: string; siteUrl: string; name: string; accent: string }) {
  const url = `${(siteUrl || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "")}/v/${slug}`;
  const [png, setPng] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    const opts = { errorCorrectionLevel: "H" as const, margin: 2, color: { dark: "#0a0b0d", light: "#ffffff" } };
    QRCode.toDataURL(url, { ...opts, width: 1024 }).then(setPng);
    QRCode.toString(url, { ...opts, type: "svg" }).then(setSvg);
  }, [url]);
  const file = name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  async function share() {
    if (navigator.share) await navigator.share({ title: name, url }).catch(() => {});
    else await navigator.clipboard.writeText(url);
  }
  return (
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-[280px] rounded-2xl p-[3px]" style={{ background: `linear-gradient(135deg, ${accent}, #111)` }}>
        <div className="rounded-[14px] bg-white p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {png ? <img src={png} alt={`QR code for ${name}`} className="w-full" /> : <div className="aspect-square" />}
          <div className="mt-2 text-center font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-black">Scan the build · RevMatch</div>
        </div>
      </div>
      <p className="break-all text-center font-mono text-xs text-muted">{url}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {png && <a className="btn-ghost" href={png} download={`${file}-qr.png`}><Download size={16} /> PNG</a>}
        {svg && <a className="btn-ghost" href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} download={`${file}-qr.svg`}><Download size={16} /> SVG</a>}
        <button type="button" className="btn-primary" onClick={share}><Share2 size={16} /> Share link</button>
      </div>
      <p className="text-center text-xs text-dim">The code opens this vehicle&apos;s public page only. If you make the vehicle private, the code stops showing anything.</p>
    </div>
  );
}
