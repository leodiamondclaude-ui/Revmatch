import { accentVars } from "@/lib/color";

/** Applies accent CSS variables to everything inside it. */
export function AccentScope({ accent, children, className }: { accent: string; children: React.ReactNode; className?: string }) {
  return (
    <div style={accentVars(accent) as React.CSSProperties} className={className}>
      {children}
    </div>
  );
}
