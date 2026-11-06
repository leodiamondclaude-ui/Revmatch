import { Shell } from "@/components/shell/Shell";

export const dynamic = "force-dynamic";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <Shell>{children}</Shell>;
}
