import { integrations } from "@/lib/viewer";
import { Logo } from "@/components/ui/Logo";

export const dynamic = "force-dynamic";

export default function Setup() {
  const i = integrations();
  const rows: [string, boolean, string, string][] = [
    ["Supabase (auth, database, storage)", i.supabase, "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY", "Required"],
    ["Supabase service role (model import)", i.serviceRole, "SUPABASE_SERVICE_ROLE_KEY", "Needed for library and AI 3D model import"],
    ["Claude vision (vehicle identification)", i.anthropic, "ANTHROPIC_API_KEY", "Optional"],
    ["Sketchfab (existing 3D models)", i.sketchfab, "SKETCHFAB_API_TOKEN", "Optional"],
    ["Meshy (AI image-to-3D)", i.meshy, "MESHY_API_KEY", "Optional"],
  ];
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <Logo />
      <h1 className="h-display mt-8 text-4xl">Platform setup</h1>
      <p className="mt-2 text-muted">Integration status for this deployment. See <code className="font-mono">README.md</code> for setup steps.</p>
      <div className="panel mt-8 divide-y divide-line">
        {rows.map(([name, ok, env, note]) => (
          <div key={name} className="flex items-start justify-between gap-4 p-4">
            <div>
              <div className="font-semibold">{name}</div>
              <div className="font-mono text-xs text-muted">{env}</div>
              <div className="text-xs text-dim">{note}</div>
            </div>
            <span className={ok ? "chip !border-ok/50 !text-ok" : "chip !border-warn/50 !text-warn"}>{ok ? "Configured" : "Missing"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
