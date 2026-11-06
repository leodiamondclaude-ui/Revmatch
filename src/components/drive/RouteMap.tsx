"use client";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import { hexToRgb, rgbToHex } from "@/lib/color";

export interface MapPoint { lat: number; lng: number; mps?: number | null }

function Fit({ pts, follow }: { pts: [number, number][]; follow?: boolean }) {
  const map = useMap();
  useEffect(() => {
    if (!pts.length) return;
    if (follow) map.setView(pts[pts.length - 1], Math.max(map.getZoom(), 15), { animate: true });
    else map.fitBounds(L.latLngBounds(pts), { padding: [28, 28] });
  }, [pts, follow, map]);
  return null;
}

function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

/** Slow = cool blue, mid = accent, fastest = white-hot. */
function speedColor(mps: number, max: number, accent: string) {
  if (!max) return accent;
  const t = Math.min(1, mps / max);
  return t < 0.6 ? mix("#3b82f6", accent, t / 0.6) : mix(accent, "#ffffff", (t - 0.6) / 0.4 * 0.7);
}

export default function RouteMap({ points, accent, follow, showEnds = true, colorBySpeed = false, className }: {
  points: MapPoint[]; accent: string; follow?: boolean; showEnds?: boolean; colorBySpeed?: boolean; className?: string;
}) {
  const latlngs = points.map((p) => [p.lat, p.lng] as [number, number]);
  const max = Math.max(0, ...points.map((p) => p.mps ?? 0));
  const segments: { pts: [number, number][]; color: string }[] = [];
  if (colorBySpeed && points.some((p) => p.mps != null)) {
    const chunk = Math.max(2, Math.floor(points.length / 120));
    for (let i = 0; i < points.length - 1; i += chunk) {
      const slice = points.slice(i, i + chunk + 1);
      const avg = slice.reduce((s, p) => s + (p.mps ?? 0), 0) / slice.length;
      segments.push({ pts: slice.map((p) => [p.lat, p.lng]), color: speedColor(avg, max, accent) });
    }
  }
  return (
    <div className={className ?? "h-72 w-full overflow-hidden rounded-xl"}>
      <MapContainer center={latlngs[0] ?? [0, 0]} zoom={latlngs.length ? 14 : 2} scrollWheelZoom className="h-full w-full" attributionControl>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' />
        {segments.length ? segments.map((s, i) => <Polyline key={i} positions={s.pts} pathOptions={{ color: s.color, weight: 5, opacity: 0.95 }} />)
          : latlngs.length > 1 && <Polyline positions={latlngs} pathOptions={{ color: accent, weight: 5, opacity: 0.95 }} />}
        {showEnds && latlngs.length > 0 && (
          <>
            <CircleMarker center={latlngs[0]} radius={7} pathOptions={{ color: "#fff", fillColor: "#3ddc97", fillOpacity: 1, weight: 2 }}><Tooltip>Start</Tooltip></CircleMarker>
            {latlngs.length > 1 && <CircleMarker center={latlngs[latlngs.length - 1]} radius={7} pathOptions={{ color: "#fff", fillColor: accent, fillOpacity: 1, weight: 2 }}><Tooltip>{follow ? "Now" : "Finish"}</Tooltip></CircleMarker>}
          </>
        )}
        <Fit pts={latlngs} follow={follow} />
      </MapContainer>
    </div>
  );
}
