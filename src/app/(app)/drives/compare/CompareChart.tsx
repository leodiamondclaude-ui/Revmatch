"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { speedUnit, toSpeed, type Units } from "@/lib/units";

export function CompareChart({ series, units }: { series: { id: string; color: string; data: [number, number, string][] }[]; units: Units }) {
  return (
    <div className="panel p-5">
      <div className="label mb-3">Speed vs elapsed time ({speedUnit(units)})</div>
      <div className="h-72">
        <ResponsiveContainer>
          <LineChart margin={{ left: -18, right: 6 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="t" type="number" allowDuplicatedCategory={false} tickFormatter={(s) => `${Math.floor(s / 60)}m`} tick={{ fill: "#8a9099", fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: "#8a9099", fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ background: "#14171b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
            {series.map((s) => (
              <Line key={s.id} data={s.data.map(([t, v]) => ({ t, v: +toSpeed(v, units).toFixed(1) }))} dataKey="v" stroke={s.color} dot={false} strokeWidth={1.6} name="speed" />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
