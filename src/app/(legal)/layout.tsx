import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4"><Logo /><Link href="/" className="btn-quiet">Home</Link></header>
      <main className="legal mx-auto max-w-3xl px-4 pb-20">{children}</main>
    </div>
  );
}
